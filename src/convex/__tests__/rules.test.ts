// Targeted tests for the versioned rules-knowledge-base pipeline.
// Run: npm run test (vitest)

import { describe, it, expect } from "vitest";
import {
  RULE_RECORDS,
  EXCEPTIONS,
  AMENDMENTS,
  KB_VERSION,
  KB_SOURCES,
  scopeLabel,
} from "../rulesKnowledgeBase";
import {
  REQUIREMENTS,
  validateField,
  crossCheck,
  gtinChecksumValid,
  gtinPrefixRegion,
  type VisionAnalysis,
  type DatabaseLookup,
  type ExtractedField,
} from "../productRules";
import { evaluate, runFontChecks } from "../ruleEngine";
import {
  resolveSlab,
  resolveTableI,
  mmPerPixel,
} from "../calibration";
import {
  PANELS,
  EXAMPLE_CASES,
  barcodeBox,
  SPEC_LAYOUT,
} from "../../lib/specimens";

const VALIDATION_METHODS = [
  "ai_format_check",
  "ai_presence_with_officer",
  "calibrated_measurement",
  "officer_verification",
  "out_of_label_scope",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Present, confidently-read field with a plausible bounding box. */
function f(
  key: string,
  value: string,
  evidence = value,
  confidence = 0.95,
): ExtractedField {
  return {
    key,
    label: key,
    value,
    evidence,
    confidence,
    state: "present",
    boundingBox: { x: 40, y: 100, w: 200, h: 30 },
  };
}

/** Field the AI could see but not read — must never become FAIL. */
function unreadable(key: string): ExtractedField {
  return { key, label: key, confidence: 0.3, state: "unreadable" };
}

function baseAnalysis(overrides: Partial<VisionAnalysis> = {}): VisionAnalysis {
  const fields: ExtractedField[] = (overrides.fields ?? []).map((x) => ({ ...x }));
  return {
    brand: null,
    productName: null,
    productVariant: null,
    category: "packaged_food",
    categoryConfidence: 0.95,
    packageType: "Pouch",
    productClass: null,
    importedPackage: null,
    notForRetailSale: null,
    whenPackedDeclaration: null,
    innerPackage: null,
    manufacturer: null,
    packer: null,
    importer: null,
    manufacturerAddress: null,
    netQuantity: null,
    mrp: null,
    unitSalePrice: null,
    batchNumber: null,
    manufactureDate: null,
    bestBefore: null,
    countryOfOrigin: null,
    consumerCare: null,
    fssaiLicense: null,
    licenseInfo: null,
    ingredients: null,
    barcode: { value: null, symbology: null, checksumValid: null, prefixRegion: null },
    fields,
    otherDeclarations: [],
    warnings: [],
    imageQualityConfidence: 0.9,
    engine: "test",
    notes: null,
    ...overrides,
  };
}

const CAL = { realHeightMm: 240, boundingBoxPixelHeight: 800 }; // 0.3 mm/px

// ---------------------------------------------------------------------------
// 1. Versioned knowledge base
// ---------------------------------------------------------------------------

describe("versioned rules knowledge base", () => {
  it("is stamped with the current KB version and amendment-tracked sources", () => {
    expect(KB_VERSION).toBe("kb-2026.09.1");
    for (const n of [
      "G.S.R. 640(E)",
      "G.S.R. 629(E)",
      "G.S.R. 779(E)",
      "G.S.R. 881(E)",
      "G.S.R. 128(E)",
    ]) {
      expect(KB_SOURCES).toContain(n);
    }
  });

  it("every record carries rule number, sub-rule, amendment, effective date and validation method", () => {
    for (const r of RULE_RECORDS) {
      expect(r.ruleNumber.length, `${r.id} ruleNumber`).toBeGreaterThan(0);
      expect(r.subRule.length, `${r.id} subRule`).toBeGreaterThan(0);
      expect(r.requirement.length, `${r.id} requirement text`).toBeGreaterThan(20);
      expect(r.requirementShort.length, `${r.id} short title`).toBeGreaterThan(3);
      expect(r.evidenceRequired.length, `${r.id} evidenceRequired`).toBeGreaterThan(10);
      expect(r.versionNotes.length, `${r.id} versionNotes`).toBeGreaterThan(5);
      expect(AMENDMENTS[r.amendmentId], `${r.id} amendmentId exists`).toBeDefined();
      expect(r.effectiveDate, `${r.id} effectiveDate`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(VALIDATION_METHODS, `${r.id} validationMethod`).toContain(r.validationMethod);
      for (const exId of r.exceptionIds) {
        expect(
          EXCEPTIONS.some((e) => e.id === exId),
          `${r.id} references exception ${exId}`,
        ).toBe(true);
      }
    }
  });

  it("covers the amended Rule 6 matrix plus structural, cross-regime and channel rules", () => {
    const ids = RULE_RECORDS.map((r) => r.id);
    for (const id of [
      "rq_name_address",
      "rq_country_origin_imported",
      "rq_common_name",
      "rq_net_quantity",
      "rq_mrp",
      "rq_unit_sale_price",
      "rq_month_year",
      "rq_best_before",
      "rq_consumer_care",
      "rq_placement_pdp",
      "rq_font_net_quantity",
      "rq_font_declarations",
      "rq_clear_space_net_quantity",
      "rq_no_individual_stickers",
      "rq_drained_weight",
      "rq_27_registration",
      "rq_fssai",
      "rq_ingredients",
      "rq_no_sale_above_mrp",
      "rq_advertisement_mrp_qty",
      "rq_ecommerce_listing_declarations",
      "rq_ecommerce_origin_filter",
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(ids).toHaveLength(22);
  });

  it("has unique ids and REQUIREMENTS mirrors the label-scope records", () => {
    expect(new Set(RULE_RECORDS.map((r) => r.id)).size).toBe(RULE_RECORDS.length);
    expect(REQUIREMENTS.length).toBe(
      RULE_RECORDS.filter((r) => r.validationMethod !== "out_of_label_scope").length,
    );
  });

  it("amendment registry entries are complete", () => {
    for (const a of Object.values(AMENDMENTS)) {
      expect(a.notification.length).toBeGreaterThan(3);
      expect(a.dateNotified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.summary.length).toBeGreaterThan(20);
    }
  });

  it("scopeLabel describes every scope kind", () => {
    expect(scopeLabel("all")).toContain("All");
    expect(scopeLabel("imported")).toContain("Imported");
    expect(scopeLabel("channel_ecommerce")).toContain("E-commerce");
    expect(scopeLabel(["packaged_food"])).toContain("packaged_food");
  });
});

// ---------------------------------------------------------------------------
// 2. Deterministic validators + GTIN helpers
// ---------------------------------------------------------------------------

describe("deterministic validators (validateField)", () => {
  it("MRP without ₹ fails citing G.S.R. 779(E)/2021", () => {
    expect(validateField("rq_mrp", "₹185", baseAnalysis()).ok).toBe(true);
    const bad = validateField("rq_mrp", "Rs 245.00", baseAnalysis());
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("₹");
    expect(bad.reason).toContain("779");
  });

  it("net quantity requires a prescribed unit", () => {
    expect(validateField("rq_net_quantity", "500 g", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_net_quantity", "1 kg", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_net_quantity", "750 ml", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_net_quantity", "500", baseAnalysis()).ok).toBe(false);
  });

  it("month & year must be MM/YYYY or MM/YY", () => {
    expect(validateField("rq_month_year", "03/2026", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_month_year", "11/25", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_month_year", "March 2026", baseAnalysis()).ok).toBe(false);
  });

  it("unit sale price requires the ₹ per unit form", () => {
    expect(validateField("rq_unit_sale_price", "₹ 0.37 per g", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_unit_sale_price", "₹20.00 per litre", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_unit_sale_price", "0.37/g", baseAnalysis()).ok).toBe(false);
  });

  it("FSSAI licence must be 14 digits", () => {
    expect(validateField("rq_fssai", "13321999000263", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_fssai", "12345", baseAnalysis()).ok).toBe(false);
  });

  it("consumer-care partial blocks never instant-FAIL", () => {
    expect(validateField("rq_consumer_care", "1800-123-4567", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_consumer_care", "care@example.com", baseAnalysis()).ok).toBe(true);
    expect(validateField("rq_consumer_care", "write to us", baseAnalysis()).ok).toBe(false);
  });
});

describe("GTIN helpers", () => {
  it("validates GS1 check digits", () => {
    expect(gtinChecksumValid("8901058000016")).toBe(true);
    expect(gtinChecksumValid("8901058000017")).toBe(false);
    expect(gtinChecksumValid("123")).toBe(null);
  });

  it("maps GS1 prefix regions", () => {
    expect(gtinPrefixRegion("8901058000016")).toBe("India");
    expect(gtinPrefixRegion("06341234000047")).toBe("USA/Canada (UPC)");
    expect(gtinPrefixRegion("9991058000016")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 3. Image ↔ database cross-check
// ---------------------------------------------------------------------------

describe("image ↔ database cross-check", () => {
  it("flags brand conflicts without picking a winner", () => {
    const a = baseAnalysis({
      fields: [f("productName", "Herbal Shampoo", "HERBAL SHAMPOO")],
      productName: "Herbal Shampoo",
      brand: "Greenleaf",
    });
    const m = crossCheck(a, {
      product: {
        source: "UPCitemdb",
        found: true,
        title: "Herbal Shampoo 340ml",
        brand: "Purity Botanicals Ltd.",
        netWeight: "340 ml",
      },
    });
    expect(m.map((x) => x.field)).toContain("brand");
    expect(m.find((x) => x.field === "brand")?.databaseValue).toBe(
      "Purity Botanicals Ltd.",
    );
  });

  it("flags net-quantity conflicts", () => {
    const a = baseAnalysis({
      fields: [f("netQuantity", "500 g", "Net Wt. 500 g")],
      netQuantity: "500 g",
      productName: "Crunchy Muesli",
      brand: "Sunrise Foods",
    });
    const m = crossCheck(a, {
      product: {
        source: "UPCitemdb",
        found: true,
        title: "Sunrise Crunchy Muesli 500g",
        brand: "Sunrise Foods",
        netWeight: "400 g",
      },
    });
    expect(m.map((x) => x.field)).toContain("net_quantity");
  });

  it("matching identity produces no mismatch", () => {
    const a = baseAnalysis({
      fields: [f("productName", "Crunchy Muesli", "CRUNCHY MUESLI 500G")],
      productName: "Crunchy Muesli",
      brand: "Sunrise Foods",
      netQuantity: "500 g",
    });
    const m = crossCheck(a, {
      product: {
        source: "UPCitemdb",
        found: true,
        title: "Sunrise Crunchy Muesli 500g",
        brand: "Sunrise Foods",
        netWeight: "500 g",
      },
    });
    expect(m).toHaveLength(0);
  });

  it("no database product → no mismatches", () => {
    const a = baseAnalysis({ fields: [f("productName", "X", "X")], productName: "X" });
    expect(crossCheck(a, { product: null })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Rule engine — verdict semantics and applicability
// ---------------------------------------------------------------------------

describe("rule engine verdict semantics", () => {
  it("unreadable declaration is REVIEW, never FAIL", () => {
    const r = evaluate(baseAnalysis({ fields: [unreadable("mrp")] }), null);
    const mrp = r.requirements.find((x) => x.requirementId === "rq_mrp")!;
    expect(mrp.status).toBe("REVIEW");
    expect(r.decision).not.toBe("FAIL");
  });

  it("absent declaration is REVIEW with an insufficient-evidence reason", () => {
    const r = evaluate(
      baseAnalysis({ fields: [f("productName", "Test Product", "TEST PRODUCT")] }),
      null,
    );
    const mrp = r.requirements.find((x) => x.requirementId === "rq_mrp")!;
    expect(mrp.status).toBe("REVIEW");
    expect(mrp.reason).toMatch(/not sufficiently visible|another face|too poor/i);
  });

  it("a read-but-noncompliant value FAILs with the exact rule citation", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Herbal Shampoo", "HERBAL SHAMPOO"),
          f("mrp", "Rs 245.00", "M.R.P. Rs 245.00"),
          f("netQuantity", "340 ml", "Net Qty. 340 ml"),
          f("manufactureDate", "11/25", "Pkd 11/25"),
          f("manufacturer", "Greenleaf Industries", "M/s Greenleaf Industries"),
          f("consumerCare", "care@example.com", "Consumer Care: care@example.com"),
        ],
        category: "personal_care",
      }),
      null,
    );
    const mrp = r.requirements.find((x) => x.requirementId === "rq_mrp")!;
    expect(mrp.status).toBe("FAIL");
    expect(mrp.ruleCited).toBe("Rule 6(1)(e)");
    expect(mrp.reason).toContain("₹");
    expect(r.decision).toBe("FAIL");
    expect(r.failCount).toBeGreaterThanOrEqual(1);
  });

  it("every image-verifiable requirement PASSes on a compliant panel; officer items stay REVIEW", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Crunchy Muesli", "CRUNCHY MUESLI 500G"),
          f("mrp", "₹185", "M.R.P. ₹185/-"),
          f("netQuantity", "500 g", "Net Wt. 500 g"),
          f("unitSalePrice", "₹ 0.37 per g", "Unit Sale Price ₹ 0.37 per g"),
          f("manufactureDate", "03/2026", "MFD 03/2026"),
          f("manufacturer", "Sunrise Foods Pvt. Ltd.", "Manufactured by Sunrise Foods Pvt. Ltd."),
          f("consumerCare", "1800-123-4567", "Consumer Care: 1800-123-4567"),
          f("fssaiLicense", "13321999000263", "FSSAI Lic. No. 13321999000263"),
          f("bestBefore", "09/2026", "Best Before 09/2026"),
          f("countryOfOrigin", "India", "Country of Origin: India"),
        ],
        countryOfOrigin: "India",
      }),
      null,
      CAL,
    );
    for (const id of [
      "rq_common_name",
      "rq_mrp",
      "rq_net_quantity",
      "rq_unit_sale_price",
      "rq_month_year",
      "rq_name_address",
      "rq_consumer_care",
      "rq_fssai",
      "rq_best_before",
      "rq_font_net_quantity",
      "rq_font_declarations",
    ]) {
      const req = r.requirements.find((x) => x.requirementId === id)!;
      expect(req.status, `${id}: ${req.reason ?? ""}`).toBe("PASS");
    }
    expect(r.failCount).toBe(0);
    // Placement / clear-space / registration are officer-verification rows —
    // per the decision logic they keep the overall verdict at REVIEW.
    expect(r.decision).toBe("REVIEW");
  });

  it("non-applicable requirements are excluded from rows but kept in the applicability table", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Test Product", "TEST PRODUCT"),
          f("netQuantity", "100 g", "NET 100 g"),
          f("mrp", "₹50", "MRP ₹50/-"),
          f("manufacturer", "Maker Co", "Mfd by Maker Co"),
        ],
        countryOfOrigin: "India",
        category: "household_chemical",
      }),
      null,
    );
    expect(r.requirements.some((x) => x.requirementId === "rq_country_origin_imported")).toBe(false);
    expect(r.requirements.some((x) => x.requirementId === "rq_fssai")).toBe(false);
    expect(r.requirements.some((x) => x.requirementId === "rq_best_before")).toBe(false);
    expect(
      r.applicability.find((x) => x.requirementId === "rq_country_origin_imported")?.applicable,
    ).toBe(false);
    expect(r.passCount + r.failCount + r.reviewCount).toBe(r.applicableCount);
    // Transactional obligations are never evaluated per-image.
    expect(r.requirements.some((x) => x.requirementId === "rq_no_sale_above_mrp")).toBe(false);
  });

  it("database conflict forces REVIEW on the affected requirement (never auto-pick)", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Herbal Shampoo", "HERBAL SHAMPOO"),
          f("netQuantity", "340 ml", "Net Qty. 340 ml"),
        ],
        productName: "Herbal Shampoo",
        brand: "Greenleaf",
        netQuantity: "340 ml",
        category: "personal_care",
      }),
      {
        product: {
          source: "UPCitemdb",
          found: true,
          title: "Herbal Shampoo 340ml",
          brand: "Purity Botanicals Ltd.",
          netWeight: "340 ml",
        },
      },
    );
    const cn = r.requirements.find((x) => x.requirementId === "rq_common_name")!;
    expect(cn.status).toBe("REVIEW");
    expect(cn.source).toBe("image+database");
  });

  it("result rows carry full cited-version provenance", () => {
    const r = evaluate(
      baseAnalysis({ fields: [f("productName", "X", "X")] }),
      null,
    );
    for (const row of r.requirements) {
      expect(row.requirement.length).toBeGreaterThan(20);
      expect(row.applicability.length).toBeGreaterThan(5);
      expect(row.evidenceRequired.length).toBeGreaterThan(5);
      expect(AMENDMENTS[row.amendmentId]).toBeDefined();
      expect(row.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(r.kbVersion).toBe(KB_VERSION);
    expect(r.appliedRuleVersion).toBe(`lm2011-pc.${KB_VERSION}`);
    expect(r.kbSources).toContain("G.S.R. 779(E)");
    expect(r.outOfScopeRequirements.length).toBeGreaterThanOrEqual(3);
  });
});

describe("rule engine exceptions", () => {
  it("waives unit sale price on ≤ 10 g retail packs (Rule 26(a))", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Lip Balm", "LIP BALM"),
          f("netQuantity", "8 g", "NET 8 g"),
          f("mrp", "₹10", "MRP ₹10/-"),
          f("manufacturer", "Balm Co", "Mfd by Balm Co"),
        ],
        netQuantity: "8 g",
        category: "personal_care",
      }),
      null,
    );
    expect(r.requirements.some((x) => x.requirementId === "rq_unit_sale_price")).toBe(false);
    expect(r.exceptionsApplied.some((e) => e.id === "ex_rule26_small_pack")).toBe(true);
  });

  it("pan masala is NOT eligible for the small-pack exemption (G.S.R. 881(E))", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Pan Masala Zip", "PAN MASALA ZIP"),
          f("netQuantity", "8 g", "NET 8 g"),
          f("mrp", "₹10", "MRP ₹10/-"),
          f("manufacturer", "Masala Co", "Mfd by Masala Co"),
        ],
        netQuantity: "8 g",
        productClass: "pan masala",
      }),
      null,
    );
    expect(r.requirements.some((x) => x.requirementId === "rq_unit_sale_price")).toBe(true);
    expect(r.exceptionsApplied.some((e) => e.id === "ex_pan_masala_rule26a")).toBe(true);
    expect(r.exceptionsApplied.some((e) => e.id === "ex_rule26_small_pack")).toBe(false);
  });

  it("waives unit sale price on wholesale / not-for-retail packages", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Bulk Detergent", "BULK DETERGENT"),
          f("netQuantity", "5 kg", "NET 5 kg"),
          f("mrp", "₹400", "MRP ₹400/-"),
          f("manufacturer", "Chem Co", "Mfd by Chem Co"),
        ],
        notForRetailSale: true,
        category: "household_chemical",
      }),
      null,
    );
    expect(r.requirements.some((x) => x.requirementId === "rq_unit_sale_price")).toBe(false);
    expect(r.requirements.some((x) => x.requirementId === "rq_mrp")).toBe(true);
  });

  it("'when packed' exception only matches soap / lotion / cream / camphor classes", () => {
    const soap = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Neem Soap", "NEEM SOAP"),
          f("netQuantity", "100 g", "NET 100 g"),
          f("mrp", "₹40", "MRP ₹40/-"),
          f("manufacturer", "Soap Co", "Mfd by Soap Co"),
          f("manufactureDate", "When packed 03/2026", "When packed 03/2026"),
        ],
        productClass: "soap",
        whenPackedDeclaration: true,
      }),
      null,
    );
    expect(soap.exceptionsApplied.some((e) => e.id === "ex_when_packed_soaps")).toBe(true);

    const biscuit = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Biscuits", "BISCUITS"),
          f("netQuantity", "100 g", "NET 100 g"),
        ],
        whenPackedDeclaration: true,
      }),
      null,
    );
    expect(biscuit.exceptionsApplied.some((e) => e.id === "ex_when_packed_soaps")).toBe(false);
  });

  it("drugs regime packages waive the inapplicable declaration set", () => {
    const r = evaluate(
      baseAnalysis({
        fields: [
          f("productName", "Paracetamol 500mg", "PARACETAMOL 500MG"),
          f("netQuantity", "10 tablets", "10 tablets"),
        ],
        productClass: "pharmaceutical",
      }),
      null,
    );
    expect(r.exceptionsApplied.some((e) => e.id === "ex_drugs_cosmetics")).toBe(true);
    expect(r.requirements.some((x) => x.requirementId === "rq_fssai")).toBe(false);
    expect(r.requirements.some((x) => x.requirementId === "rq_best_before")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Calibration tables
// ---------------------------------------------------------------------------

describe("calibration tables", () => {
  it("Fourth Schedule slabs band by net quantity", () => {
    expect(resolveSlab(30, "g").minCharHeightMm).toBe(1.0);
    expect(resolveSlab(60, "g").minCharHeightMm).toBe(1.0);
    expect(resolveSlab(80, "g").minCharHeightMm).toBe(2.0);
    expect(resolveSlab(200, "g").minCharHeightMm).toBe(2.0);
    expect(resolveSlab(500, "g").minCharHeightMm).toBe(3.0);
    expect(resolveSlab(1000, "g").minCharHeightMm).toBe(4.0);
    expect(resolveSlab(5000, "kg").minCharHeightMm).toBe(6.0);
  });

  it("Table I bands by PDP area with blown/formed/moulded uplift", () => {
    expect(resolveTableI(40)?.requiredMm).toBe(1.0);
    expect(resolveTableI(80)?.requiredMm).toBe(1.5);
    expect(resolveTableI(300)?.requiredMm).toBe(2.5);
    expect(resolveTableI(2000)?.requiredMm).toBe(4.0);
    expect(resolveTableI(3000)?.requiredMm).toBe(6.0);
    expect(resolveTableI(300, true)?.requiredMm).toBe(4.0);
    expect(resolveTableI()).toBe(null);
  });

  it("mm per pixel derives from physical calibration", () => {
    expect(mmPerPixel({ realHeightMm: 240, boundingBoxPixelHeight: 800 })).toBeCloseTo(0.3);
  });

  it("font checks are REVIEW without calibration and PASS with it", () => {
    const a = baseAnalysis({
      fields: [f("netQuantity", "500 g", "Net Wt. 500 g"), f("mrp", "₹185", "M.R.P. ₹185/-")],
    });
    expect(runFontChecks(a).performed).toBe(false);
    const done = runFontChecks(a, CAL);
    expect(done.performed).toBe(true);
    expect(done.measurements.every((m) => m.status === "PASS")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Specimen honesty — pinned analyses must match the drawn panels
// ---------------------------------------------------------------------------

describe("specimen honesty", () => {
  it("every pinned field's value is traceable to the printed panel", () => {
    for (const [id, panel] of Object.entries(PANELS)) {
      const printed = [
        panel.title.toUpperCase(),
        panel.caption.toUpperCase(),
        ...panel.lines.map((l) => l.text.toUpperCase()),
      ].join(" | ");
      const analysis = EXAMPLE_CASES.find((c) => c.id === id)!.analysis;
      for (const fld of analysis.fields) {
        if (fld.state !== "present" || !fld.value) continue;
        if (fld.key === "barcode") {
          expect(fld.value, `${id} barcode`).toBe(panel.barcode);
          continue;
        }
        const ev = (fld.evidence ?? "").toUpperCase();
        expect(
          printed.includes(ev),
          `${id}:${fld.key} evidence "${fld.evidence}" not printed on panel`,
        ).toBe(true);
      }
    }
  });

  it("specimen barcodes pass GS1 check-digit validation", () => {
    for (const [id, panel] of Object.entries(PANELS)) {
      expect(gtinChecksumValid(panel.barcode), `${id} barcode ${panel.barcode}`).toBe(true);
    }
  });

  it("all pinned bounding boxes fit inside the canvas", () => {
    for (const c of EXAMPLE_CASES) {
      for (const fld of c.analysis.fields) {
        const b = fld.boundingBox;
        if (!b) continue;
        expect(b.x, `${c.id}:${fld.key} x`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${c.id}:${fld.key} y`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, `${c.id}:${fld.key} right edge`).toBeLessThanOrEqual(SPEC_LAYOUT.width);
        expect(b.y + b.h, `${c.id}:${fld.key} bottom edge`).toBeLessThanOrEqual(SPEC_LAYOUT.height);
      }
    }
  });

  it("the barcode block sits below the last printed line", () => {
    for (const [, panel] of Object.entries(PANELS)) {
      const box = barcodeBox(panel.lines.length);
      expect(box.y).toBeGreaterThan(
        SPEC_LAYOUT.lineTop + (panel.lines.length - 1) * SPEC_LAYOUT.lineStep,
      );
    }
  });

  it("specimen engine runs reproduce honest verdicts", () => {
    const muesli = EXAMPLE_CASES.find((c) => c.id === "muesli")!;
    const rM = evaluate(muesli.analysis, muesli.database, muesli.calibration);
    expect(rM.failCount).toBe(0);
    expect(["PASS", "REVIEW"]).toContain(rM.decision);

    const shampoo = EXAMPLE_CASES.find((c) => c.id === "shampoo")!;
    const rS = evaluate(shampoo.analysis, shampoo.database, shampoo.calibration);
    // "Rs 245.00" was READ and is clearly non-compliant → FAIL (with a brand
    // mismatch forcing the identity row to REVIEW).
    expect(rS.decision).toBe("FAIL");
    expect(
      rS.requirements.find((x) => x.requirementId === "rq_common_name")?.status,
    ).toBe("REVIEW");

    const chips = EXAMPLE_CASES.find((c) => c.id === "chips")!;
    const rC = evaluate(chips.analysis, chips.database, chips.calibration);
    // Front-panel-only capture: absent back-panel declarations are REVIEW, never FAIL.
    expect(rC.decision).not.toBe("FAIL");
    expect(rC.reviewCount).toBeGreaterThan(0);
  });
});

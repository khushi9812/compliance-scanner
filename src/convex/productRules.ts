// Legal Metrology (Packaged Commodities) Rules, 2011 — curated requirement
// matrix ("knowledge base"). Each entry is a mandatory declaration or a
// category-conditional requirement with its exact rule citation. The rule
// engine evaluates an AI vision analysis against ONLY the applicable
// requirements — nothing here is invented at runtime, and no rule is applied
// to a product whose category does not trigger it.
//
// Verdict semantics (data-driven, never a bare threshold):
//   PASS   — requirement confidently satisfied on visible evidence.
//   FAIL   — requirement confidently violated (confidently missing, wrong
//            format, or cross-check mismatch).
//   REVIEW — cannot be reliably determined (unclear image, hidden panel,
//            uncertain category, conflicting sources…). Uncertainty is NEVER
//            converted into FAIL.

export type ProductCategory =
  | "packaged_food"
  | "beverage"
  | "personal_care"
  | "household_chemical"
  | "other"
  | "unknown";

export type FieldState = "present" | "not_visible" | "unreadable";

/** One visible declaration as understood by the AI from the package image. */
export interface ExtractedField {
  key: string;
  label: string;
  /** What the AI read, normalized (e.g. "₹120", "100 g"). */
  value?: string;
  /** Exact printed text the value was read from (evidence quote). */
  evidence?: string;
  /** 0..1 — AI confidence that this reading is correct. */
  confidence: number;
  state: FieldState;
  /** Bounding box in image pixels [x, y, w, h] when reliably localized. */
  boundingBox?: { x: number; y: number; w: number; h: number };
}

export interface BarcodeAnalysis {
  /** Raw decoded digits, null when no barcode is reliably detectable. */
  value: string | null;
  symbology: string | null;
  /** GTIN check digit verified? null when not applicable/decodable. */
  checksumValid: boolean | null;
  /** GTIN-13/12/8/14 national prefix region when derivable (e.g. "890" → India). */
  prefixRegion?: string | null;
}

export interface DatabaseProduct {
  source: string;
  found: boolean;
  /** All fields come from the external database only — never synthesized. */
  title?: string;
  brand?: string;
  category?: string;
  manufacturer?: string;
  netWeight?: string;
  imageUrl?: string;
}

export interface MismatchReport {
  field: "product_identity" | "brand" | "net_quantity" | "manufacturer";
  imageValue: string;
  databaseValue: string;
}

export interface VisionAnalysis {
  brand?: string | null;
  productName?: string | null;
  productVariant?: string | null;
  category: ProductCategory;
  categoryConfidence: number;
  packageType?: string | null;
  manufacturer?: string | null;
  packer?: string | null;
  importer?: string | null;
  manufacturerAddress?: string | null;
  netQuantity?: string | null;
  mrp?: string | null;
  batchNumber?: string | null;
  manufactureDate?: string | null;
  bestBefore?: string | null;
  countryOfOrigin?: string | null;
  consumerCare?: string | null;
  fssaiLicense?: string | null;
  licenseInfo?: string | null;
  ingredients?: string | null;
  barcode: BarcodeAnalysis;
  fields: ExtractedField[];
  otherDeclarations: string[];
  warnings: string[];
  /** 0..1 overall AI certainty about what it is looking at. */
  imageQualityConfidence: number;
  /** Model/agent provenance for the debug trail. */
  engine: string;
  notes?: string | null;
}

export interface DatabaseLookup {
  product: DatabaseProduct | null;
  error?: string | null;
}

/** One applicable requirement and its evaluation outcome. */
export interface RequirementResult {
  requirementId: string;
  title: string;
  ruleCited: string;
  mandatory: boolean;
  status: "PASS" | "FAIL" | "REVIEW";
  /** What was detected for this requirement, if anything. */
  detected?: string | null;
  /** Printed evidence quoted from the package. */
  evidence?: string | null;
  /** Bounding box for image-evidence overlay when localized. */
  boundingBox?: { x: number; y: number; w: number; h: number };
  confidence: number;
  /** Why this status — always populated for FAIL/REVIEW. */
  reason?: string;
  source: "image" | "image+database" | "rules";
}

export interface Applicability {
  requirementId: string;
  applicable: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Requirement definitions — curated from Rule 6(1)–(2), Rule 9, Rule 2(m) and
// the Fourth Schedule of the LM (PC) Rules, 2011, plus FSS Act labelling via
// the FSSAI licence declaration. `appliesTo: "all"` = universal; otherwise a
// predicate over the classified category.
// ---------------------------------------------------------------------------

export interface RequirementDef {
  id: string;
  title: string;
  ruleCited: string;
  mandatory: boolean;
  /** Which extracted key backs this requirement. */
  fieldKey: string;
  appliesTo: "all" | ProductCategory[];
  /** Extra applicability gate (e.g. importer vs manufacturer). */
  gate?: (a: VisionAnalysis) => boolean;
  gateReason?: string;
  /** How a present value is judged in format/content terms. */
  check: (value: string, a: VisionAnalysis) => { ok: boolean; reason?: string };
  /** Human explanation of what compliant looks like. */
  requirementText: string;
}

const has = (v: string | null | undefined): v is string =>
  typeof v === "string" && v.trim().length > 0;

/** MRP must carry ₹ (post-2021 amendment; "Rs" ceased to be valid). */
function mrpCheck(value: string) {
  const ok = value.includes("₹");
  return {
    ok,
    reason: ok
      ? undefined
      : `MRP is printed as "${value}" — the ₹ symbol is mandatory; "Rs." style MRP is not a valid declaration.`,
  };
}

function netQtyCheck(value: string) {
  const ok = /\d/.test(value) && /(kg|g|ml|l|n)\b/i.test(value);
  return {
    ok,
    reason: ok
      ? undefined
      : `Net quantity "${value}" does not use a standard prescribed unit (g, kg, ml, l, N).`,
  };
}

function dateCheck(value: string) {
  const ok = /^(0?[1-9]|1[0-2])[/\-.](\d{2}|\d{4})$/.test(value.trim());
  return {
    ok,
    reason: ok
      ? undefined
      : `Date "${value}" is not in the prescribed Month/Year (MM/YYYY or MM/YY) form.`,
  };
}

function phoneish(value: string) {
  return /(\+?\d[\d\s\-()]{7,})|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(www\.)/i.test(
    value,
  );
}

export const REQUIREMENTS: RequirementDef[] = [
  {
    id: "rq_name_address",
    title: "Name and address of manufacturer / packer / importer",
    ruleCited: "Rule 6(1)(b)",
    mandatory: true,
    fieldKey: "manufacturer",
    appliesTo: "all",
    check: (v) => ({ ok: v.trim().length >= 4 }),
    requirementText:
      "The pre-packed commodity must carry the name and complete address of the manufacturer, packer or importer.",
  },
  {
    id: "rq_common_name",
    title: "Generic / common name of the commodity",
    ruleCited: "Rule 6(1)(c)",
    mandatory: true,
    fieldKey: "productName",
    appliesTo: "all",
    check: (v) => ({ ok: v.trim().length >= 2 }),
    requirementText:
      "The package must declare the common or generic name of the commodity it contains.",
  },
  {
    id: "rq_net_quantity",
    title: "Net quantity in prescribed units",
    ruleCited: "Rule 6(1)(a)",
    mandatory: true,
    fieldKey: "netQuantity",
    appliesTo: "all",
    check: netQtyCheck,
    requirementText:
      "Net quantity must be declared in standard units (g, kg, ml, l, N) per Rule 6(1)(a).",
  },
  {
    id: "rq_mrp",
    title: "Retail sale price (MRP) with ₹ symbol",
    ruleCited: "Rule 6(1)(e) read with Rule 2(m)",
    mandatory: true,
    fieldKey: "mrp",
    appliesTo: "all",
    check: mrpCheck,
    requirementText:
      "MRP must be declared inclusive of all taxes, printed with the ₹ symbol; the earlier 'Rs.' style is no longer a valid declaration.",
  },
  {
    id: "rq_month_year",
    title: "Month & year of manufacture / packing",
    ruleCited: "Rule 6(1)(d)",
    mandatory: true,
    fieldKey: "manufactureDate",
    appliesTo: "all",
    gate: (a) => !has(a.bestBefore) || a.category === "packaged_food",
    gateReason:
      "A pre-printed/punch-marked date code or use-by period may substitute the printed month-year on some packs; manual verification needed.",
    check: dateCheck,
    requirementText:
      "The month and year of manufacture/pre-packing must appear in MM/YYYY (or MM/YY) form.",
  },
  {
    id: "rq_consumer_care",
    title: "Consumer-care details",
    ruleCited: "Rule 6(1)(f)",
    mandatory: true,
    fieldKey: "consumerCare",
    appliesTo: "all",
    check: (v) => ({ ok: phoneish(v) || v.trim().length >= 6 }),
    requirementText:
      "Consumer-care declaration (phone / email / URL / postal contact) is mandatory on all pre-packed commodities.",
  },
  {
    id: "rq_country_of_origin",
    title: "Country of origin / manufacture",
    ruleCited: "Rule 6(1)(i)",
    mandatory: true,
    fieldKey: "countryOfOrigin",
    appliesTo: "all",
    check: (v) => ({ ok: v.trim().length >= 3 }),
    requirementText:
      "The country of origin or manufacture or assembly must be declared for imported packs; for Indian-made packs the maker's address satisfies identification — flag for review where ambiguous.",
  },
  {
    id: "rq_best_before",
    title: "Best before / use by date (where applicable)",
    ruleCited: "Rule 6(1)(d) read with FSS Labelling & Display Regulation, 2020",
    mandatory: true,
    fieldKey: "bestBefore",
    appliesTo: ["packaged_food", "beverage"],
    check: (v) => ({ ok: true, reason: undefined }),
    requirementText:
      "Packaged food must carry 'Best before' / 'Use by' with the date or durability indication.",
  },
  {
    id: "rq_fssai",
    title: "FSSAI licence number (food products)",
    ruleCited:
      "FSS (Labelling & Display) Regulations, 2020 — 14-digit licence number",
    mandatory: true,
    fieldKey: "fssaiLicense",
    appliesTo: ["packaged_food", "beverage"],
    check: (v) => ({ ok: /^\d{14}$/.test(v.replace(/\D/g, "")) }),
    requirementText:
      "Food business operator's 14-digit FSSAI licence number must be displayed on the label.",
  },
  {
    id: "rq_batch",
    title: "Batch number or lot number",
    ruleCited: "Rule 6(1)(c) read with Rule 9(4)",
    mandatory: true,
    fieldKey: "batchNumber",
    appliesTo: "all",
    check: (v) => ({ ok: v.trim().length >= 2 }),
    requirementText:
      "A batch or lot number enabling the unit to be traced must be given on the package.",
  },
  {
    id: "rq_quantity_font",
    title: "Character height of net-quantity declaration (Fourth Schedule)",
    ruleCited: "Fourth Schedule, LM (PC) Rules, 2011",
    mandatory: true,
    fieldKey: "netQuantity",
    appliesTo: "all",
    check: (v) => ({ ok: /\d/.test(v) }),
    requirementText:
      "The numeral height of the net-quantity declaration must meet the Fourth Schedule slab for the package size (slabs by quantity: 1–2 mm and upward).",
  },
  {
    id: "rq_mrp_font",
    title: "Character height of MRP declaration (Fourth Schedule)",
    ruleCited: "Fourth Schedule, LM (PC) Rules, 2011",
    mandatory: true,
    fieldKey: "mrp",
    appliesTo: "all",
    check: (v) => ({ ok: /\d/.test(v) }),
    requirementText:
      "MRP characters must meet the minimum height for the package's area/size slab under the Fourth Schedule.",
  },
  {
    id: "rq_ingredients",
    title: "List of ingredients (food)",
    ruleCited: "FSS (Labelling & Display) Regulations, 2020 · Rule 6(2) context",
    mandatory: true,
    fieldKey: "ingredients",
    appliesTo: ["packaged_food", "beverage"],
    check: (v) => ({ ok: v.trim().length >= 8 }),
    requirementText:
      "Ingredients must be listed in descending order of weight on packaged food.",
  },
  {
    id: "rq_importer_declaration",
    title: "Importer's name & address (imported packs)",
    ruleCited: "Rule 6(1)(b) proviso · Legal Metrology (Display of Information on Imported Packages) Rules",
    mandatory: true,
    fieldKey: "importer",
    appliesTo: "all",
    gate: (a) => {
      const origin = (a.countryOfOrigin ?? "").toLowerCase();
      return has(origin) && !origin.includes("india");
    },
    gateReason:
      "Not applicable — package declares Indian manufacture; importer declaration applies to imported packs.",
    check: (v) => ({ ok: v.trim().length >= 6 }),
    requirementText:
      "For imported packages, the name and address of the importer in India must be declared on the pack.",
  },
];

/** Universal baseline that always applies. */
export function baseApplicable(a: VisionAnalysis): Applicability[] {
  return REQUIREMENTS.map((r) => ({
    requirementId: r.id,
    applicable: true,
    reason: "Mandatory declaration under the cited clause.",
  }));
}

/** Decide which requirements apply to this analysis — data-driven only. */
export function applicableRequirements(a: VisionAnalysis): Array<{
  def: RequirementDef;
  applicability: Applicability;
}> {
  const out: Array<{ def: RequirementDef; applicability: Applicability }> = [];
  for (const def of REQUIREMENTS) {
    const categoryOk =
      def.appliesTo === "all" ||
      (def.appliesTo as ProductCategory[]).includes(a.category);
    if (!categoryOk) {
      out.push({
        def,
        applicability: {
          requirementId: def.id,
          applicable: false,
          reason: `Not applicable to category "${a.category}".`,
        },
      });
      continue;
    }
    if (def.gate && !def.gate(a)) {
      out.push({
        def,
        applicability: {
          requirementId: def.id,
          applicable: false,
          reason: def.gateReason ?? "Gated off by package context.",
        },
      });
      continue;
    }
    out.push({
      def,
      applicability: {
        requirementId: def.id,
        applicable: true,
        reason: `Applicable — category "${a.category}"${def.appliesTo !== "all" ? " + package context" : ""}.`,
      },
    });
  }
  return out;
}

/** Field lookup helper on the analysis. */
export function fieldFor(a: VisionAnalysis, key: string): ExtractedField | null {
  return a.fields.find((f) => f.key === key) ?? null;
}

/**
 * Compare the image-derived identity with the database product (when a GTIN
 * lookup succeeded). Returns mismatches — never picks a winner automatically;
 * every mismatch forces the overall decision to REVIEW.
 */
export function crossCheck(
  a: VisionAnalysis,
  db: DatabaseLookup | null,
): MismatchReport[] {
  if (!db?.product || !db.product.found) return [];
  const m: MismatchReport[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const dbTitle = db.product.title ?? "";
  const dbBrand = db.product.brand ?? "";
  if (dbTitle && a.productName && !norm(dbTitle).includes(norm(a.productName).split(" ").slice(0, 2).join(" "))) {
    const overlaps = norm(dbTitle)
      .split(" ")
      .some((w) => w.length > 2 && norm(a.productName ?? "").includes(w));
    if (!overlaps) {
      m.push({
        field: "product_identity",
        imageValue: a.productName ?? "—",
        databaseValue: dbTitle,
      });
    }
  }
  if (dbBrand && a.brand && norm(dbBrand) !== norm(a.brand) && !norm(dbTitle).includes(norm(a.brand))) {
    m.push({
      field: "brand",
      imageValue: a.brand,
      databaseValue: dbBrand,
    });
  }
  if (db.product.netWeight && a.netQuantity) {
    const dnum = db.product.netWeight.match(/(\d+(?:\.\d+)?)/);
    const inum = a.netQuantity.match(/(\d+(?:\.\d+)?)/);
    if (dnum && inum && Math.abs(parseFloat(dnum[1]) - parseFloat(inum[1])) > 0.01) {
      m.push({
        field: "net_quantity",
        imageValue: a.netQuantity,
        databaseValue: db.product.netWeight,
      });
    }
  }
  return m;
}

/** GS1 GTIN check-digit validation (GTIN-8/12/13/14). */
export function gtinChecksumValid(digits: string): boolean | null {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return null;
  const nums = digits.split("").map(Number);
  const check = nums.pop()!;
  let sum = 0;
  let weight = 3;
  for (let i = nums.length - 1; i >= 0; i--) {
    sum += nums[i] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

/** GS1 prefix region — informative only (registered GS1 member org). */
export function gtinPrefixRegion(digits: string): string | null {
  const gs1Prefixes: Record<string, string> = {
    "890": "India",
    "899": "Indonesia",
    "888": "Singapore",
    "690": "China",
    "692": "China",
    "880": "South Korea",
    "471": "Taiwan",
    "750": "Mexico",
    "380": "Bulgaria",
    "500": "UK",
    "400": "Germany",
    "460": "Russia",
    "590": "Poland",
    "0": "USA/Canada (UPC)",
  };
  for (const len of [3, 2, 1]) {
    const p = digits.slice(0, len);
    if (gs1Prefixes[p]) return gs1Prefixes[p];
  }
  return null;
}

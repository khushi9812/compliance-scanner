// Rule Engine v3 — versioned-knowledge-base evaluator.
//
// Pipeline: VisionAnalysis + DatabaseLookup + Calibration
//   → applicability determination (KB scope + exceptions registry)
//   → per-requirement validation (KB record + deterministic validators)
//   → verdict roll-up
//
// Verdict rules (from the product brief, enforced here):
//   PASS   = clearly compliant on visible evidence
//   FAIL   = clearly non-compliant — the value WAS read and is wrong
//   REVIEW = insufficient evidence / uncertainty (unreadable, hidden, unclear,
//            unmeasurable, conflicting). An unreadable declaration is NEVER a
//            FAIL.
//
// Nothing legal is invented at runtime: every requirement, citation, exception
// and version stamp is looked up from rulesKnowledgeBase.ts.

import {
  REQUIREMENTS,
  validateField,
  crossCheck,
  fieldFor,
  gtinChecksumValid,
  requirementScopeLabel,
  type VisionAnalysis,
  type DatabaseLookup,
  type RequirementResult,
  type Applicability,
  type MismatchReport,
  type RequirementDef,
} from "./productRules";
import {
  EXCEPTIONS,
  KB_VERSION,
  KB_SOURCES,
  AMENDMENTS,
  RULE_RECORDS,
  scopeLabel,
  type ExceptionRule,
} from "./rulesKnowledgeBase";
import {
  resolveSlab,
  type CalibrationInput,
  type Slab,
} from "./calibration";

export interface FontMeasurement {
  fieldKey: string;
  label: string;
  pixelHeight: number | null;
  actualMm: number | null;
  requiredMm: number | null;
  status: "PASS" | "FAIL" | "REVIEW";
  reason?: string;
}

export interface FontCheckSummary {
  performed: boolean;
  mmPerPixel: number | null;
  slab: (Slab & { label: string }) | null;
  measurements: FontMeasurement[];
}

export interface CrossCheckSummary {
  performed: boolean;
  source: string | null;
  dbFound: boolean;
  dbTitle?: string | null;
  dbBrand?: string | null;
  barcodeChecksumValid: boolean | null;
  mismatches: MismatchReport[];
  note?: string | null;
}

export interface EngineResult {
  decision: "PASS" | "FAIL" | "REVIEW";
  requirements: RequirementResult[];
  applicability: Applicability[];
  crossCheck: CrossCheckSummary;
  fontChecks: FontCheckSummary;
  /** Exception records that matched this scan (Rule 26 etc.). */
  exceptionsApplied: Array<{
    id: string;
    name: string;
    ruleCited: string;
    description: string;
    amendmentId: string;
  }>;
  /** Requirements outside label scope (listed for officer context). */
  outOfScopeRequirements: Array<{
    id: string;
    title: string;
    ruleCited: string;
    applicability: string;
  }>;
  passCount: number;
  failCount: number;
  reviewCount: number;
  applicableCount: number;
  /** KB + amendment provenance — surfaced verbatim on the report. */
  appliedRuleVersion: string;
  kbVersion: string;
  kbSources: string;
  /** Plain-language one-liner for the consumer card. */
  summarySentence: string;
}

export const RULES_VERSION = `lm2011-pc.${KB_VERSION}`;

// ---------------------------------------------------------------------------
// Applicability: KB scope + package context + exceptions
// ---------------------------------------------------------------------------

function isImported(a: VisionAnalysis): boolean {
  if (a.importedPackage === true) return true;
  const origin = (a.countryOfOrigin ?? "").toLowerCase();
  return origin.length > 0 && !origin.includes("india");
}

function netQtyAtMost(a: VisionAnalysis, value: number, unit: "g" | "ml"): boolean {
  const nq = a.netQuantity ?? "";
  const m = nq.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl)\b/i);
  if (!m) return false;
  const qty = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  const grams =
    u === "kg" ? qty * 1000 : u === "l" ? qty * 1000 : u === "cl" ? qty * 10 : qty;
  if (unit === "g") return grams <= value;
  return u === "ml" || u === "cl" || u === "l" ? grams <= value : false;
}

function productClassMatches(a: VisionAnalysis, classes: string[]): boolean {
  const hay = [
    a.productClass ?? "",
    a.productName ?? "",
    a.category,
  ]
    .join(" ")
    .toLowerCase();
  return classes.some((c) => hay.includes(c));
}

/** Evaluate one ExceptionRule's condition against the analysis. */
function exceptionMatches(ex: ExceptionRule, a: VisionAnalysis): boolean {
  const c = ex.condition;
  switch (c.type) {
    case "netQuantityAtMost":
      return netQtyAtMost(a, c.value, c.unit);
    case "productClassIn":
      return productClassMatches(a, c.classes);
    case "notForRetailSale":
      return a.notForRetailSale === true;
    case "uspEqualsRetailPrice": {
      const usp = a.unitSalePrice ?? "";
      const mrp = a.mrp ?? "";
      const u = usp.match(/₹?\s*(\d+(?:\.\d+)?)/);
      const m = mrp.match(/₹?\s*(\d+(?:\.\d+)?)/);
      return !!(u && m && parseFloat(u[1]) === parseFloat(m[1]));
    }
    case "innerPackage":
      return a.innerPackage === true;
    case "whenPackedDeclaration":
      // A 'when packed' date basis is permitted only for the listed product
      // classes (soaps, lotions, creams, camphor — DCA FAQ), not broadly.
      return a.whenPackedDeclaration === true && productClassMatches(a, c.classes);
    default:
      return false;
  }
}

interface ApplicabilityOutcome {
  def: RequirementDef;
  applicability: Applicability;
}

/** Determine which requirements apply — KB scope, package context, exceptions. */
function determineApplicability(a: VisionAnalysis): {
  results: ApplicabilityOutcome[];
  exceptionsApplied: EngineResult["exceptionsApplied"];
} {
  const imported = isImported(a);
  const results: ApplicabilityOutcome[] = [];
  const matched = new Map<string, ExceptionRule>();

  for (const def of REQUIREMENTS) {
    const scope = def.scope;

    // --- scope gate --------------------------------------------------------
    let applicable = true;
    let reason = requirementScopeLabel(def, a);

    if (scope === "imported") {
      applicable = imported;
      reason = imported
        ? "Applicable — package is identified as imported (origin/importer markers)."
        : "Not applicable — package does not present as imported (no foreign-origin declaration or importer block detected).";
    } else if (Array.isArray(scope)) {
      applicable = scope.includes(a.category);
      reason = applicable
        ? `Applicable — category "${a.category}" carries this requirement.`
        : `Not applicable to category "${a.category}".`;
    }

    // Liquid-medium gate for drained weight (product-class based).
    if (applicable && def.id === "rq_drained_weight") {
      applicable = productClassMatches(a, [
        "brine", "syrup", "oil", "juice", "pickle", "in liquid medium",
      ]);
      reason = applicable
        ? "Applicable — commodity appears packed in a liquid medium."
        : "Not applicable — no liquid-medium packing detected.";
    }

    // --- exceptions ---------------------------------------------------------
    let exceptionApplied: Applicability["exceptionApplied"] = null;
    if (applicable && def.exceptionIds.length > 0) {
      for (const exId of def.exceptionIds) {
        const ex = EXCEPTIONS.find((x) => x.id === exId);
        if (!ex) continue;
        if (exceptionMatches(ex, a)) {
          // Proviso check: another exception may REMOVE this one's benefit
          // (e.g. G.S.R. 881(E)/2025 — Rule 26(a) shall not apply to pan
          // masala). When the blocking exception's condition also matches,
          // the waiver does not fire; the requirement stays applicable.
          const blocked =
            ex.blockedByException != null
              ? EXCEPTIONS.find((b) => b.id === ex.blockedByException)
              : undefined;
          if (blocked && exceptionMatches(blocked, a)) {
            if (!matched.has(blocked.id)) matched.set(blocked.id, blocked);
            reason = `Exception ${ex.name} (${ex.ruleCited}) would apply, but is blocked by ${blocked.name} (${blocked.ruleCited}) — requirement remains applicable.`;
            continue;
          }
          if (!matched.has(ex.id)) matched.set(ex.id, ex);
          if (ex.waives.includes(def.id)) {
            exceptionApplied = {
              id: ex.id,
              name: ex.name,
              ruleCited: ex.ruleCited,
            };
            applicable = false;
            reason = `Waived by exception: ${ex.name} (${ex.ruleCited}).`;
            break;
          }
        }
      }
    }

    results.push({
      def,
      applicability: {
        requirementId: def.id,
        applicable,
        reason,
        scope: requirementScopeLabel(def, a),
        exceptionApplied,
      },
    });
  }

  return {
    results,
    exceptionsApplied: [...matched.values()].map((ex) => ({
      id: ex.id,
      name: ex.name,
      ruleCited: ex.ruleCited,
      description: ex.description,
      amendmentId: ex.amendmentId,
    })),
  };
}

// ---------------------------------------------------------------------------
// Per-requirement evaluation
// ---------------------------------------------------------------------------

function evaluateRequirement(
  def: RequirementDef,
  a: VisionAnalysis,
  fontChecks: FontCheckSummary,
): RequirementResult {
  const base: RequirementResult = {
    requirementId: def.id,
    title: def.title,
    ruleCited: def.ruleCited,
    requirement: def.requirementText,
    applicability: requirementScopeLabel(def, a),
    validationMethod: def.validationMethod,
    evidenceRequired: def.evidenceRequired,
    amendmentId: def.amendmentId,
    effectiveDate: def.effectiveDate,
    versionNotes: def.versionNotes,
    mandatory: def.mandatory,
    status: "REVIEW",
    confidence: 0.5,
    source: "kb",
  };

  const amendment = AMENDMENTS[def.amendmentId];
  const versionSuffix = amendment
    ? `${amendment.notification}, w.e.f. ${amendment.effectiveDate}`
    : def.effectiveDate;

  // ---- Calibrated font-height requirements -------------------------------
  if (def.validationMethod === "calibrated_measurement") {
    const m = fontChecks.measurements.find(
      (x) => x.fieldKey === def.fieldKey,
    );
    if (!fontChecks.performed || !m) {
      return {
        ...base,
        status: "REVIEW",
        detected: null,
        confidence: 0.5,
        reason:
          "Character height cannot be reliably measured from the image alone — physical calibration (real package height) is required to convert pixels to millimetres.",
        source: "rules",
      };
    }
    return {
      ...base,
      status: m.status,
      detected:
        m.actualMm != null
          ? `${m.actualMm} mm measured${m.requiredMm != null ? ` vs ≥ ${m.requiredMm} mm required` : ""}`
          : null,
      confidence: m.status === "REVIEW" ? 0.5 : 0.85,
      reason:
        m.reason ??
        (m.status === "PASS"
          ? `Measured height meets the minimum (${versionSuffix}).`
          : undefined),
      source: "rules",
    };
  }

  // ---- Officer-verification items ----------------------------------------
  if (def.validationMethod === "officer_verification") {
    const field = fieldFor(a, def.fieldKey);
    return {
      ...base,
      status: "REVIEW",
      detected: field?.value ?? "Not assessable from the image",
      evidence: field?.evidence ?? null,
      boundingBox: field?.boundingBox,
      confidence: 0.4,
      reason:
        "This requirement cannot be conclusively verified from a photograph — needs physical inspection (" +
        versionSuffix +
        ").",
      source: "rules",
    };
  }

  // ---- Image-backed requirements ------------------------------------------
  const field = fieldFor(a, def.fieldKey);
  const state = field?.state ?? "not_visible";

  if (state === "present" && field?.value) {
    const check = validateField(def.id, field.value, a);
    return {
      ...base,
      status: check.ok ? "PASS" : "FAIL",
      detected: field.value,
      evidence: field.evidence ?? null,
      boundingBox: field.boundingBox,
      confidence: check.ok
        ? Math.min(0.98, 0.6 + field.confidence * 0.35)
        : Math.min(0.95, 0.55 + field.confidence * 0.35),
      reason: check.reason ?? undefined,
      source: "image",
    };
  }

  // Absent or unreadable → REVIEW. Never FAIL.
  if (state === "unreadable") {
    return {
      ...base,
      status: "REVIEW",
      detected: "Visible area unclear / too low resolution",
      confidence: 0.4,
      reason: `The ${def.title.toLowerCase()} area is present but could not be read reliably (image quality) — insufficient evidence to conclude non-compliance.`,
      source: "image",
    };
  }
  return {
    ...base,
    status: "REVIEW",
    detected: "Not reliably visible in the provided image",
    confidence: 0.45,
    reason:
      a.imageQualityConfidence < 0.45
        ? "Image quality is too poor to conclude absence — the relevant package area may simply not be in frame (insufficient evidence)."
        : "The relevant package area is not sufficiently visible; a compliant declaration may exist on another face of the pack (insufficient evidence).",
    source: "image",
  };
}

// ---------------------------------------------------------------------------
// Calibrated font-height pass (Table I / Fourth Schedule)
// ---------------------------------------------------------------------------

export function runFontChecks(
  a: VisionAnalysis,
  calibration?: CalibrationInput,
): FontCheckSummary {
  if (!calibration || calibration.boundingBoxPixelHeight <= 0) {
    return { performed: false, mmPerPixel: null, slab: null, measurements: [] };
  }
  const mmPerPixel =
    calibration.realHeightMm / calibration.boundingBoxPixelHeight;
  const nq = a.netQuantity ?? "";
  const m = nq.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|N)/i);
  const slab = resolveSlab(
    m ? parseFloat(m[1]) : undefined,
    m ? m[2].toLowerCase() : undefined,
  );
  const slabLabel =
    slab.maxQty === null
      ? "> 5 kg / 5 L"
      : `≤ ${slab.maxQty} ${slab.unit.split("|")[0]}`;

  const targets: Array<{ key: string; label: string }> = [
    { key: "netQuantity", label: "Net quantity" },
    { key: "mrp", label: "MRP" },
  ];
  const measurements: FontMeasurement[] = targets.map((t) => {
    const f = fieldFor(a, t.key);
    if (!f?.boundingBox) {
      return {
        fieldKey: t.key,
        label: t.label,
        pixelHeight: null,
        actualMm: null,
        requiredMm: null,
        status: "REVIEW",
        reason:
          "Bounding box not localized — cannot measure character height.",
      };
    }
    const pixelHeight = f.boundingBox.h;
    const actualMm = Math.round(pixelHeight * mmPerPixel * 100) / 100;
    const requiredMm = slab.minCharHeightMm;
    if (actualMm >= requiredMm) {
      return {
        fieldKey: t.key,
        label: t.label,
        pixelHeight,
        actualMm,
        requiredMm,
        status: "PASS",
      };
    }
    return {
      fieldKey: t.key,
      label: t.label,
      pixelHeight,
      actualMm,
      requiredMm,
      status: "FAIL",
      reason: `Measured character height ${actualMm} mm is below the minimum of ${requiredMm} mm for this slab (${slabLabel}).`,
    };
  });

  return {
    performed: true,
    mmPerPixel: Math.round(mmPerPixel * 10000) / 10000,
    slab: { ...slab, label: slabLabel },
    measurements,
  };
}

// ---------------------------------------------------------------------------
// Full evaluation pass
// ---------------------------------------------------------------------------

export function evaluate(
  a: VisionAnalysis,
  db: DatabaseLookup | null,
  calibration?: CalibrationInput,
): EngineResult {
  const fontChecks = runFontChecks(a, calibration);

  // ---- Barcode checksum (independent of database availability) ------------
  const barcodeChecksumValid =
    a.barcode.value != null
      ? (a.barcode.checksumValid ?? gtinChecksumValid(a.barcode.value))
      : null;

  // ---- Image ↔ database cross-check ---------------------------------------
  const mismatches = crossCheck(a, db);
  const crossCheckSummary: CrossCheckSummary = {
    performed: !!db?.product,
    source: db?.product?.source ?? null,
    dbFound: !!db?.product?.found,
    dbTitle: db?.product?.title ?? null,
    dbBrand: db?.product?.brand ?? null,
    barcodeChecksumValid,
    mismatches,
    note:
      db?.product && !db.product.found
        ? "Barcode was read but is not registered in the product database — treated as an identification aid only; package text remains the primary evidence."
        : db?.error
          ? `Product database lookup failed (${db.error}) — evaluation relies on package evidence only.`
          : !db?.product
            ? "No decodable barcode — product-database cross-check skipped; package evidence only."
            : null,
  };

  const { results: appOutcomes, exceptionsApplied } =
    determineApplicability(a);
  // Only APPLICABLE requirements are evaluated into report rows —
  // non-applicable and exception-waived requirements are recorded in the
  // applicability table (with their reason) but never counted or verdicted.
  const requirements = appOutcomes
    .filter(({ applicability }) => applicability.applicable)
    .map(({ def, applicability }) => {
      const r = evaluateRequirement(def, a, fontChecks);
      r.applicability = applicability.reason;
      if (applicability.exceptionApplied) {
        r.exceptionApplied = applicability.exceptionApplied;
      }
      return r;
    });

  // Cross-check mismatches override affected identity requirements to REVIEW
  // (never auto-pick a source, never FAIL on ambiguity).
  if (mismatches.length > 0) {
    for (const r of requirements) {
      if (
        mismatches.some((m) => m.field === "brand") &&
        r.requirementId === "rq_common_name"
      ) {
        r.status = "REVIEW";
        r.reason =
          "Barcode database brand conflicts with the brand read on the package — conflicting sources, manual verification required.";
        r.source = "image+database";
      }
      if (
        mismatches.some((m) => m.field === "net_quantity") &&
        r.requirementId === "rq_net_quantity"
      ) {
        const m = mismatches.find((m) => m.field === "net_quantity");
        r.status = "REVIEW";
        r.reason = `Package reads ${m?.imageValue} but the product database lists ${m?.databaseValue} — conflicting sources, manual verification required.`;
        r.source = "image+database";
      }
      if (
        mismatches.some((m) => m.field === "product_identity") &&
        r.requirementId === "rq_common_name"
      ) {
        r.status = "REVIEW";
        r.reason =
          "Product identity on the package conflicts with the product database entry — conflicting sources, manual verification required.";
        r.source = "image+database";
      }
    }
  }

  const passCount = requirements.filter((r) => r.status === "PASS").length;
  const failCount = requirements.filter((r) => r.status === "FAIL").length;
  const reviewCount = requirements.filter((r) => r.status === "REVIEW").length;
  const applicableCount = appOutcomes.filter(
    (x) => x.applicability.applicable,
  ).length;

  const decision: EngineResult["decision"] =
    failCount > 0 ? "FAIL" : reviewCount > 0 ? "REVIEW" : "PASS";

  const fails = requirements.filter((r) => r.status === "FAIL");
  const summarySentence =
    decision === "FAIL"
      ? `${fails.length} clearly violated requirement${fails.length > 1 ? "s" : ""} — e.g. ${fails
          .slice(0, 2)
          .map((f) => f.title.toLowerCase())
          .join("; ")}.`
      : decision === "REVIEW"
        ? "No clear violations, but some requirements could not be verified from this image (insufficient evidence) — review recommended."
        : `All ${applicableCount} applicable requirements verified compliant on the visible evidence.`;

  // Transactional / platform obligations listed for officer context.
  const outOfScopeRequirements = RULE_RECORDS.filter(
    (r) => r.validationMethod === "out_of_label_scope",
  ).map((r) => ({
    id: r.id,
    title: r.requirementShort,
    ruleCited: r.subRule,
    applicability: scopeLabel(r.scope),
  }));

  return {
    decision,
    requirements,
    applicability: appOutcomes.map((x) => x.applicability),
    crossCheck: crossCheckSummary,
    fontChecks,
    exceptionsApplied,
    outOfScopeRequirements,
    passCount,
    failCount,
    reviewCount,
    applicableCount,
    appliedRuleVersion: RULES_VERSION,
    kbVersion: KB_VERSION,
    kbSources: KB_SOURCES,
    summarySentence,
  };
}

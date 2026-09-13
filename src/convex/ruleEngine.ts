// Rule Engine v2 — AI-cross-verification Legal Metrology evaluator.
//
// Inputs (three sources):
//   1. VisionAnalysis   — what the AI understood from the package image.
//   2. DatabaseLookup   — optional GTIN/barcode product-database result.
//   3. CalibrationInput — optional physical calibration (font-height slabs).
//
// Output: a rule-by-rule RequirementResult[] plus an overall decision.
// Decision logic (uncertainty-preserving):
//   any mandatory FAIL  → NON-COMPLIANT (FAIL)
//   else any REVIEW     → REVIEW
//   else                → COMPLIANT (PASS)

import {
  REQUIREMENTS,
  applicableRequirements,
  crossCheck,
  fieldFor,
  gtinChecksumValid,
  type VisionAnalysis,
  type DatabaseLookup,
  type RequirementResult,
  type Applicability,
  type MismatchReport,
  type RequirementDef,
} from "./productRules";
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
  passCount: number;
  failCount: number;
  reviewCount: number;
  applicableCount: number;
  appliedRuleVersion: string;
  /** Plain-language one-liner for the consumer card. */
  summarySentence: string;
}

export const RULES_VERSION = "lm2011.vision.2.0";

function labelForFieldKey(key: string): string {
  return REQUIREMENTS.find((r) => r.fieldKey === key)?.title ?? key;
}

/** Evaluate a single requirement definition against the analysis. */
function evaluateRequirement(
  def: RequirementDef,
  a: VisionAnalysis,
  fontChecks: FontCheckSummary,
): RequirementResult {
  // Font-height requirements are evaluated from physical measurements.
  if (def.id === "rq_quantity_font" || def.id === "rq_mrp_font") {
    const m = fontChecks.measurements.find(
      (x) => x.fieldKey === def.fieldKey,
    );
    if (!fontChecks.performed || !m) {
      return {
        requirementId: def.id,
        title: def.title,
        ruleCited: def.ruleCited,
        mandatory: def.mandatory,
        status: "REVIEW",
        detected: null,
        confidence: 0.5,
        reason:
          "Character height cannot be reliably measured from the image alone — needs physical calibration (real package height) to convert pixels to millimetres.",
        source: "rules",
      };
    }
    return {
      requirementId: def.id,
      title: def.title,
      ruleCited: def.ruleCited,
      mandatory: def.mandatory,
      status: m.status,
      detected:
        m.actualMm != null
          ? `${m.actualMm} mm measured${m.requiredMm != null ? ` vs ≥ ${m.requiredMm} mm required` : ""}`
          : null,
      confidence: m.status === "REVIEW" ? 0.5 : 0.85,
      reason: m.reason,
      source: "rules",
    };
  }

  const field = fieldFor(a, def.fieldKey);
  const state = field?.state ?? "not_visible";

  // Value confidently read → run the curated format/content check.
  if (state === "present" && field?.value) {
    const check = def.check(field.value, a);
    if (check.ok) {
      return {
        requirementId: def.id,
        title: def.title,
        ruleCited: def.ruleCited,
        mandatory: def.mandatory,
        status: "PASS",
        detected: field.value,
        evidence: field.evidence ?? null,
        boundingBox: field.boundingBox,
        confidence: Math.min(0.98, 0.6 + field.confidence * 0.35),
        source: "image",
      };
    }
    return {
      requirementId: def.id,
      title: def.title,
      ruleCited: def.ruleCited,
      mandatory: def.mandatory,
      status: "FAIL",
      detected: field.value,
      evidence: field.evidence ?? null,
      boundingBox: field.boundingBox,
      confidence: Math.min(0.95, 0.55 + field.confidence * 0.35),
      reason:
        check.reason ??
        `Declared value "${field.value}" does not meet the requirement.`,
      source: "image",
    };
  }

  // Not visible vs unreadable — both REVIEW, distinct reasons. Never FAIL.
  if (state === "unreadable") {
    return {
      requirementId: def.id,
      title: def.title,
      ruleCited: def.ruleCited,
      mandatory: def.mandatory,
      status: "REVIEW",
      detected: "Visible area unclear / too low resolution",
      confidence: 0.4,
      reason: `The ${labelForFieldKey(def.fieldKey).toLowerCase()} area is present but could not be read reliably (image quality).`,
      source: "image",
    };
  }
  return {
    requirementId: def.id,
    title: def.title,
    ruleCited: def.ruleCited,
    mandatory: def.mandatory,
    status: "REVIEW",
    detected: "Not reliably visible in the provided image",
    confidence: 0.45,
    reason:
      a.imageQualityConfidence < 0.45
        ? "Image quality is too poor to conclude absence — the relevant package area may simply not be in frame."
        : "The relevant package area is not sufficiently visible; a compliant declaration may exist on another face of the pack.",
    source: "image",
  };
}

/** Physical font-height pass (only when calibration is provided). */
export function runFontChecks(
  a: VisionAnalysis,
  calibration?: CalibrationInput,
): FontCheckSummary {
  if (!calibration || calibration.boundingBoxPixelHeight <= 0) {
    return {
      performed: false,
      mmPerPixel: null,
      slab: null,
      measurements: [],
    };
  }
  const mmPerPixel = calibration.realHeightMm / calibration.boundingBoxPixelHeight;
  // Slab comes from the declared net quantity when readable.
  const nq = a.netQuantity ?? "";
  const m = nq.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|N)/i);
  const slab = resolveSlab(
    m ? parseFloat(m[1]) : undefined,
    m ? m[2].toLowerCase() : undefined,
  );
  const slabLabel =
    slab.maxQty === null ? "> 5 kg / 5 L" : `≤ ${slab.maxQty} ${slab.unit.split("|")[0]}`;

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
        reason: "Bounding box not localized — cannot measure character height.",
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
      reason: `Measured character height ${actualMm} mm is below the Fourth Schedule minimum of ${requiredMm} mm for this slab (${slabLabel}).`,
    };
  });

  return {
    performed: true,
    mmPerPixel: Math.round(mmPerPixel * 10000) / 10000,
    slab: { ...slab, label: slabLabel },
    measurements,
  };
}

/** Full evaluation pass. */
export function evaluate(
  a: VisionAnalysis,
  db: DatabaseLookup | null,
  calibration?: CalibrationInput,
): EngineResult {
  const fontChecks = runFontChecks(a, calibration);

  // ---- Barcode checksum (independent of database availability) -----------
  const barcodeChecksumValid =
    a.barcode.value != null
      ? (a.barcode.checksumValid ?? gtinChecksumValid(a.barcode.value))
      : null;

  // ---- Image ↔ database cross-check --------------------------------------
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

  const app = applicableRequirements(a);
  const requirements = app.map(({ def }) => evaluateRequirement(def, a, fontChecks));

  // Cross-check mismatches override the identity requirements to REVIEW
  // (never auto-pick a source, never FAIL on ambiguity).
  if (mismatches.length > 0) {
    for (const r of requirements) {
      if (
        mismatches.some((m) => m.field === "brand") &&
        r.ruleCited.includes("6(1)(c)")
      ) {
        r.status = "REVIEW";
        r.reason =
          "Barcode database brand conflicts with the brand read on the package — manual verification required.";
        r.source = "image+database";
      }
      if (
        mismatches.some((m) => m.field === "net_quantity") &&
        r.requirementId === "rq_net_quantity"
      ) {
        r.status = "REVIEW";
        r.reason = `Package reads ${mismatches.find((m) => m.field === "net_quantity")?.imageValue} but the product database lists ${mismatches.find((m) => m.field === "net_quantity")?.databaseValue} — conflicting sources, manual verification required.`;
        r.source = "image+database";
      }
      if (
        mismatches.some((m) => m.field === "product_identity") &&
        r.requirementId === "rq_common_name"
      ) {
        r.status = "REVIEW";
        r.reason = "Product identity on the package conflicts with the product database entry — manual verification required.";
        r.source = "image+database";
      }
    }
  }

  const passCount = requirements.filter((r) => r.status === "PASS").length;
  const failCount = requirements.filter((r) => r.status === "FAIL").length;
  const reviewCount = requirements.filter((r) => r.status === "REVIEW").length;
  const applicableCount = app.filter((x) => x.applicable).length;

  const decision: EngineResult["decision"] =
    failCount > 0 ? "FAIL" : reviewCount > 0 ? "REVIEW" : "PASS";

  const fails = requirements.filter((r) => r.status === "FAIL");
  const summarySentence =
    decision === "FAIL"
      ? `${fails.length} mandatory requirement${fails.length > 1 ? "s" : ""} not met — e.g. ${fails
          .slice(0, 2)
          .map((f) => f.title.toLowerCase())
          .join("; ")}.`
      : decision === "REVIEW"
        ? "No clear violations, but some requirements could not be verified from this image — review recommended."
        : `All ${applicableCount} applicable requirements verified compliant on the visible evidence.`;

  return {
    decision,
    requirements,
    applicability: app.map((x) => x.applicability),
    crossCheck: crossCheckSummary,
    fontChecks,
    passCount,
    failCount,
    reviewCount,
    applicableCount,
    appliedRuleVersion: RULES_VERSION,
    summarySentence,
  };
}

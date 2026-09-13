// Legal Metrology compliance data contracts + field/format validators.
//
// The requirement matrix itself lives in rulesKnowledgeBase.ts (versioned,
// amendment-tracked). This module holds the analysis/result shapes the vision
// pipeline exchanges, plus deterministic format validators keyed by rule id.
//
// Verdict semantics (enforced by the engine):
//   PASS   — requirement confidently satisfied on visible evidence.
//   FAIL   — value WAS read and is clearly non-compliant. A declaration the AI
//            simply cannot read is NEVER a FAIL.
//   REVIEW — insufficient evidence / uncertainty (unreadable, hidden panel,
//            uncertain category, conflicting sources…).

import {
  RULE_RECORDS,
  scopeLabel,
  type RequirementScope,
  type ValidationMethod,
} from "./rulesKnowledgeBase";

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
  /** Product-class note from the AI ("soap", "pan masala", "drug"…) — drives exception matching. */
  productClass?: string | null;
  /** Context flags the AI can see on the pack. */
  importedPackage?: boolean | null;
  notForRetailSale?: boolean | null;
  whenPackedDeclaration?: boolean | null;
  innerPackage?: boolean | null;
  manufacturer?: string | null;
  packer?: string | null;
  importer?: string | null;
  manufacturerAddress?: string | null;
  netQuantity?: string | null;
  mrp?: string | null;
  unitSalePrice?: string | null;
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

/**
 * One applicable requirement and its evaluation outcome. Every field the final
 * report must show is carried here so a row is self-contained and traceable:
 * rule reference, requirement text, applicability basis, detected value,
 * evidence, AI confidence, validation method, verdict and reason.
 */
export interface RequirementResult {
  requirementId: string;
  title: string;
  /** Exact rule citation for the applicable version, e.g. "Rule 6(1)(e)". */
  ruleCited: string;
  /** Full requirement text of the cited version. */
  requirement: string;
  /** Human-readable applicability basis (scope / category / context). */
  applicability: string;
  /** How this requirement was validated. */
  validationMethod: ValidationMethod;
  /** What evidence PASS requires. */
  evidenceRequired: string;
  /** Amendment/version provenance of the cited requirement. */
  amendmentId: string;
  effectiveDate: string;
  versionNotes: string;
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
  /** Exception that waived this requirement, when one applied. */
  exceptionApplied?: { id: string; name: string; ruleCited: string } | null;
  source: "image" | "image+database" | "rules" | "kb";
}

export interface Applicability {
  requirementId: string;
  applicable: boolean;
  reason: string;
  /** Human-readable scope the requirement carries. */
  scope?: string;
  /** Exception that waived the requirement, when applicable. */
  exceptionApplied?: { id: string; name: string; ruleCited: string } | null;
}

// ---------------------------------------------------------------------------
// Deterministic format validators — keyed by KB rule id. These run ONLY when
// the AI confidently read a value (state === "present"). An unreadable or
// absent declaration never reaches a validator, so it can never FAIL there.
// ---------------------------------------------------------------------------

export interface FieldCheckResult {
  ok: boolean;
  reason?: string;
}

export function validateField(
  id: string,
  value: string,
  _a: VisionAnalysis,
): FieldCheckResult {
  switch (id) {
    case "rq_name_address":
      return { ok: value.trim().length >= 4 };
    case "rq_country_origin_imported":
      return { ok: value.trim().length >= 3 };
    case "rq_common_name":
      return { ok: value.trim().length >= 2 };
    case "rq_net_quantity": {
      const ok = /\d/.test(value) && /(kg|g|ml|l|n|cm|m)\b/i.test(value);
      return {
        ok,
        reason: ok
          ? undefined
          : `Net quantity "${value}" does not use a standard prescribed unit (g, kg, ml, l, N, cm, m or count).`,
      };
    }
    case "rq_mrp": {
      const ok = value.includes("₹");
      return {
        ok,
        reason: ok
          ? undefined
          : `MRP is printed as "${value}" — under G.S.R. 779(E)/2021 the ₹ symbol is mandatory; the "Rs." style is no longer a valid declaration.`,
      };
    }
    case "rq_unit_sale_price": {
      const ok = value.includes("₹") && /(\bper\b|\/)/i.test(value);
      return {
        ok,
        reason: ok
          ? undefined
          : `Unit sale price "${value}" must state the price with the ₹ symbol per specified unit (e.g. "₹ 0.37 per g").`,
      };
    }
    case "rq_month_year": {
      const ok = /^(0?[1-9]|1[0-2])[/\-.](\d{2}|\d{4})$/.test(value.trim());
      return {
        ok,
        reason: ok
          ? undefined
          : `Date "${value}" is not in the prescribed Month/Year (MM/YYYY or MM/YY) form.`,
      };
    }
    case "rq_consumer_care": {
      const phone = /\+?\d[\d\s\-()]{7,}/.test(value);
      const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value);
      if (phone && email) return { ok: true };
      if (!phone && !email) {
        return {
          ok: false,
          reason: `Consumer-care declaration "${value}" carries neither a telephone number nor an e-mail address (required form under G.S.R. 779(E)/2021).`,
        };
      }
      // Partial block (phone without e-mail or vice versa): the remaining line
      // may sit on another panel — that is REVIEW-grade, never an instant FAIL.
      return {
        ok: true,
        reason: undefined,
      };
    }
    case "rq_fssai": {
      const ok = /^\d{14}$/.test(value.replace(/\D/g, ""));
      return {
        ok,
        reason: ok ? undefined : `FSSAI licence "${value}" is not a 14-digit number.`,
      };
    }
    case "rq_best_before":
      return { ok: value.trim().length >= 4 };
    case "rq_ingredients":
      return { ok: value.trim().length >= 8 };
    case "rq_drained_weight":
      return { ok: value.trim().length >= 2 };
    default:
      return { ok: value.trim().length >= 2 };
  }
}

// ---------------------------------------------------------------------------
// KB-derived requirement view used by the engine and the frontend. All legal
// text is looked up from the versioned knowledge base — never re-stated here.
// ---------------------------------------------------------------------------

export interface RequirementDef {
  id: string;
  title: string;
  ruleCited: string;
  mandatory: boolean;
  fieldKey: string;
  scope: RequirementScope;
  validationMethod: ValidationMethod;
  requirementText: string;
  evidenceRequired: string;
  versionNotes: string;
  amendmentId: string;
  effectiveDate: string;
  exceptionIds: string[];
}

/**
 * All KB records that a package scan can evaluate. Transactional / platform
 * obligations (out_of_label_scope) are excluded from per-image evaluation but
 * remain listed in applicability tables for officer context.
 */
export const REQUIREMENTS: RequirementDef[] = RULE_RECORDS.filter(
  (r) => r.validationMethod !== "out_of_label_scope",
).map((r) => ({
  id: r.id,
  title: r.requirementShort,
  ruleCited: r.subRule,
  mandatory: r.mandatory,
  fieldKey: r.fieldKey,
  scope: r.scope,
  validationMethod: r.validationMethod,
  requirementText: r.requirement,
  evidenceRequired: r.evidenceRequired,
  versionNotes: r.versionNotes,
  amendmentId: r.amendmentId,
  effectiveDate: r.effectiveDate,
  exceptionIds: r.exceptionIds,
}));

/** Requirement's applicability basis as shown in reports. */
export function requirementScopeLabel(def: RequirementDef, a: VisionAnalysis): string {
  const base = scopeLabel(def.scope);
  if (Array.isArray(def.scope)) {
    return `Applicable — category "${a.category}" (${base})`;
  }
  return base;
}

/** Field lookup helper on the analysis. */
export function fieldFor(a: VisionAnalysis, key: string): ExtractedField | null {
  return a.fields.find((f) => f.key === key) ?? null;
}

/**
 * Compare the image-derived identity with the database product (when a GTIN
 * lookup succeeded). Returns mismatches — never picks a winner automatically;
 * every mismatch forces the affected requirement to REVIEW.
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
  if (
    dbTitle &&
    a.productName &&
    !norm(dbTitle).includes(norm(a.productName).split(" ").slice(0, 2).join(" "))
  ) {
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
  if (
    dbBrand &&
    a.brand &&
    norm(dbBrand) !== norm(a.brand) &&
    !norm(dbTitle).includes(norm(a.brand))
  ) {
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

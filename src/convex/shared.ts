// Shared schema validators — the Phase-1 "contract" of the platform.
// Everything (API args, DB tables, report drafts) is built on these so the
// backend and both portals share one source of truth.

import { v } from "convex/values";

/** Portal role that produced a scan. */
export const portalRole = v.union(v.literal("consumer"), v.literal("officer"));

/** Rule-6 declaration field types recognized by the OCR classifier. */
export const fieldType = v.union(
  v.literal("mrp"),
  v.literal("net_quantity"),
  v.literal("mfd_date"),
  v.literal("manufacturer"),
  v.literal("consumer_care"),
  v.literal("country_of_origin"),
);

/** What the classifier did to a region's text. */
export const classificationAction = v.union(
  v.literal("accepted"),
  v.literal("rejected_low_confidence"),
  v.literal("rejected_unmatched"),
  v.literal("rejected_duplicate"),
);

/** One OCR-detected text region with its bounding box [x, y, w, h]. */
export const ocrRegion = v.object({
  regionId: v.number(),
  rawText: v.string(),
  confidence: v.number(),
  boundingBox: v.object({
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
  }),
  match: v.optional(
    v.object({
      field: fieldType,
      value: v.string(),
      matchedPattern: v.string(),
      patternIndex: v.number(),
    }),
  ),
  classification: classificationAction,
});

/** Engine that produced the regions — records fallback chain. */
export const ocrEngineMeta = v.object({
  primary: v.string(),
  usedFallback: v.boolean(),
  regionsCount: v.number(),
  durationMs: v.number(),
});

/** Physical package calibration for font-height checks. */
export const calibrationData = v.object({
  realHeightMm: v.number(),
  boundingBoxPixelHeight: v.number(),
  mmPerPixel: v.number(),
});

/** A formatting violation citing a specific Rule 6 clause. */
export const formattingViolation = v.object({
  field: v.union(fieldType, v.null()),
  ruleCited: v.string(),
  details: v.string(),
});

/** A Fourth Schedule character-height violation. */
export const fontSizeViolation = v.object({
  field: fieldType,
  actualMm: v.number(),
  requiredMm: v.number(),
  citation: v.string(),
});

/** Full validation verdict for a scan. */
export const validationResult = v.object({
  isCompliant: v.boolean(),
  complianceScore: v.number(),
  missingFields: v.array(fieldType),
  formattingViolations: v.array(formattingViolation),
  fontSizeViolations: v.array(fontSizeViolation),
  appliedRuleVersion: v.string(),
});

/** Normed address of an inspection site (state/district optional). */
export const geoLocation = v.object({
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  state: v.optional(v.string()),
  district: v.optional(v.string()),
});

/** Stored scan document shape (mirrors the Pydantic `Scan` contract). */
export const scanDocFields = {
  scanId: v.string(),
  timestamp: v.number(),
  geolocation: v.optional(geoLocation),
  imageHash: v.string(),
  imageWidth: v.number(),
  imageHeight: v.number(),
  imageUrl: v.optional(v.string()),
  portalRole,
  productName: v.optional(v.string()),
  brand: v.optional(v.string()),
  packageSizeValue: v.optional(v.number()),
  packageSizeUnit: v.optional(
    v.union(v.literal("g"), v.literal("kg"), v.literal("ml"), v.literal("l")),
  ),
  calibration: v.optional(calibrationData),
  regions: v.array(ocrRegion),
  ocrMeta: v.optional(ocrEngineMeta),
  extraction: v.optional(v.any()),
  result: v.optional(validationResult),
  source: v.union(
    v.literal("upload"),
    v.literal("camera"),
    v.literal("url"),
    v.literal("offline_sync"),
  ),
  createdAt: v.number(),
  officerId: v.optional(v.id("users")),
};

/** Brand key used for repeat-offender aggregation. */
export function brandKey(brand?: string, productName?: string): string {
  const b = (brand ?? "").trim().toLowerCase();
  if (b) return b;
  const p = (productName ?? "").trim().toLowerCase();
  if (p) return p;
  return "unidentified";
}

/** Capitalize a unit for display ("kg" -> "Kg"). */
export function displayUnit(unit?: string): string {
  if (!unit) return "";
  if (unit === "g") return "g";
  if (unit === "l") return "L";
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

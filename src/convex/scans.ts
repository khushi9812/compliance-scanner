// Scan API — ingestion, processing pipeline orchestration, repository
// queries, and analytics aggregation for both portals.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  fieldType,
  geoLocation,
  ocrRegion,
  ocrEngineMeta,
  calibrationData,
  formattingViolation,
  fontSizeViolation,
  validationResult,
} from "./shared";
import {
  runOcrPipeline,
  acceptedMatches,
  classifyClientRegions,
  type ClassifiedRegion,
  type OcrEngineMeta,
  type ClientRegionInput,
} from "./ocr";
import { mmPerPixel } from "./calibration";
import { validate, type ExtractionSummary } from "./ruleEngine";

type FieldKey =
  | "mrp"
  | "net_quantity"
  | "mfd_date"
  | "manufacturer"
  | "consumer_care"
  | "country_of_origin";

/** Deterministic scan id derived from the image hash + timestamp. */
function makeScanId(imageHash: string, ts: number): string {
  const base = imageHash.replace(/[^a-f0-9]/gi, "").slice(0, 12);
  return `SCN-${base.toUpperCase()}-${ts.toString(36).toUpperCase()}`;
}

/** Process a capture end-to-end and persist the scan. */
export const processScan = action({
  args: {
    imageHash: v.string(),
    imageWidth: v.number(),
    imageHeight: v.number(),
    portalRole: v.union(v.literal("consumer"), v.literal("officer")),
    source: v.union(
      v.literal("upload"),
      v.literal("camera"),
      v.literal("url"),
      v.literal("offline_sync"),
    ),
    geolocation: v.optional(geoLocation),
    calibration: v.optional(
      v.object({
        realHeightMm: v.number(),
        boundingBoxPixelHeight: v.number(),
      }),
    ),
    packageSizeOverride: v.optional(
      v.object({ value: v.number(), unit: v.string() }),
    ),
    imageUrl: v.optional(v.string()),
    productName: v.optional(v.string()),
    brand: v.optional(v.string()),
    // Pin a known example label layout (see LABEL_SAMPLES layoutIndex).
    layoutIndex: v.optional(v.number()),
    // Real OCR output from the browser (Tesseract.js line regions).
    ocrRegions: v.optional(
      v.array(
        v.object({
          rawText: v.string(),
          confidence: v.number(),
          boundingBox: v.object({
            x: v.number(),
            y: v.number(),
            w: v.number(),
            h: v.number(),
          }),
        }),
      ),
    ),
    ocrMeta: v.optional(ocrEngineMeta),
    // Example location tags so the heatmap/demo data reads like field data.
    state: v.optional(v.string()),
    district: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);

    // ---- 1. OCR pipeline --------------------------------------------------
    // Two paths: real text recognized in the browser (Tesseract.js) is
    // classified here against Rule 6; when no regions are provided (or the
    // capture found nothing readable), fall back to the deterministic
    // example-layout pipeline so specimen scans keep working.
    let regions: ClassifiedRegion[] = [];
    let meta: OcrEngineMeta = {
      primary: "tesseract.js",
      usedFallback: false,
      regionsCount: 0,
      durationMs: 0,
    };
    if (args.ocrRegions && args.ocrRegions.length > 0) {
      regions = classifyClientRegions(args.ocrRegions);
      meta = args.ocrMeta ?? {
        primary: "tesseract.js",
        usedFallback: false,
        regionsCount: regions.length,
        durationMs: 0,
      };
    } else if (args.layoutIndex != null) {
      const out = runOcrPipeline(
        args.imageWidth,
        args.imageHeight,
        args.imageHash,
        args.layoutIndex,
      );
      regions = out.regions;
      meta = out.meta;
    } else {
      regions = [];
      meta = {
        primary: "tesseract.js",
        usedFallback: false,
        regionsCount: 0,
        durationMs: 0,
      };
    }

    // ---- 2. Extraction summary -------------------------------------------
    const matches = acceptedMatches(regions);
    const fields: ExtractionSummary["fields"] = {};
    for (const key of Object.keys(matches) as FieldKey[]) {
      const m = matches[key];
      if (!m) continue;
      const region = regions.find((r) => r.regionId === m.regionId);
      if (!region) continue;
      fields[key] = {
        value: m.value,
        confidence: m.confidence,
        regionId: m.regionId,
        boundingBox: region.boundingBox,
      };
    }
    const extraction: ExtractionSummary = {
      fields,
      rawRegions: regions.length,
    };

    // ---- 3. Package size from the net-quantity declaration ----------------
    let packageSizeValue: number | undefined;
    let packageSizeUnit: string | undefined;
    const nq = fields.net_quantity;
    if (nq) {
      const m = nq.value.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|l|N)$/);
      if (m) {
        packageSizeValue = parseFloat(m[1]);
        packageSizeUnit = m[2];
      }
    }
    if (args.packageSizeOverride) {
      packageSizeValue = args.packageSizeOverride.value;
      packageSizeUnit = args.packageSizeOverride.unit;
    }

    // ---- 4. Calibration (officer-only, Fourth Schedule) -------------------
    let calData:
      | { realHeightMm: number; boundingBoxPixelHeight: number; mmPerPixel: number }
      | undefined;
    let declaredRegions: Array<{ field: FieldKey; pixelHeight: number }> = [];
    if (args.calibration) {
      const ratio = mmPerPixel(args.calibration);
      calData = {
        realHeightMm: args.calibration.realHeightMm,
        boundingBoxPixelHeight: args.calibration.boundingBoxPixelHeight,
        mmPerPixel: Math.round(ratio * 10000) / 10000,
      };
      declaredRegions = Object.entries(fields).map(([field, entry]) => ({
        field: field as FieldKey,
        pixelHeight: entry.boundingBox.h,
      }));
    }

    // ---- 5. Rule engine ----------------------------------------------------
    const result = validate(
      extraction,
      calData
        ? {
            realHeightMm: calData.realHeightMm,
            boundingBoxPixelHeight: calData.boundingBoxPixelHeight,
          }
        : undefined,
      declaredRegions,
      packageSizeValue,
      packageSizeUnit,
    );

    // ---- 6. Persist ---------------------------------------------------------
    const now = Date.now();
    const scanId = makeScanId(args.imageHash, now);
    await ctx.runMutation(api.scans.insertScan, {
      scanId,
      timestamp: now,
      geolocation: args.geolocation
        ? {
            lat: args.geolocation.lat,
            lng: args.geolocation.lng,
            state: args.state ?? args.geolocation.state,
            district: args.district ?? args.geolocation.district,
          }
        : args.state || args.district
          ? { state: args.state, district: args.district }
          : undefined,
      imageHash: args.imageHash,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      imageUrl: args.imageUrl,
      portalRole: args.portalRole,
      source: args.source,
      productName: fields.manufacturer?.value ?? args.productName,
      brand: args.brand ?? fields.manufacturer?.value,
      packageSizeValue,
      packageSizeUnit: packageSizeUnit as
        | "g"
        | "kg"
        | "ml"
        | "l"
        | undefined,
      calibration: calData,
      regions: regions.map((r) => ({
        regionId: r.regionId,
        rawText: r.rawText,
        confidence: r.confidence,
        boundingBox: r.boundingBox,
        match: r.match
          ? {
              field: r.match.field,
              value: r.match.value,
              matchedPattern: r.match.matchedPattern,
              patternIndex: r.match.patternIndex,
            }
          : undefined,
        classification: r.classification,
      })),
      ocrMeta: meta,
      extraction: { fields },
      result: {
        isCompliant: result.isCompliant,
        complianceScore: result.complianceScore,
        missingFields: result.missingFields,
        formattingViolations: result.formattingViolations,
        fontSizeViolations: result.fontSizeViolations,
        appliedRuleVersion: result.appliedRuleVersion,
      },
      isCompliant: result.isCompliant,
      officerId: userId ?? undefined,
      createdAt: now,
    });

    return scanId;
  },
});

/** Persist a processed scan (internal mutation used by processScan). */
export const insertScan = mutation({
  args: {
    scanId: v.string(),
    timestamp: v.number(),
    geolocation: v.optional(geoLocation),
    imageHash: v.string(),
    imageWidth: v.number(),
    imageHeight: v.number(),
    imageUrl: v.optional(v.string()),
    portalRole: v.union(v.literal("consumer"), v.literal("officer")),
    source: v.union(
      v.literal("upload"),
      v.literal("camera"),
      v.literal("url"),
      v.literal("offline_sync"),
    ),
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
    isCompliant: v.optional(v.boolean()),
    officerId: v.optional(v.id("users")),
    createdAt: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"scans">> => {
    return await ctx.db.insert("scans", args);
  },
});

// ---------------------------------------------------------------------------
// Repository queries
// ---------------------------------------------------------------------------

export const scanSummary = v.object({
  _id: v.id("scans"),
  scanId: v.string(),
  timestamp: v.number(),
  portalRole: v.string(),
  isCompliant: v.optional(v.boolean()),
  complianceScore: v.optional(v.number()),
  brand: v.optional(v.string()),
  productName: v.optional(v.string()),
  packageSizeValue: v.optional(v.number()),
  packageSizeUnit: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageHash: v.string(),
  source: v.string(),
  state: v.optional(v.string()),
  district: v.optional(v.string()),
  violationCount: v.number(),
  missingCount: v.number(),
});

/** Repository listing with filters (status, role, brand, search). */
export const listScans = query({
  args: {
    portalRole: v.optional(
      v.union(v.literal("consumer"), v.literal("officer")),
    ),
    status: v.optional(
      v.union(
        v.literal("all"),
        v.literal("compliant"),
        v.literal("flagged"),
      ),
    ),
    brand: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("scans")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    const search = args.search?.trim().toLowerCase() ?? "";
    const rows = all
      .filter((s) => {
        if (args.portalRole && s.portalRole !== args.portalRole) return false;
        if (args.status === "compliant" && s.isCompliant !== true) return false;
        if (args.status === "flagged" && s.isCompliant !== false) return false;
        if (args.brand) {
          const b = (s.brand ?? "").toLowerCase();
          if (!b.includes(args.brand.toLowerCase())) return false;
        }
        if (search) {
          const hay = [
            s.scanId,
            s.brand ?? "",
            s.productName ?? "",
            s.imageHash,
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map((s) => ({
        _id: s._id,
        scanId: s.scanId,
        timestamp: s.timestamp,
        portalRole: s.portalRole,
        isCompliant: s.isCompliant,
        complianceScore: s.result?.complianceScore ?? 0,
        brand: s.brand,
        productName: s.productName,
        packageSizeValue: s.packageSizeValue,
        packageSizeUnit: s.packageSizeUnit,
        imageUrl: s.imageUrl,
        imageHash: s.imageHash,
        source: s.source,
        state: s.geolocation?.state,
        district: s.geolocation?.district,
        violationCount:
          (s.result?.formattingViolations.length ?? 0) +
          (s.result?.fontSizeViolations.length ?? 0),
        missingCount: s.result?.missingFields.length ?? 0,
      }));

    return rows.slice(0, args.limit ?? 200);
  },
});

/** Fetch one full scan by its human-readable scanId. */
export const getScanByScanId = query({
  args: { scanId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scans")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .first();
  },
});

/** Get a scan document by internal id. */
export const getScan = query({
  args: { id: v.id("scans") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analytics = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("scans").withIndex("by_createdAt").collect();

    const total = all.length;
    const compliant = all.filter((s) => s.isCompliant === true).length;
    const flagged = all.filter((s) => s.isCompliant === false).length;

    // Daily pass/fail series (last 14 days, filled).
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDay: Array<{
      date: string;
      compliant: number;
      flagged: number;
    }> = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = today.getTime() - i * dayMs;
      const dayEnd = dayStart + dayMs;
      const dayScans = all.filter(
        (s) => s.timestamp >= dayStart && s.timestamp < dayEnd,
      );
      byDay.push({
        date: new Date(dayStart).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        compliant: dayScans.filter((s) => s.isCompliant === true).length,
        flagged: dayScans.filter((s) => s.isCompliant === false).length,
      });
    }

    // Portal split.
    const byRole = {
      consumer: all.filter((s) => s.portalRole === "consumer").length,
      officer: all.filter((s) => s.portalRole === "officer").length,
    };

    // Repeat offenders: flagged scans per brand, top 8.
    const brandCounts = new Map<
      string,
      { flagged: number; total: number }
    >();
    for (const s of all) {
      const key = (s.brand ?? "Unidentified").trim() || "Unidentified";
      const cur = brandCounts.get(key) ?? { flagged: 0, total: 0 };
      cur.total += 1;
      if (s.isCompliant === false) cur.flagged += 1;
      brandCounts.set(key, cur);
    }
    const repeatOffenders = [...brandCounts.entries()]
      .map(([brand, c]) => ({ brand, ...c }))
      .filter((r) => r.flagged > 0)
      .sort((a, b) => b.flagged - a.flagged)
      .slice(0, 8);

    // State/district heatmap rows.
    const stateMap = new Map<
      string,
      { total: number; flagged: number; districts: Set<string> }
    >();
    for (const s of all) {
      const state = s.geolocation?.state || "Unmapped";
      const cur =
        stateMap.get(state) ?? { total: 0, flagged: 0, districts: new Set() };
      cur.total += 1;
      if (s.isCompliant === false) cur.flagged += 1;
      if (s.geolocation?.district) cur.districts.add(s.geolocation.district);
      stateMap.set(state, cur);
    }
    const byState = [...stateMap.entries()]
      .map(([state, c]) => ({
        state,
        total: c.total,
        flagged: c.flagged,
        districts: c.districts.size,
      }))
      .sort((a, b) => b.flagged - a.flagged);

    // Violation category frequency (missing / formatting / font per field).
    const catMap = new Map<string, number>();
    for (const s of all) {
      for (const f of s.result?.missingFields ?? []) {
        catMap.set(`Missing: ${f}`, (catMap.get(`Missing: ${f}`) ?? 0) + 1);
      }
      for (const v of s.result?.formattingViolations ?? []) {
        const label = v.field ? `Format: ${v.field}` : "Format: general";
        catMap.set(label, (catMap.get(label) ?? 0) + 1);
      }
      for (const v of s.result?.fontSizeViolations ?? []) {
        const label = `Font: ${v.field}`;
        catMap.set(label, (catMap.get(label) ?? 0) + 1);
      }
    }
    const violationTypes = [...catMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total,
      compliant,
      flagged,
      complianceRatio: total > 0 ? Math.round((compliant / total) * 100) : 0,
      byDay,
      byRole,
      repeatOffenders,
      byState,
      violationTypes,
    };
  },
});

/**
 * Seed example cases so the repository, analytics, heatmap, and notice
 * generator can be explored with data immediately. Uses the four example
 * label panels at varied locations. Idempotent: skips if scans exist.
 */
export const seedExampleCases = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("scans").first();
    if (existing) return { seeded: false, reason: "scans exist" } as const;

    const plan: Array<{
      layoutIndex: number;
      brand: string;
      state: string;
      district: string;
      calibration: { realHeightMm: number; boundingBoxPixelHeight: number };
      size: { value: number; unit: string };
      source: "upload" | "camera" | "url" | "offline_sync";
    }> = [
      {
        layoutIndex: 0,
        brand: "Sunrise Foods Pvt. Ltd.",
        state: "Karnataka",
        district: "Bengaluru Urban",
        calibration: { realHeightMm: 240, boundingBoxPixelHeight: 1200 },
        size: { value: 500, unit: "g" },
        source: "upload",
      },
      {
        layoutIndex: 1,
        brand: "Greenleaf Industries",
        state: "Maharashtra",
        district: "Pune",
        calibration: { realHeightMm: 190, boundingBoxPixelHeight: 950 },
        size: { value: 340, unit: "ml" },
        source: "camera",
      },
      {
        layoutIndex: 2,
        brand: "Deccan Snacks Pvt Ltd",
        state: "Telangana",
        district: "Hyderabad",
        calibration: { realHeightMm: 260, boundingBoxPixelHeight: 1040 },
        size: { value: 80, unit: "g" },
        source: "upload",
      },
      {
        layoutIndex: 3,
        brand: "AquaPure Beverages Ltd.",
        state: "Tamil Nadu",
        district: "Chennai",
        calibration: { realHeightMm: 300, boundingBoxPixelHeight: 1500 },
        size: { value: 1, unit: "l" },
        source: "offline_sync",
      },
      {
        layoutIndex: 1,
        brand: "Greenleaf Industries",
        state: "Karnataka",
        district: "Mysuru",
        calibration: { realHeightMm: 190, boundingBoxPixelHeight: 950 },
        size: { value: 340, unit: "ml" },
        source: "camera",
      },
      {
        layoutIndex: 3,
        brand: "AquaPure Beverages Ltd.",
        state: "Tamil Nadu",
        district: "Coimbatore",
        calibration: { realHeightMm: 300, boundingBoxPixelHeight: 1500 },
        size: { value: 1, unit: "l" },
        source: "offline_sync",
      },
    ];

    let i = 0;
    for (const p of plan) {
      const imageHash = `seed${p.layoutIndex}${i}`.padEnd(24, "0");
      const { regions, meta } = runOcrPipeline(
        640,
        880,
        imageHash,
        p.layoutIndex,
      );
      const matches = acceptedMatches(regions);
      const fields: ExtractionSummary["fields"] = {};
      for (const key of Object.keys(matches) as FieldKey[]) {
        const m = matches[key];
        if (!m) continue;
        const region = regions.find((r) => r.regionId === m.regionId);
        if (!region) continue;
        fields[key] = {
          value: m.value,
          confidence: m.confidence,
          regionId: m.regionId,
          boundingBox: region.boundingBox,
        };
      }
      const extraction: ExtractionSummary = { fields, rawRegions: regions.length };
      const declaredRegions = Object.entries(fields).map(([field, entry]) => ({
        field: field as FieldKey,
        pixelHeight: entry.boundingBox.h,
      }));
      const result = validate(
        extraction,
        p.calibration,
        declaredRegions,
        p.size.value,
        p.size.unit,
      );
      const now = Date.now() - i * 36e5 * 9; // spread over recent days
      const scanId = makeScanId(imageHash, now);
      await ctx.db.insert("scans", {
        scanId,
        timestamp: now,
        geolocation: { state: p.state, district: p.district },
        imageHash,
        imageWidth: 640,
        imageHeight: 880,
        portalRole: i % 3 === 2 ? "consumer" : "officer",
        source: p.source,
        productName: fields.manufacturer?.value,
        brand: p.brand,
        packageSizeValue: p.size.value,
        packageSizeUnit: p.size.unit as "g" | "kg" | "ml" | "l",
        calibration: {
          realHeightMm: p.calibration.realHeightMm,
          boundingBoxPixelHeight: p.calibration.boundingBoxPixelHeight,
          mmPerPixel:
            Math.round((p.calibration.realHeightMm / p.calibration.boundingBoxPixelHeight) * 10000) /
            10000,
        },
        regions: regions.map((r) => ({
          regionId: r.regionId,
          rawText: r.rawText,
          confidence: r.confidence,
          boundingBox: r.boundingBox,
          match: r.match
            ? {
                field: r.match.field,
                value: r.match.value,
                matchedPattern: r.match.matchedPattern,
                patternIndex: r.match.patternIndex,
              }
            : undefined,
          classification: r.classification,
        })),
        ocrMeta: meta,
        extraction: { fields },
        result: {
          isCompliant: result.isCompliant,
          complianceScore: result.complianceScore,
          missingFields: result.missingFields,
          formattingViolations: result.formattingViolations,
          fontSizeViolations: result.fontSizeViolations,
          appliedRuleVersion: result.appliedRuleVersion,
        },
        isCompliant: result.isCompliant,
        createdAt: now,
      });
      i += 1;
    }
    return { seeded: true, count: plan.length } as const;
  },
});

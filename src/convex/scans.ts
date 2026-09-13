// Scan API — persistence, repository queries, and analytics for the AI
// vision pipeline. The heavy lifting lives in vision.ts (action); this file is
// queries/mutations only (no "use node" constraints here).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { evaluate } from "./ruleEngine";
import { EXAMPLE_CASES } from "./visionSpecimens";
import type { VisionAnalysis, DatabaseLookup } from "./productRules";
import type { EngineResult } from "./ruleEngine";
import type { Id } from "./_generated/dataModel";

/** Shared persisted document shape for one analysis. */
function scanDoc(input: {
  scanId: string;
  timestamp: number;
  imageHash: string;
  imageWidth: number;
  imageHeight: number;
  evidenceStorageId?: Id<"_storage">;
  imageUrl?: string;
  portalRole: "consumer" | "officer";
  source: "upload" | "camera" | "url" | "offline_sync";
  geolocation?: {
    lat?: number;
    lng?: number;
    state?: string;
    district?: string;
  };
  calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
  analysis: VisionAnalysis;
  database: DatabaseLookup;
  engineResult: EngineResult;
  officerId?: Id<"users">;
  createdAt: number;
}) {
  const a = input.analysis;
  return {
    scanId: input.scanId,
    timestamp: input.timestamp,
    imageHash: input.imageHash,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    evidenceStorageId: input.evidenceStorageId,
    imageUrl: input.imageUrl,
    portalRole: input.portalRole,
    source: input.source,
    geolocation: input.geolocation,
    calibration: input.calibration,
    analysis: a,
    database: input.database,
    result: input.engineResult,
    // Denormalized for index-filtered analytics / repository filters.
    decision: input.engineResult.decision,
    brand: a.brand ?? undefined,
    productName: a.productName ?? undefined,
    category: a.category,
    createdAt: input.createdAt,
    officerId: input.officerId,
  };
}

const scanDocArgs = {
  scanId: v.string(),
  timestamp: v.number(),
  imageHash: v.string(),
  imageWidth: v.number(),
  imageHeight: v.number(),
  evidenceStorageId: v.optional(v.id("_storage")),
  imageUrl: v.optional(v.string()),
  portalRole: v.union(v.literal("consumer"), v.literal("officer")),
  source: v.union(
    v.literal("upload"),
    v.literal("camera"),
    v.literal("url"),
    v.literal("offline_sync"),
  ),
  geolocation: v.optional(
    v.object({
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      state: v.optional(v.string()),
      district: v.optional(v.string()),
    }),
  ),
  calibration: v.optional(
    v.object({
      realHeightMm: v.number(),
      boundingBoxPixelHeight: v.number(),
    }),
  ),
  analysis: v.any(),
  database: v.any(),
  result: v.any(),
  decision: v.union(v.literal("PASS"), v.literal("FAIL"), v.literal("REVIEW")),
  brand: v.optional(v.string()),
  productName: v.optional(v.string()),
  category: v.string(),
  createdAt: v.number(),
  officerId: v.optional(v.id("users")),
};

/** Persist a processed analysis (called by the vision action). */
export const insertAnalysis = mutation({
  args: scanDocArgs,
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
  decision: v.union(
    v.literal("PASS"),
    v.literal("FAIL"),
    v.literal("REVIEW"),
  ),
  brand: v.optional(v.string()),
  productName: v.optional(v.string()),
  category: v.optional(v.string()),
  hasBarcode: v.boolean(),
  imageUrl: v.optional(v.string()),
  imageHash: v.string(),
  source: v.string(),
  state: v.optional(v.string()),
  district: v.optional(v.string()),
  passCount: v.number(),
  failCount: v.number(),
  reviewCount: v.number(),
  applicableCount: v.number(),
});

/** Repository listing with filters (decision, role, category, search). */
export const listScans = query({
  args: {
    portalRole: v.optional(
      v.union(v.literal("consumer"), v.literal("officer")),
    ),
    decision: v.optional(
      v.union(
        v.literal("all"),
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("REVIEW"),
      ),
    ),
    category: v.optional(v.string()),
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
        if (args.decision && args.decision !== "all" && s.decision !== args.decision)
          return false;
        if (args.category && args.category !== "all" && s.category !== args.category)
          return false;
        if (search) {
          const hay = [
            s.scanId,
            s.brand ?? "",
            s.productName ?? "",
            s.imageHash,
            s.analysis.barcode.value ?? "",
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
        decision: s.decision,
        brand: s.brand,
        productName: s.productName,
        category: s.category,
        hasBarcode: !!(s.analysis.barcode.value ?? s.database?.product),
        imageUrl: s.imageUrl,
        imageHash: s.imageHash,
        source: s.source,
        state: s.geolocation?.state,
        district: s.geolocation?.district,
        passCount: s.result.passCount,
        failCount: s.result.failCount,
        reviewCount: s.result.reviewCount,
        applicableCount: s.result.applicableCount,
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

/** Storage URL for the stored evidence image. */
export const evidenceUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
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
    const pass = all.filter((s) => s.decision === "PASS").length;
    const fail = all.filter((s) => s.decision === "FAIL").length;
    const review = all.filter((s) => s.decision === "REVIEW").length;

    // Daily verdict series (last 14 days, filled).
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDay: Array<{
      date: string;
      pass: number;
      fail: number;
      review: number;
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
        pass: dayScans.filter((s) => s.decision === "PASS").length,
        fail: dayScans.filter((s) => s.decision === "FAIL").length,
        review: dayScans.filter((s) => s.decision === "REVIEW").length,
      });
    }

    const byRole = {
      consumer: all.filter((s) => s.portalRole === "consumer").length,
      officer: all.filter((s) => s.portalRole === "officer").length,
    };

    // Repeat offenders: FAILed scans per brand, top 8.
    const brandCounts = new Map<string, { fail: number; total: number }>();
    for (const s of all) {
      const key = (s.brand ?? s.productName ?? "Unidentified").trim() || "Unidentified";
      const cur = brandCounts.get(key) ?? { fail: 0, total: 0 };
      cur.total += 1;
      if (s.decision === "FAIL") cur.fail += 1;
      brandCounts.set(key, cur);
    }
    const repeatOffenders = [...brandCounts.entries()]
      .map(([brand, c]) => ({ brand, ...c }))
      .filter((r) => r.fail > 0)
      .sort((a, b) => b.fail - a.fail)
      .slice(0, 8);

    // State/district heatmap rows.
    const stateMap = new Map<
      string,
      { total: number; fail: number; districts: Set<string> }
    >();
    for (const s of all) {
      const state = s.geolocation?.state || "Unmapped";
      const cur =
        stateMap.get(state) ?? { total: 0, fail: 0, districts: new Set() };
      cur.total += 1;
      if (s.decision === "FAIL") cur.fail += 1;
      if (s.geolocation?.district) cur.districts.add(s.geolocation.district);
      stateMap.set(state, cur);
    }
    const byState = [...stateMap.entries()]
      .map(([state, c]) => ({
        state,
        total: c.total,
        fail: c.fail,
        districts: c.districts.size,
      }))
      .sort((a, b) => b.fail - a.fail);

    // Most frequent failing requirements across all scans.
    const catMap = new Map<string, number>();
    for (const s of all) {
      for (const r of s.result.requirements ?? []) {
        if (r.status === "FAIL") {
          catMap.set(r.title, (catMap.get(r.title) ?? 0) + 1);
        }
      }
    }
    const violationTypes = [...catMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total,
      pass,
      fail,
      review,
      complianceRatio: total > 0 ? Math.round((pass / total) * 100) : 0,
      byDay,
      byRole,
      repeatOffenders,
      byState,
      violationTypes,
    };
  },
});

// ---------------------------------------------------------------------------
// Specimen seeding — deterministic example cases run through the REAL engine
// so repository / analytics / notices are explorable immediately. Idempotent.
// ---------------------------------------------------------------------------

export const seedExampleCases = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("scans").first();
    if (existing) return { seeded: false as const, reason: "scans exist" };

    let i = 0;
    for (const c of EXAMPLE_CASES) {
      const imageHash = `seed${c.id}${i}`.padEnd(24, "0");
      const engine = evaluate(c.analysis, c.database, c.calibration);
      const now = Date.now() - i * 36e5 * 9; // spread over recent days
      const base = imageHash.replace(/[^a-f0-9]/gi, "").slice(0, 12);
      const scanId = `SCN-${base.toUpperCase()}-${now.toString(36).toUpperCase()}`;
      await ctx.db.insert(
        "scans",
        scanDoc({
          scanId,
          timestamp: now,
          imageHash,
          imageWidth: c.imageWidth,
          imageHeight: c.imageHeight,
          portalRole: c.portalRole,
          source: c.source,
          geolocation: { state: c.state, district: c.district },
          calibration: c.calibration,
          analysis: c.analysis,
          database: c.database,
          engineResult: engine,
          createdAt: now,
        }),
      );
      i += 1;
    }
    return { seeded: true as const, count: EXAMPLE_CASES.length };
  },
});

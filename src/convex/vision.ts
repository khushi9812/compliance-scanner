// Vision analysis pipeline — replaces the old OCR keyword-matching stack.
//
// Image → AI vision (Google Lens-style whole-image understanding) → structured
// product extraction → GTIN barcode lookup cross-check → Legal Metrology rule
// engine → evidence-anchored PASS / FAIL / REVIEW report, persisted to Convex.
//
// Nothing is synthesized: every extracted value must be read from the image by
// the model, and database fields come only from the product database.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { vly } from "../lib/vly-integrations";
import {
  gtinChecksumValid,
  gtinPrefixRegion,
  type VisionAnalysis,
  type DatabaseLookup,
  type ExtractedField,
  type ProductCategory,
} from "./productRules";
import { evaluate, type EngineResult } from "./ruleEngine";

// ---------------------------------------------------------------------------
// Prompt + schema the vision model must fill
// ---------------------------------------------------------------------------

const VISION_SYSTEM_PROMPT = `You are a visual product-label analyst performing a Google Lens-style reading of ONE photo of a packaged commodity (Indian market). You understand the meaning and context of everything visible on the package: brand marks, product names, logos, text of any style, and the EAN/UPC barcode.

STRICT RULES:
- NEVER invent information. If a declaration is not visible, leave it out of "fields" and set the corresponding top-level slot to null.
- If text is present but too unclear to read reliably, set that field's state to "unreadable" (state: "unreadable"), do not guess a value.
- Do not depend on exact keyword matching: understand abbreviations (M.R.P., MRP, Net Wt., Net Qty., Mfd, Pkd, Mfg, Best Before, Use By, M/s, Mkt. by, Consumer Care, Helpline, FSSAI Lic. No., Country of Origin, Made in ...) in any layout or font.
- Values must be normalized: MRP as "₹<number>" (e.g. "₹120"); net quantity as "<number> <unit>" with unit g|kg|ml|l|N; dates as MM/YYYY or MM/YY; FSSAI as the 14-digit number.
- "evidence" is the exact printed text you read the value from, quoted verbatim as printed (e.g. "M.R.P. ₹120/-").
- "boundingBox" is in PIXELS of the provided image [x, y, w, h] around that printed declaration. Omit the box when you cannot localize it confidently.
- Read the barcode ONLY if it is actually visible and legible; report its digits exactly. Set barcode.value null if there is no legible barcode. Do not guess digits.
- Classify the product into exactly one category: packaged_food | beverage | personal_care | household_chemical | other.
- imageQualityConfidence (0..1): your certainty that the photo captures enough of the label to make verdicts. Blur, glare, partial panels, tight crops → lower it.

Respond with ONLY a JSON object of this shape:
{
  "brand": string|null, "productName": string|null, "productVariant": string|null,
  "category": "packaged_food"|"beverage"|"personal_care"|"household_chemical"|"other",
  "categoryConfidence": number, "packageType": string|null,
  "manufacturer": string|null, "packer": string|null, "importer": string|null,
  "manufacturerAddress": string|null,
  "netQuantity": string|null, "mrp": string|null, "batchNumber": string|null,
  "manufactureDate": string|null, "bestBefore": string|null,
  "countryOfOrigin": string|null, "consumerCare": string|null,
  "fssaiLicense": string|null, "licenseInfo": string|null,
  "ingredients": string|null,
  "barcode": { "value": string|null, "symbology": string|null },
  "fields": [ { "key": string, "label": string, "value": string, "evidence": string, "confidence": number, "state": "present"|"unreadable", "boundingBox": {"x":number,"y":number,"w":number,"h":number} } ],
  "otherDeclarations": string[], "warnings": string[],
  "imageQualityConfidence": number, "notes": string|null
}
In "fields", include every declaration you read (key ∈ brand, productName, productVariant, manufacturer, packer, importer, manufacturerAddress, netQuantity, mrp, batchNumber, manufactureDate, bestBefore, countryOfOrigin, consumerCare, fssaiLicense, licenseInfo, ingredients, other-<name>). Fields with state "unreadable" have no value but must carry evidence and a boundingBox.`;

// ---------------------------------------------------------------------------
// Model output sanitation (defensive; the engine never trusts the model)
// ---------------------------------------------------------------------------

function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 && t.toLowerCase() !== "null" ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asConfidence(v: unknown, fallback = 0.5): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
}

function asCategory(v: unknown): ProductCategory {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("food")) return "packaged_food";
  if (s.includes("bever") || s.includes("drink") || s.includes("water") || s.includes("juice"))
    return "beverage";
  if (s.includes("personal") || s.includes("cosmetic") || s.includes("shampoo") || s.includes("soap") || s.includes("cream"))
    return "personal_care";
  if (s.includes("household") || s.includes("detergent") || s.includes("cleaner") || s.includes("chemical"))
    return "household_chemical";
  if (s === "other" || s === "unknown") return s === "unknown" ? "unknown" : "other";
  return "other";
}

function asBoundingBox(v: unknown): ExtractedField["boundingBox"] {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const x = Number(o.x), y = Number(o.y), w = Number(o.w), h = Number(o.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0)) return undefined;
  if (w < 2 || h < 2) return undefined;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Parse the model's JSON answer (tolerates fenced output) into VisionAnalysis. */
export function parseVisionJson(
  raw: string,
  engine: string,
): VisionAnalysis {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Absolute no-fabrication fallback: an unparseable answer means no claims.
    return {
      category: "unknown",
      categoryConfidence: 0,
      barcode: { value: null, symbology: null, checksumValid: null },
      fields: [
        {
          key: "analysis",
          label: "AI analysis",
          confidence: 0,
          state: "unreadable",
          evidence: "Model returned an unparseable response — no data extracted.",
        },
      ],
      otherDeclarations: [],
      warnings: ["The vision model response could not be parsed — treat this scan as REVIEW."],
      imageQualityConfidence: 0.2,
      engine,
      notes: "parse-failure",
    };
  }

  const warnings = Array.isArray(j.warnings)
    ? (j.warnings as unknown[]).map((w) => String(w)).filter(Boolean)
    : [];

  const barcodeObj = (j.barcode ?? {}) as Record<string, unknown>;
  const barcodeValue = asStringOrNull(barcodeObj.value)?.replace(/[^\dXx]/g, "") ?? null;

  const fields: ExtractedField[] = Array.isArray(j.fields)
    ? (j.fields as unknown[])
        .map((f): ExtractedField | null => {
          if (f == null || typeof f !== "object") return null;
          const o = f as Record<string, unknown>;
          const key = asStringOrNull(o.key);
          if (!key) return null;
          const state = o.state === "unreadable" ? "unreadable" : "present";
          const value = state === "present" ? asStringOrNull(o.value) : undefined;
          if (state === "present" && !value) return null;
          return {
            key,
            label: asStringOrNull(o.label) ?? key,
            value,
            evidence: asStringOrNull(o.evidence),
            confidence: asConfidence(o.confidence, state === "present" ? 0.7 : 0.4),
            state,
            boundingBox: asBoundingBox(o.boundingBox),
          };
        })
        .filter((f): f is ExtractedField => f != null)
    : [];

  const category = asCategory(j.category);

  return {
    brand: asStringOrNull(j.brand),
    productName: asStringOrNull(j.productName),
    productVariant: asStringOrNull(j.productVariant),
    category,
    categoryConfidence: asConfidence(j.categoryConfidence, 0.5),
    packageType: asStringOrNull(j.packageType),
    manufacturer: asStringOrNull(j.manufacturer),
    packer: asStringOrNull(j.packer),
    importer: asStringOrNull(j.importer),
    manufacturerAddress: asStringOrNull(j.manufacturerAddress),
    netQuantity: asStringOrNull(j.netQuantity),
    mrp: asStringOrNull(j.mrp),
    batchNumber: asStringOrNull(j.batchNumber),
    manufactureDate: asStringOrNull(j.manufactureDate),
    bestBefore: asStringOrNull(j.bestBefore),
    countryOfOrigin: asStringOrNull(j.countryOfOrigin),
    consumerCare: asStringOrNull(j.consumerCare),
    fssaiLicense: asStringOrNull(j.fssaiLicense),
    licenseInfo: asStringOrNull(j.licenseInfo),
    ingredients: asStringOrNull(j.ingredients),
    barcode: {
      value: barcodeValue && /^\d{6,14}$/.test(barcodeValue) ? barcodeValue : null,
      symbology: asStringOrNull(barcodeObj.symbology),
      checksumValid: barcodeValue ? gtinChecksumValid(barcodeValue) : null,
      prefixRegion: barcodeValue ? gtinPrefixRegion(barcodeValue) : null,
    },
    fields,
    otherDeclarations: Array.isArray(j.otherDeclarations)
      ? (j.otherDeclarations as unknown[]).map((s) => String(s)).filter(Boolean)
      : [],
    warnings,
    imageQualityConfidence: asConfidence(j.imageQualityConfidence, 0.6),
    engine,
    notes: asStringOrNull(j.notes),
  };
}

// ---------------------------------------------------------------------------
// Product database lookup by GTIN (identification aid only — never a source of
// legal truth; conflicts are surfaced, not auto-resolved)
// ---------------------------------------------------------------------------

async function lookupProductDatabase(
  gtin: string,
): Promise<DatabaseLookup> {
  // User-supplied key (Keys tab) takes priority; falls back to the open
  // UPCitemdb trial endpoint when absent.
  const key = process.env.UPCITEMDB_API_KEY;
  const base = "https://api.upcitemdb.com";
  const path = key ? "/prod/v1/lookup" : "/prod/trial/lookup";
  try {
    const res = await fetch(`${base}${path}?upc=${encodeURIComponent(gtin)}`, {
      headers: {
        "User-Agent": "MetroScan/2.0 (compliance-analysis)",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
    });
    if (!res.ok) {
      return { product: null, error: `database HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      code?: string | number;
      total?: number;
      items?: Array<{
        title?: string;
        brand?: string;
        category?: string;
        manufacturer?: string;
        weight?: string;
        image?: string;
      }>;
    };
    if (data.code && String(data.code) !== "OK" && String(data.code) !== "0") {
      return { product: null, error: `database code ${data.code}` };
    }
    const item = data.items?.[0];
    if (!item) return { product: { source: "UPCitemdb", found: false } };
    return {
      product: {
        source: "UPCitemdb",
        found: true,
        title: item.title ?? undefined,
        brand: item.brand ?? undefined,
        category: item.category ?? undefined,
        manufacturer: item.manufacturer ?? undefined,
        netWeight: item.weight ?? undefined,
        imageUrl: item.image ?? undefined,
      },
    };
  } catch (e) {
    return {
      product: null,
      error: e instanceof Error ? e.message : "lookup failed",
    };
  }
}

// ---------------------------------------------------------------------------
// The main action
// ---------------------------------------------------------------------------

function makeScanId(imageHash: string, ts: number): string {
  const base = imageHash.replace(/[^a-f0-9]/gi, "").slice(0, 12);
  return `SCN-${base.toUpperCase()}-${ts.toString(36).toUpperCase()}`;
}

export const analyzeAndRecord = action({
  args: {
    imageDataUrl: v.string(),
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
    imageUrl: v.optional(v.string()),
    barcodeOverride: v.optional(v.string()),
    /** Specimens carry a pinned VisionAnalysis so demos are deterministic. */
    specimenAnalysis: v.optional(v.any()),
    specimenDb: v.optional(v.any()),
    specimenImage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    // ---- 1. Google-Lens-style visual understanding ------------------------
    let analysis: VisionAnalysis;
    let evidenceDataUrl: string | undefined = args.specimenImage ?? args.imageDataUrl;

    if (args.specimenAnalysis) {
      analysis = args.specimenAnalysis as VisionAnalysis;
    } else {
      const result = await vly.com.completion({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this packaged-commodity label photo and return the JSON exactly as specified.",
              },
              {
                type: "image_url",
                image_url: { url: args.imageDataUrl },
              },
            ],
          },
        ],
        temperature: 0,
        maxTokens: 2000,
      });

      if (!result.success || !result.data) {
        throw new Error(
          `Vision analysis unavailable (${result.error ?? "unknown error"}). Please try again.`,
        );
      }

      const raw =
        typeof result.data === "object" && result.data !== null && "content" in (result.data as Record<string, unknown>)
          ? String((result.data as Record<string, unknown>).content)
          : typeof result.data === "string"
            ? result.data
            : JSON.stringify(result.data);
      analysis = parseVisionJson(raw, "gpt-4o-mini via VLY gateway");
      evidenceDataUrl = args.imageDataUrl;
    }

    if (args.barcodeOverride && !analysis.barcode.value) {
      analysis.barcode.value = args.barcodeOverride;
      analysis.barcode.symbology = analysis.barcode.symbology ?? "EAN-13 (device-decoded)";
      analysis.barcode.checksumValid = gtinChecksumValid(args.barcodeOverride);
      analysis.barcode.prefixRegion = gtinPrefixRegion(args.barcodeOverride);
    }

    // ---- 2. Barcode → product database (identification aid) ----------------
    let db: DatabaseLookup = { product: null };
    if (analysis.barcode.value) {
      db = await lookupProductDatabase(analysis.barcode.value);
    }

    // ---- 3. Legal Metrology rule engine (PASS/FAIL/REVIEW) -----------------
    const engine: EngineResult = evaluate(analysis, db, args.calibration);

    // ---- 4. Persist + store evidence image ---------------------------------
    const scanId = makeScanId(args.imageHash, now);
    let evidenceId: Id<"_storage"> | undefined;
    try {
      const base64 = evidenceDataUrl.split(",")[1] ?? "";
      if (base64) {
        evidenceId = await ctx.storage.upload(
          new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
            type: "image/jpeg",
          }),
        );
      }
    } catch {
      evidenceId = undefined; // evidence storage is best-effort
    }

    await ctx.runMutation(api.scans.insertAnalysis, {
      scanId,
      timestamp: now,
      imageHash: args.imageHash,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      evidenceStorageId: evidenceId,
      imageUrl: args.imageUrl,
      portalRole: args.portalRole,
      source: args.source,
      geolocation: args.geolocation,
      calibration: args.calibration,
      analysis,
      database: db,
      engineResult: engine,
      officerId: userId ?? undefined,
      createdAt: now,
    });

    return scanId;
  },
});

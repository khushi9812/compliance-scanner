// OCR pipeline — text-region classification into Rule 6 declaration fields.
// Mirrors ocr_engine.py: segment -> classify via rules_2011.json patterns ->
// normalize values. Uses deterministic seeded synthesis so results are stable
// and testable; swap `segmentRegions` for PaddleOCR/EasyOCR calls when a GPU
// vision worker is attached.

import rules from "./rules_2011.json";

type FieldKey =
  | "mrp"
  | "net_quantity"
  | "mfd_date"
  | "manufacturer"
  | "consumer_care"
  | "country_of_origin";

type PatternMap = Record<FieldKey, string[]>;

export interface SegmentRegion {
  regionId: number;
  rawText: string;
  confidence: number;
  boundingBox: { x: number; y: number; w: number; h: number };
}

export interface MatchInfo {
  field: FieldKey;
  value: string;
  matchedPattern: string;
  patternIndex: number;
}

export interface ClassifiedRegion extends SegmentRegion {
  match?: MatchInfo;
  classification:
    | "accepted"
    | "rejected_low_confidence"
    | "rejected_unmatched"
    | "rejected_duplicate";
}

export interface OcrEngineMeta {
  primary: string;
  usedFallback: boolean;
  regionsCount: number;
  durationMs: number;
}

const PATTERNS = rules.ocr.patterns as unknown as PatternMap;
const MIN_CONF = rules.ocr.minConfidence;

/** Field priority for duplicate resolution (highest wins). */
const FIELD_PRIORITY: FieldKey[] = [
  "mrp",
  "mfd_date",
  "net_quantity",
  "country_of_origin",
  "consumer_care",
  "manufacturer",
];

function patternToRegex(p: string): RegExp {
  return new RegExp(p, "i");
}

/**
 * Segment the label into text regions. In production this is the
 * PaddleOCR/EasyOCR detection pass (CRAFT text detector). Here we simulate
 * the detector deterministically from the image dimensions + hash.
 */
export function segmentRegions(
  imageWidth: number,
  imageHeight: number,
  imageHash: string,
  layoutIndex?: number,
): SegmentRegion[] {
  const seedBase = hashSeed(imageHash);
  const layout = pickLayout(seedBase, layoutIndex);
  return layout.map((r, i) => {
    const seed = seedBase + i * 17;
    const conf = 0.6 + (seed % 39) / 100; // 0.60 .. 0.98
    const w = Math.round(imageWidth * r.wf);
    const h = Math.round(imageHeight * r.hf);
    const x = Math.round((imageWidth - w) * r.xf);
    const y = Math.round((imageHeight - h) * r.yf);
    return {
      regionId: i,
      rawText: r.text,
      confidence: Math.round(conf * 100) / 100,
      boundingBox: {
        x: Math.max(0, x),
        y: Math.max(0, y),
        w: Math.max(8, w),
        h: Math.max(8, h),
      },
    };
  });
}

function hashSeed(hash: string): number {
  let s = 5381;
  for (let i = 0; i < hash.length; i++) {
    s = ((s << 5) + s + hash.charCodeAt(i)) | 0;
  }
  return Math.abs(s);
}

interface LayoutRow {
  text: string;
  wf: number;
  hf: number;
  xf: number;
  yf: number;
}

/**
 * Deterministic label layouts representing common packaged-commodity panels.
 * `layoutIndex` pins a specific panel (used by the built-in example labels).
 */
function pickLayout(seed: number, layoutIndex?: number): LayoutRow[] {
  const layouts: LayoutRow[][] = [
    [
      { text: "Crunchy Muesli 500g", wf: 0.5, hf: 0.07, xf: 0.08, yf: 0.05 },
      { text: "MRP Rs 185 (Inclusive of all taxes)", wf: 0.42, hf: 0.05, xf: 0.06, yf: 0.16 },
      { text: "Net Wt. 500 g", wf: 0.3, hf: 0.05, xf: 0.08, yf: 0.25 },
      { text: "MFD MM/YYYY 03/2026", wf: 0.34, hf: 0.05, xf: 0.07, yf: 0.34 },
      { text: "Manufactured by Sunrise Foods Pvt. Ltd.", wf: 0.55, hf: 0.05, xf: 0.06, yf: 0.43 },
      { text: "Customer Care: 1800-123-4567", wf: 0.4, hf: 0.05, xf: 0.07, yf: 0.52 },
    ],
    [
      { text: "HERBAL SHAMPOO", wf: 0.46, hf: 0.07, xf: 0.1, yf: 0.04 },
      { text: "Net Qty. 340 ml", wf: 0.3, hf: 0.05, xf: 0.1, yf: 0.18 },
      { text: "M.R.P ₹ 245.00", wf: 0.26, hf: 0.05, xf: 0.12, yf: 0.27 },
      { text: "Pkd 11/25", wf: 0.22, hf: 0.04, xf: 0.12, yf: 0.36 },
      { text: "M/s Greenleaf Industries", wf: 0.44, hf: 0.05, xf: 0.1, yf: 0.45 },
      { text: "Country of Origin: India", wf: 0.38, hf: 0.05, xf: 0.1, yf: 0.54 },
      { text: "helpline care@example.com", wf: 0.36, hf: 0.04, xf: 0.11, yf: 0.63 },
    ],
    [
      { text: "Masala Chips", wf: 0.4, hf: 0.08, xf: 0.12, yf: 0.06 },
      { text: "MRP ₹ 35", wf: 0.24, hf: 0.05, xf: 0.12, yf: 0.2 },
      { text: "NET WT 80 g", wf: 0.26, hf: 0.05, xf: 0.13, yf: 0.29 },
      { text: "Manufactured by: Deccan Snacks Pvt Ltd", wf: 0.55, hf: 0.05, xf: 0.1, yf: 0.38 },
      { text: "MFD 08/2025", wf: 0.24, hf: 0.05, xf: 0.12, yf: 0.47 },
      { text: "Made in India", wf: 0.28, hf: 0.05, xf: 0.12, yf: 0.56 },
    ],
    [
      { text: "MINERAL WATER", wf: 0.5, hf: 0.09, xf: 0.08, yf: 0.05 },
      { text: "1 L", wf: 0.14, hf: 0.06, xf: 0.12, yf: 0.22 },
      { text: "Rs.20/-", wf: 0.2, hf: 0.05, xf: 0.11, yf: 0.33 },
      { text: "Pack 04/2026", wf: 0.26, hf: 0.05, xf: 0.11, yf: 0.42 },
      { text: "Marketed by AquaPure Beverages Ltd.", wf: 0.52, hf: 0.05, xf: 0.08, yf: 0.51 },
      { text: "Consumer Care: +91 9876543210", wf: 0.44, hf: 0.05, xf: 0.09, yf: 0.6 },
    ],
  ];
  return layouts[layoutIndex != null ? layoutIndex % layouts.length : seed % layouts.length];
}

/**
 * Classify each region against the Rule-6 patterns from rules_2011.json.
 * Enforces minimum confidence and resolves duplicate field matches by
 * priority (the strongest MRP beats a stray price, etc.).
 */
export function classifyRegions(
  segments: SegmentRegion[],
): ClassifiedRegion[] {
  const candidates: { idx: number; match: MatchInfo }[] = [];
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    if (seg.confidence < MIN_CONF) continue;
    for (const field of FIELD_PRIORITY) {
      const patterns = PATTERNS[field] ?? [];
      for (let pi = 0; pi < patterns.length; pi++) {
        const m = seg.rawText.match(patternToRegex(patterns[pi]));
        if (m) {
          candidates.push({
            idx,
            match: {
              field,
              value: normalizeValue(field, m[0]),
              matchedPattern: patterns[pi],
              patternIndex: pi,
            },
          });
          break;
        }
      }
    }
  }

  // Resolve duplicates: first (highest-priority) field claim wins.
  const claimed = new Map<number, MatchInfo>();
  const seenFields = new Set<FieldKey>();
  for (const c of candidates) {
    if (seenFields.has(c.match.field) || claimed.has(c.idx)) continue;
    claimed.set(c.idx, c.match);
    seenFields.add(c.match.field);
  }

  return segments.map((seg, idx) => {
    if (seg.confidence < MIN_CONF) {
      return { ...seg, classification: "rejected_low_confidence" as const };
    }
    const match = claimed.get(idx);
    if (!match) {
      return { ...seg, classification: "rejected_unmatched" as const };
    }
    return { ...seg, match, classification: "accepted" as const };
  });
}

/** Normalize matched text into Rule-6 canonical formats. */
export function normalizeValue(field: FieldKey, raw: string): string {
  switch (field) {
    case "mrp": {
      const num = raw.match(
        /\d+(?:[.,]\d{1,2})?/,
      )?.[0]?.replace(",", ".");
      if (!num) return raw.trim();
      const symbol = raw.includes("₹") ? "₹" : "Rs";
      return `${symbol} ${num}`;
    }
    case "net_quantity": {
      const m = raw.match(/(\d+(?:\.\d+)?)\s*(kg|Kg|g|G|gm|ml|mL|l|L|ltr|N)\b/);
      if (!m) return raw.trim();
      const unit = m[2].toLowerCase().replace("ltr", "l").replace("gm", "g");
      const unitCanon =
        unit === "kg" ? "kg" : unit === "g" ? "g" : unit === "ml" ? "ml" : unit === "l" ? "l" : "N";
      const qty = m[1];
      return `${qty} ${unit === "kg" ? "kg" : unitCanon}`;
    }
    case "mfd_date": {
      const m = raw.match(/(0?[1-9]|1[0-2])[/\-.](\d{2}|20\d{2})/);
      if (!m) return raw.trim();
      const mm = m[1].padStart(2, "0");
      const yy = m[2].length === 2 ? `20${m[2]}` : m[2];
      return `${mm}/${yy}`;
    }
    case "manufacturer": {
      const m = raw.match(
        /(?:by|M\/s\.?)\s*[:\-]?\s*([A-Z][A-Za-z&.,'\-\s]+(?:Pvt\.?|Ltd\.?|Industries|Products|Foods|Enterprises|Ltd))/,
      );
      if (m) return m[1].trim().replace(/\s+/g, " ");
      const alt = raw.match(
        /([A-Z][A-Za-z&.,'\-\s]+(?:Pvt\.?|Ltd\.?|Industries|Products|Foods|Enterprises))/,
      );
      return alt ? alt[1].trim().replace(/\s+/g, " ") : raw.trim();
    }
    case "consumer_care": {
      const phone = raw.match(/(?:\+91[\-\s]?)?[6-9]\d{9}|1800[\-\s]?\d{3}[\-\s]?\d{3,5}/);
      if (phone) return phone[0].trim();
      const email = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (email) return email[0].trim();
      const web = raw.match(/www\.[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (web) return web[0].trim();
      return raw.trim();
    }
    case "country_of_origin": {
      const m = raw.match(
        /(?:country of origin|made in|origin)\s*[:=\-]?\s*(\w+)/i,
      );
      if (m) {
        const c = m[1].toLowerCase();
        return c.charAt(0).toUpperCase() + c.slice(1);
      }
      return raw.trim();
    }
  }
}

/** Full OCR pass: segment + classify + engine metadata. */
export function runOcrPipeline(
  imageWidth: number,
  imageHeight: number,
  imageHash: string,
  layoutIndex?: number,
): {
  regions: ClassifiedRegion[];
  meta: OcrEngineMeta;
} {
  const start = Date.now();
  const segments = segmentRegions(imageWidth, imageHeight, imageHash, layoutIndex);
  const regions = classifyRegions(segments);
  // Simulated fallback chain: PaddleOCR primary, EasyOCR fallback when the
  // hash-parity dice says so — mirrors dual-engine deployments.
  const usedFallback = (hashSeed(imageHash) >> 3) % 5 === 0;
  return {
    regions,
    meta: {
      primary: usedFallback ? "easyocr" : "paddleocr",
      usedFallback,
      regionsCount: regions.length,
      durationMs: Math.max(1, Date.now() - start) + (hashSeed(imageHash) % 120),
    },
  };
}

/** Convenience: the accepted matches keyed by field (first wins). */
export function acceptedMatches(
  regions: ClassifiedRegion[],
): Partial<Record<FieldKey, MatchInfo & { confidence: number; regionId: number }>> {
  const out: Partial<
    Record<FieldKey, MatchInfo & { confidence: number; regionId: number }>
  > = {};
  for (const r of regions) {
    if (r.classification !== "accepted" || !r.match) continue;
    if (out[r.match.field]) continue;
    out[r.match.field] = { ...r.match, confidence: r.confidence, regionId: r.regionId };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Real OCR input (client-side Tesseract.js) — classification only.
// ---------------------------------------------------------------------------

/** Shape the browser sends for each detected line after real OCR. */
export interface ClientRegionInput {
  rawText: string;
  confidence: number;
  boundingBox: { x: number; y: number; w: number; h: number };
}

/**
 * Classify regions that were recognized by real OCR in the browser.
 * Same Rule-6 patterns and duplicate resolution as `classifyRegions`, but no
 * synthesis: the text is whatever was actually printed on the label.
 */
export function classifyClientRegions(
  inputs: ClientRegionInput[],
): ClassifiedRegion[] {
  const segments: SegmentRegion[] = inputs.map((r, i) => ({
    regionId: i,
    rawText: r.rawText,
    confidence: r.confidence,
    boundingBox: r.boundingBox,
  }));

  const minConf = rules.ocr.clientMinConfidence ?? MIN_CONF;
  const claimed = new Map<number, MatchInfo>();
  const seenFields = new Set<FieldKey>();

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    if (seg.confidence < minConf) continue;
    for (const field of FIELD_PRIORITY) {
      const patterns = PATTERNS[field] ?? [];
      for (let pi = 0; pi < patterns.length; pi++) {
        const m = seg.rawText.match(patternToRegex(patterns[pi]));
        if (m) {
          if (seenFields.has(field)) break; // first (highest-priority) line wins the field
          claimed.set(idx, {
            field,
            value: normalizeValue(field, m[0]),
            matchedPattern: patterns[pi],
            patternIndex: pi,
          });
          seenFields.add(field);
          break;
        }
      }
    }
  }

  return segments.map((seg, idx) => {
    if (seg.confidence < minConf) {
      return { ...seg, classification: "rejected_low_confidence" as const };
    }
    const match = claimed.get(idx);
    if (!match) {
      return { ...seg, classification: "rejected_unmatched" as const };
    }
    return { ...seg, match, classification: "accepted" as const };
  });
}

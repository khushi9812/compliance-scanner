// Real on-device OCR pipeline (browser side).
//
// Runs Tesseract.js in a web worker, extracts words with bounding boxes,
// groups them into line regions (the same `SegmentRegion` shape the backend
// classifier expects), and reports progress. The backend then classifies each
// line against Rule 6 patterns — nothing here is simulated: the rawText comes
// straight off the captured label image.

import { createWorker, type Worker } from "tesseract.js";

export interface OcrRegionOut {
  regionId: number;
  rawText: string;
  confidence: number;
  boundingBox: { x: number; y: number; w: number; h: number };
}

export interface OcrClientMeta {
  primary: string;
  usedFallback: boolean;
  regionsCount: number;
  durationMs: number;
}

export interface OcrRunResult {
  regions: OcrRegionOut[];
  fullText: string;
  meta: OcrClientMeta;
}

/** Mean word confidence across a group, 0..1. */
function meanConf(words: Array<{ confidence?: number }>): number {
  let sum = 0;
  let n = 0;
  for (const w of words) {
    if (typeof w.confidence === "number") {
      sum += w.confidence;
      n += 1;
    }
  }
  return n > 0 ? Math.round((sum / n / 100) * 100) / 100 : 0;
}

// ---------------------------------------------------------------------------
// Worker lifecycle — one shared worker for the whole app.
// ---------------------------------------------------------------------------

let workerPromise: Promise<Worker> | null = null;

function getWorker(
  onProgress?: (pct: number, stage: string) => void,
): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgress?.(Math.round(m.progress * 100), "Reading label text");
        } else if (m.status === "loading language traineddata") {
          onProgress?.(
            Math.round(m.progress * 100),
            "Loading OCR model (first run only)",
          );
        } else if (m.status === "initializing tesseract") {
          onProgress?.(Math.round(m.progress * 100), "Starting OCR engine");
        }
      },
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/**
 * Recognize text on a label image and return line-level regions.
 * `dataUrl` must be a data URL of the (normalized) capture.
 */
export async function runClientOcr(
  dataUrl: string,
  onProgress?: (pct: number, stage: string) => void,
): Promise<OcrRunResult> {
  const start = Date.now();
  const worker = await getWorker(onProgress);
  await worker.setParameters({
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  onProgress?.(0, "Reading label text");
  const { data } = await worker.recognize(dataUrl, {}, { blocks: true, text: true });
  onProgress?.(100, "Classifying declarations");

  // ---- Group words into line regions --------------------------------------
  const lines: OcrRegionOut[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const words = (line.words ?? []).filter((w) => (w.text ?? "").trim());
        if (words.length === 0) continue;

        const rawText = words
          .map((w) => w.text.trim())
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!rawText) continue;

        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const w of words) {
          x0 = Math.min(x0, w.bbox.x0);
          y0 = Math.min(y0, w.bbox.y0);
          x1 = Math.max(x1, w.bbox.x1);
          y1 = Math.max(y1, w.bbox.y1);
        }
        if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

        const w = Math.max(6, x1 - x0);
        const h = Math.max(6, y1 - y0);
        // Skip sub-6px specks — detector noise, not real print.
        if (h < 6 || w < 8) continue;

        lines.push({
          regionId: 0,
          rawText,
          confidence: meanConf(words),
          boundingBox: { x: Math.max(0, x0), y: Math.max(0, y0), w, h },
        });
      }
    }
  }

  // Deterministic reading order (top-to-bottom, left-to-right) and a sane cap.
  lines.sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
  const regions = lines.slice(0, 80).map((r, i) => ({ ...r, regionId: i }));

  return {
    regions,
    fullText: (data.text ?? "").trim(),
    meta: {
      primary: "tesseract.js",
      usedFallback: false,
      regionsCount: regions.length,
      durationMs: Date.now() - start,
    },
  };
}

/** Tear down the shared worker (used on page unload / tests). */
export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}

// Client-side capture pipeline: decode/normalize captures, compute the
// SHA-256 evidence hash (chain of custody), acquire geotags, and queue
// officer scans offline for later sync.

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

export interface PreparedCapture {
  dataUrl: string;
  width: number;
  height: number;
  imageHash: string;
  source: "upload" | "camera" | "url" | "offline_sync";
}

/** Decode an image source into a normalized data URL + dimensions. */
export async function prepareCapture(
  src: Blob | File | string,
  source: PreparedCapture["source"],
  maxDim = 1600,
): Promise<PreparedCapture> {
  const dataUrl = await toDataUrl(src);
  const resized = await resizeDataUrl(dataUrl, maxDim);
  const imageHash = await sha256Hex(resized.dataUrl);
  return { dataUrl: resized.dataUrl, width: resized.width, height: resized.height, imageHash, source };
}

function toDataUrl(src: Blob | File | string): Promise<string> {
  if (typeof src === "string") {
    if (src.startsWith("data:")) return Promise.resolve(src);
    // Remote URL: draw through an Image element (CORS-tolerant best effort).
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (e) {
          reject(new Error("Image could not be read (cross-origin)."));
        }
      };
      img.onerror = () => reject(new Error("Could not load image from URL."));
      img.src = src;
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(src);
  });
}

function resizeDataUrl(
  dataUrl: string,
  maxDim: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.9), width: w, height: h });
    };
    img.onerror = () => reject(new Error("Invalid image data."));
    img.src = dataUrl;
  });
}

/** SHA-256 hex digest of the capture — evidence chain-of-custody hash. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface Geotag {
  lat?: number;
  lng?: number;
  state?: string;
  district?: string;
}

/** Best-effort geotag with 4s timeout; never blocks the scan. */
export async function acquireGeotag(): Promise<Geotag> {
  if (!("geolocation" in navigator)) return {};
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 4000,
        maximumAge: 600000,
      });
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Offline queue (officer field mode)
// ---------------------------------------------------------------------------

const QUEUE_KEY = "metoscan.officer.queue.v1";

export interface QueuedScan {
  queuedAt: number;
  payload: {
    imageHash: string;
    imageWidth: number;
    imageHeight: number;
    portalRole: "officer";
    source: "upload" | "camera" | "url" | "offline_sync";
    geolocation?: Geotag;
    calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
    imageUrl?: string;
    productName?: string;
    brand?: string;
    packageSizeOverride?: { value: number; unit: string };
    // Pinned example layout, if the queued capture is a specimen.
    layoutIndex?: number;
    // Real OCR output captured while offline; classified on sync.
    ocrRegions?: Array<{
      rawText: string;
      confidence: number;
      boundingBox: { x: number; y: number; w: number; h: number };
    }>;
    ocrMeta?: { primary: string; usedFallback: boolean; regionsCount: number; durationMs: number };
  };
  localPreview: string;
}

export function loadQueue(): QueuedScan[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedScan[];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedScan[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // storage full — drop oldest half and retry once
    const trimmed = q.slice(Math.floor(q.length / 2));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  }
}

export function enqueueOfflineScan(scan: QueuedScan) {
  const q = loadQueue();
  q.push(scan);
  saveQueue(q);
}

export function queueCount(): number {
  return loadQueue().length;
}

/** Push every queued scan to the backend; returns remaining count. */
export async function syncOfflineQueue(
  processScan: (
    args: {
      imageHash: string;
      imageWidth: number;
      imageHeight: number;
      portalRole: "officer";
      source: "upload" | "camera" | "url" | "offline_sync";
      geolocation?: Geotag;
      calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
      imageUrl?: string;
      productName?: string;
      brand?: string;
      packageSizeOverride?: { value: number; unit: string };
      layoutIndex?: number;
      ocrRegions?: Array<{
        rawText: string;
        confidence: number;
        boundingBox: { x: number; y: number; w: number; h: number };
      }>;
      ocrMeta?: { primary: string; usedFallback: boolean; regionsCount: number; durationMs: number };
    },
  ) => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const queue = loadQueue();
  let synced = 0;
  let failed = 0;
  const remaining: QueuedScan[] = [];
  for (const item of queue) {
    try {
      await processScan(item.payload);
      synced += 1;
    } catch {
      failed += 1;
      remaining.push(item);
    }
  }
  saveQueue(remaining);
  return { synced, failed };
}

/** Human-friendly violation summary for the plain-language card. */
export const FIELD_LABELS: Record<string, string> = {
  mrp: "MRP",
  net_quantity: "Net Quantity",
  mfd_date: "Date of Manufacture / Packing",
  manufacturer: "Manufacturer Details",
  consumer_care: "Consumer Care Details",
  country_of_origin: "Country of Origin",
};

export function missingFieldSentence(missing: string[]): string {
  if (missing.length === 0) return "";
  const labels = missing.map((m) => FIELD_LABELS[m] ?? m);
  if (labels.length === 1) return `Missing declaration: ${labels[0]}`;
  return `Missing declarations: ${labels.join(", ")}`;
}

export type ScanDoc = Doc<"scans">;

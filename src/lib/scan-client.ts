// Client-side capture pipeline for the vision pipeline: decode/normalize
// captures, compute the SHA-256 evidence hash (chain of custody), acquire
// geotags, attempt an on-device barcode decode (zxing — deterministic second
// source for the barcode leg), and queue officer scans offline for later sync.
// There is no OCR here: the image is analyzed on the server by the vision model.

import { api } from "@/convex/_generated/api";

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
  return {
    dataUrl: resized.dataUrl,
    width: resized.width,
    height: resized.height,
    imageHash,
    source,
  };
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
        } catch {
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

/**
 * On-device barcode decode (zxing). A deterministic companion to the vision
 * model's own barcode reading — when it succeeds, its digits are passed to the
 * backend as a trusted override. Returns null when no barcode is decoded.
 */
export async function decodeBarcode(dataUrl: string): Promise<string | null> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/library");
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageUrl(dataUrl);
    const text = result.getText().replace(/\D/g, "");
    return /^\d{6,14}$/.test(text) ? text : null;
  } catch {
    return null;
  }
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
// Offline queue (officer field mode) — payloads mirror analyzeAndRecord args
// ---------------------------------------------------------------------------

const QUEUE_KEY = "metoscan.officer.queue.v2";

/** Exact argument shape of the vision action (image included for sync). */
export interface VisionActionArgs {
  imageDataUrl: string;
  imageHash: string;
  imageWidth: number;
  imageHeight: number;
  portalRole: "consumer" | "officer";
  source: "upload" | "camera" | "url" | "offline_sync";
  geolocation?: Geotag;
  calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
  imageUrl?: string;
  barcodeOverride?: string;
  specimenId?: string;
}

export interface QueuedScan {
  queuedAt: number;
  payload: VisionActionArgs;
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

/** Push every queued scan through the vision action; returns counts. */
export async function syncOfflineQueue(
  analyzeAndRecord: (args: VisionActionArgs) => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const queue = loadQueue();
  let synced = 0;
  let failed = 0;
  const remaining: QueuedScan[] = [];
  for (const item of queue) {
    try {
      await analyzeAndRecord(item.payload);
      synced += 1;
    } catch {
      failed += 1;
      remaining.push(item);
    }
  }
  saveQueue(remaining);
  return { synced, failed };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Human labels for analysis field keys (product-information card etc.). */
export const FIELD_LABELS: Record<string, string> = {
  brand: "Brand Name",
  productName: "Product Name",
  productVariant: "Variant",
  packageType: "Package Type",
  manufacturer: "Manufacturer",
  packer: "Packer",
  importer: "Importer",
  manufacturerAddress: "Address",
  netQuantity: "Net Quantity",
  mrp: "MRP",
  batchNumber: "Batch / Lot No.",
  manufactureDate: "Manufacturing / Packing Date",
  bestBefore: "Best Before / Use By",
  countryOfOrigin: "Country of Origin",
  consumerCare: "Consumer Care",
  fssaiLicense: "FSSAI Licence",
  licenseInfo: "Licence / Registration",
  ingredients: "Ingredients",
  barcode: "Barcode (GTIN)",
};

/** Human labels for requirement ids (notices, grievance text, chips). */
export const REQUIREMENT_LABELS: Record<string, string> = {
  product_identity: "Product identity",
  brand: "Brand",
  net_quantity: "Net quantity",
  manufacturer: "Manufacturer",
  rq_name_address: "Name & address of manufacturer / packer",
  rq_common_name: "Common / generic name of the commodity",
  rq_net_quantity: "Net quantity declaration",
  rq_mrp: "Retail sale price (MRP)",
  rq_month_year: "Month & year of manufacture / packing",
  rq_consumer_care: "Consumer-care details",
  rq_country_of_origin: "Country of origin",
  rq_best_before: "Best before / use by date",
  rq_fssai: "FSSAI licence number",
  rq_batch: "Batch / lot number",
  rq_quantity_font: "Net-quantity character height",
  rq_mrp_font: "MRP character height",
  rq_ingredients: "List of ingredients",
  rq_importer_declaration: "Importer name & address",
};

export function requirementLabel(id: string): string {
  return REQUIREMENT_LABELS[id] ?? id;
}

export type ScanDoc = {
  _id: string;
  scanId: string;
  timestamp: number;
  imageHash: string;
  imageWidth: number;
  imageHeight: number;
  evidenceStorageId?: string;
  imageUrl?: string;
  portalRole: "consumer" | "officer";
  source: string;
  geolocation?: Geotag;
  calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
  analysis: import("@/convex/productRules").VisionAnalysis;
  database: import("@/convex/productRules").DatabaseLookup;
  result: import("@/convex/ruleEngine").EngineResult;
  decision: "PASS" | "FAIL" | "REVIEW";
  brand?: string;
  productName?: string;
  category: string;
  createdAt: number;
};

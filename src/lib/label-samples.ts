// Example labels ("specimens") used across the app. Each one renders an
// honest, deterministic declaration panel and pins an exact OCR layout so the
// scan pipeline produces the described verdict every time.

export interface LabelSample {
  id: string;
  name: string;
  category: string;
  emoji: string;
  // Deterministic pseudo dimensions used by the simulator.
  width: number;
  height: number;
  // Index into the backend's example label layouts (runOcrPipeline).
  layoutIndex: number;
  // Honest one-line description of what this example demonstrates.
  verdictHint: string;
  // Physical calibration preset for the officer example flow.
  calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
  // Optional package size override (matches the printed net quantity).
  sizeOverride?: { value: number; unit: string };
}

export const LABEL_SAMPLES: LabelSample[] = [
  {
    id: "muesli",
    name: "Crunchy Muesli 500g",
    category: "Breakfast cereal",
    emoji: "🥣",
    width: 1200,
    height: 1600,
    layoutIndex: 0,
    verdictHint: "All six declarations present — passes Rule 6",
    calibration: { realHeightMm: 240, boundingBoxPixelHeight: 1200 },
    sizeOverride: { value: 500, unit: "g" },
  },
  {
    id: "shampoo",
    name: "Herbal Shampoo 340ml",
    category: "Personal care",
    emoji: "🧴",
    width: 1000,
    height: 1400,
    layoutIndex: 1,
    verdictHint: "Country of origin missing — Rule 6(1)(i) violation",
    calibration: { realHeightMm: 190, boundingBoxPixelHeight: 950 },
    sizeOverride: { value: 340, unit: "ml" },
  },
  {
    id: "chips",
    name: "Masala Chips 80g",
    category: "Snacks",
    emoji: "🍟",
    width: 1400,
    height: 900,
    layoutIndex: 2,
    verdictHint: "Consumer-care details missing — Rule 6(1)(f) violation",
    calibration: { realHeightMm: 260, boundingBoxPixelHeight: 1040 },
    sizeOverride: { value: 80, unit: "g" },
  },
  {
    id: "water",
    name: "Mineral Water 1L",
    category: "Beverages",
    emoji: "💧",
    width: 900,
    height: 1500,
    layoutIndex: 3,
    verdictHint: "“Rs.” price without ₹ symbol — Rule 6(1)(e) violation",
    calibration: { realHeightMm: 300, boundingBoxPixelHeight: 1500 },
    sizeOverride: { value: 1, unit: "l" },
  },
];

/** Look up a sample by id. */
export function sampleById(id: string): LabelSample | undefined {
  return LABEL_SAMPLES.find((s) => s.id === id);
}

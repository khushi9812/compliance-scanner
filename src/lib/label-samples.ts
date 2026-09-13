// Example labels ("specimens") used across the app. The printed content is
// defined once in src/lib/specimens.ts (PANELS); the canvas renderer in
// synthetic-label.ts draws exactly those panels, and the pinned analyses in
// specimens.ts quote exactly that printed text — so demo evidence is honest.

export interface LabelSample {
  id: string;
  name: string;
  category: string;
  emoji: string;
  // Rendered specimen dimensions (matches SPEC_LAYOUT).
  width: number;
  height: number;
  // Honest one-line description of what this example demonstrates.
  verdictHint: string;
  // Physical calibration preset for the officer example flow.
  calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
}

export const LABEL_SAMPLES: LabelSample[] = [
  {
    id: "muesli",
    name: "Crunchy Muesli 500g",
    category: "Packaged food",
    emoji: "🥣",
    width: 640,
    height: 880,
    verdictHint:
      "Fully-declared food panel — most Rule 6 requirements PASS with evidence",
    calibration: { realHeightMm: 240, boundingBoxPixelHeight: 800 },
  },
  {
    id: "shampoo",
    name: "Herbal Shampoo 340ml",
    category: "Personal care",
    emoji: "🧴",
    width: 640,
    height: 880,
    verdictHint:
      "“Rs” MRP without ₹, no batch number, no origin — clear Rule 6 FAILs",
    calibration: { realHeightMm: 190, boundingBoxPixelHeight: 800 },
  },
  {
    id: "chips",
    name: "Masala Chips 80g",
    category: "Snacks",
    emoji: "🍟",
    width: 640,
    height: 880,
    verdictHint:
      "Front panel only — FSSAI / ingredients / best-before land in REVIEW",
    calibration: { realHeightMm: 260, boundingBoxPixelHeight: 800 },
  },
  {
    id: "water",
    name: "Mineral Water 1L",
    category: "Beverage",
    emoji: "💧",
    width: 640,
    height: 880,
    verdictHint:
      "“Rs.20/-” in tiny print — MRP format FAIL + Fourth-Schedule REVIEW",
    calibration: { realHeightMm: 300, boundingBoxPixelHeight: 800 },
  },
];

/** Look up a sample by id. */
export function sampleById(id: string): LabelSample | undefined {
  return LABEL_SAMPLES.find((s) => s.id === id);
}

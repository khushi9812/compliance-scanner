// Calibration engine — physical character-height validation for the Legal
// Metrology (Packaged Commodities) Rules, 2011.
//
// Two verifiable tables back the checks:
//
// 1. FOURTH SCHEDULE — height of numerals for the NET QUANTITY declaration,
//    banded by declared net quantity.
// 2. TABLE I (Department of Consumer Affairs FAQ) — minimum type height of
//    numerals and letters by PRINCIPAL DISPLAY PANEL area, with higher
//    minima when blown, formed or moulded on the container:
//      A < 50 cm²        → 1.0 mm (2.0 mm blown/formed/moulded)
//      50–100 cm²        → 1.5 mm (3.0)
//      100–500 cm²       → 2.5 mm (4.0)
//      500–2500 cm²      → 4.0 mm (6.0)
//      > 2500 cm²        → 6.0 mm (6.0)
//
// All values are configured knowledge — nothing is computed at runtime beyond
// mm-per-pixel from the officer's physical calibration.

export interface Slab {
  maxQty: number | null;
  unit: string;
  minCharHeightMm: number;
}

export interface CalibrationInput {
  realHeightMm: number;
  boundingBoxPixelHeight: number;
  /** Principal display panel area in cm², when the officer provides it (Table I). */
  pdpAreaCm2?: number;
  /** True when the declarations are blown/formed/moulded on the container. */
  blownFormedMoulded?: boolean;
}

/**
 * Fourth Schedule numeral-height slabs for the net-quantity declaration,
 * banded by declared net quantity.
 */
export const FOURTH_SCHEDULE_SLABS: Slab[] = [
  { maxQty: 60, unit: "g|ml", minCharHeightMm: 1.0 },
  { maxQty: 200, unit: "g|ml", minCharHeightMm: 2.0 },
  { maxQty: 500, unit: "g|ml", minCharHeightMm: 3.0 },
  { maxQty: 1000, unit: "g|ml|kg|l", minCharHeightMm: 4.0 },
  { maxQty: null, unit: "g|kg|ml|l", minCharHeightMm: 6.0 },
];

export interface TableIBand {
  /** Upper bound of PDP area (cm²); null = open-ended. */
  maxAreaCm2: number | null;
  minTypeHeightMm: number;
  minTypeHeightMoldedMm: number;
}

/** Table I — minimum type height by principal display panel area (DCA FAQ). */
export const TABLE_I: TableIBand[] = [
  { maxAreaCm2: 50, minTypeHeightMm: 1.0, minTypeHeightMoldedMm: 2.0 },
  { maxAreaCm2: 100, minTypeHeightMm: 1.5, minTypeHeightMoldedMm: 3.0 },
  { maxAreaCm2: 500, minTypeHeightMm: 2.5, minTypeHeightMoldedMm: 4.0 },
  { maxAreaCm2: 2500, minTypeHeightMm: 4.0, minTypeHeightMoldedMm: 6.0 },
  { maxAreaCm2: null, minTypeHeightMm: 6.0, minTypeHeightMoldedMm: 6.0 },
];

/** mm per pixel = real height (mm) / package bounding-box pixel height. */
export function mmPerPixel(input: CalibrationInput): number {
  if (input.boundingBoxPixelHeight <= 0) return 0;
  return input.realHeightMm / input.boundingBoxPixelHeight;
}

/** Resolve the Fourth Schedule slab from a declared net quantity. */
export function resolveSlab(
  packageSizeValue: number | undefined,
  packageSizeUnit: string | undefined,
): Slab {
  if (packageSizeValue && packageSizeUnit) {
    const qty = packageSizeValue;
    const unit = packageSizeUnit.toLowerCase();
    for (const slab of FOURTH_SCHEDULE_SLABS) {
      if (slab.maxQty === null) return slab;
      const unitMatch = slab.unit
        .split("|")
        .map((u) => u.toLowerCase())
        .includes(unit);
      if (unitMatch && qty <= slab.maxQty) return slab;
    }
  }
  return FOURTH_SCHEDULE_SLABS[0];
}

/**
 * Resolve the Table I band from a principal display panel area (cm²).
 * Returns null when no area was provided — measurement then stays REVIEW.
 */
export function resolveTableI(
  pdpAreaCm2?: number,
  blownFormedMoulded?: boolean,
): { band: TableIBand; requiredMm: number; label: string } | null {
  if (!pdpAreaCm2 || pdpAreaCm2 <= 0) return null;
  for (const band of TABLE_I) {
    if (band.maxAreaCm2 === null || pdpAreaCm2 <= band.maxAreaCm2) {
      const requiredMm = blownFormedMoulded
        ? band.minTypeHeightMoldedMm
        : band.minTypeHeightMm;
      return {
        band,
        requiredMm,
        label: `${band.maxAreaCm2 === null ? "> 2500" : `≤ ${band.maxAreaCm2}`} cm² PDP${
          blownFormedMoulded ? " (blown/formed/moulded)" : ""
        }`,
      };
    }
  }
  return null;
}

/** Slab preview for UI: Fourth Schedule slabs with labels. */
export function slabsForUi(): Array<Slab & { label: string }> {
  return FOURTH_SCHEDULE_SLABS.map((s) => ({
    ...s,
    label:
      s.maxQty === null
        ? "> 1 kg / 1 L"
        : `≤ ${s.maxQty} ${s.unit.split("|")[0]}`,
  }));
}

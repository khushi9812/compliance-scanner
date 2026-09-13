// Calibration engine — physical font-height validation against the Fourth
// Schedule slabs of the Legal Metrology (PC) Rules, 2011. Given the real
// package height in millimetres and the package's pixel height in the capture,
// compute mm/pixel, then measure declared-field character heights in
// millimetres and compare them with the slab minimum for the package size.

export interface Slab {
  maxQty: number | null;
  unit: string;
  minCharHeightMm: number;
}

export interface CalibrationInput {
  realHeightMm: number;
  boundingBoxPixelHeight: number;
}

/**
 * Fourth Schedule numeral-height slabs by declared net quantity
 * (Rule 6(1)(a) read with the Fourth Schedule). Slab values are configured
 * knowledge — they are NOT invented at runtime.
 */
export const FOURTH_SCHEDULE_SLABS: Slab[] = [
  { maxQty: 60, unit: "g|ml", minCharHeightMm: 1.0 },
  { maxQty: 200, unit: "g|ml", minCharHeightMm: 2.0 },
  { maxQty: 500, unit: "g|ml", minCharHeightMm: 3.0 },
  { maxQty: 1000, unit: "g|ml|kg|l", minCharHeightMm: 4.0 },
  { maxQty: 5000, unit: "g|kg|ml|l", minCharHeightMm: 6.0 },
  { maxQty: null, unit: "g|kg|ml|l", minCharHeightMm: 8.0 },
];

/** mm per pixel = real height (mm) / package bounding-box pixel height. */
export function mmPerPixel(input: CalibrationInput): number {
  if (input.boundingBoxPixelHeight <= 0) return 0;
  return input.realHeightMm / input.boundingBoxPixelHeight;
}

/**
 * Resolve the Fourth Schedule slab for a package.
 * `packageSizeValue`/`packageSizeUnit` come from the Net-Quantity declaration.
 * Falls back to the smallest slab when the declaration is unreadable.
 */
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

/** Slab preview for UI: all slabs with the active one highlighted. */
export function slabsForUi(): Array<Slab & { label: string }> {
  return FOURTH_SCHEDULE_SLABS.map((s) => ({
    ...s,
    label:
      s.maxQty === null
        ? `> 5 kg / 5 L`
        : `≤ ${s.maxQty} ${s.unit.split("|")[0]}`,
  }));
}

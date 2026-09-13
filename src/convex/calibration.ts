// Calibration engine — physical font-height validation against the Fourth
// Schedule slabs. Mirrors calibration.py: given the real package height in mm
// and the package's pixel height in the capture, compute mm/pixel, then
// measure declared-field character heights in millimetres.

import rules from "./rules_2011.json";

export interface Slab {
  maxQty: number | null;
  unit: string;
  minCharHeightMm: number;
}

export type FontSizeViolation = {
  field: string;
  actualMm: number;
  requiredMm: number;
  citation: string;
};

export interface CalibrationInput {
  realHeightMm: number;
  boundingBoxPixelHeight: number;
}

export interface CalibrationResult {
  mmPerPixel: number;
  measurements: Array<{
    field: FontSizeViolation["field"];
    pixelHeight: number;
    actualMm: number;
    requiredMm: number | null;
    status: "pass" | "fail" | "no-slab";
  }>;
  violations: FontSizeViolation[];
}

const CAL = rules.calibration;

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
  const slabs = CAL.slabs as Slab[];
  if (packageSizeValue && packageSizeUnit) {
    const normalized =
      packageSizeUnit === "kg" || packageSizeUnit === "l"
        ? { unit: packageSizeUnit, value: packageSizeValue }
        : { unit: packageSizeUnit, value: packageSizeValue };
    const qty = normalized.value;
    for (const slab of slabs) {
      if (slab.maxQty === null) return slab;
      const unitMatch = slab.unit
        .split("|")
        .map((u) => u.toLowerCase())
        .includes(normalized.unit.toLowerCase());
      if (unitMatch && qty <= slab.maxQty) return slab;
    }
  }
  return slabs[0];
}

/** Slab preview for UI: all slabs with the active one highlighted. */
export function slabsForUi(): Array<Slab & { label: string }> {
  return (CAL.slabs as Slab[]).map((s) => ({
    ...s,
    label:
      s.maxQty === null
        ? `> 5 kg / 5 L`
        : `≤ ${s.maxQty} ${s.unit.split("|")[0]}`,
  }));
}

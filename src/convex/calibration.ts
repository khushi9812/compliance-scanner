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

export interface CalibrationInput {
  realHeightMm: number;
  boundingBoxPixelHeight: number;
}

export interface FontSizeViolation {
  field:
    | "mrp"
    | "net_quantity"
    | "mfd_date"
    | "manufacturer"
    | "consumer_care"
    | "country_of_origin";
  actualMm: number;
  requiredMm: number;
  citation: string;
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

/** Measure one region's character height in mm against its slab. */
export function measureRegion(
  field: FontSizeViolation["field"],
  pixelHeight: number,
  ratio: number,
  slab: Slab,
): {
  actualMm: number;
  requiredMm: number | null;
  status: "pass" | "fail" | "no-slab";
} {
  const actualMm = Math.round(pixelHeight * ratio * 100) / 100;
  const requiredMm = slab.minCharHeightMm;
  if (pixelHeight < CAL.minDetectedPixelHeight) {
    return { actualMm, requiredMm: null, status: "no-slab" };
  }
  return {
    actualMm,
    requiredMm,
    status: actualMm >= requiredMm ? "pass" : "fail",
  };
}

/** Full calibration pass over the accepted declaration regions. */
export function runCalibration(
  input: CalibrationInput,
  declaredRegions: Array<{
    field: FontSizeViolation["field"];
    pixelHeight: number;
  }>,
  packageSizeValue?: number,
  packageSizeUnit?: string,
): CalibrationResult {
  const ratio = mmPerPixel(input);
  const slab = resolveSlab(packageSizeValue, packageSizeUnit);
  const measurements = declaredRegions.map((d) => {
    const m = measureRegion(d.field, d.pixelHeight, ratio, slab);
    return {
      field: d.field,
      pixelHeight: d.pixelHeight,
      actualMm: m.actualMm,
      requiredMm: m.requiredMm,
      status: m.status,
    };
  });
  const violations: FontSizeViolation[] = measurements
    .filter((m) => m.status === "fail")
    .map((m) => ({
      field: m.field,
      actualMm: m.actualMm,
      requiredMm: m.requiredMm ?? 0,
      citation: rules.citations.fontHeight,
    }));
  return { mmPerPixel: Math.round(ratio * 10000) / 10000, measurements, violations };
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

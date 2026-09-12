// Rule Engine — validates extraction results against Rule 6 and the Fourth
// Schedule using the versioned rules config. Produces the Phase-1
// `ValidationResult` contract.

import rules from "./rules_2011.json";
import {
  type FontSizeViolation,
  type CalibrationInput,
  runCalibration,
} from "./calibration";

type FieldKey =
  | "mrp"
  | "net_quantity"
  | "mfd_date"
  | "manufacturer"
  | "consumer_care"
  | "country_of_origin";

export interface FormattingViolation {
  field: FieldKey | null;
  ruleCited: string;
  details: string;
}

export interface ExtractionSummary {
  fields: Partial<
    Record<
      FieldKey,
      {
        value: string;
        confidence: number;
        regionId: number;
        boundingBox: { x: number; y: number; w: number; h: number };
      }
    >
  >;
  rawRegions: number;
}

export interface ValidationResult {
  isCompliant: boolean;
  complianceScore: number;
  missingFields: FieldKey[];
  formattingViolations: FormattingViolation[];
  fontSizeViolations: FontSizeViolation[];
  appliedRuleVersion: string;
  mmPerPixel?: number;
}

const VAL = rules.validation;

/** Validate extraction + calibration and compute the verdict + score. */
export function validate(
  extraction: ExtractionSummary,
  calibration?: CalibrationInput,
  declaredRegions: Array<{ field: FieldKey; pixelHeight: number }> = [],
  packageSizeValue?: number,
  packageSizeUnit?: string,
): ValidationResult {
  const missingFields: FieldKey[] = [];
  const formattingViolations: FormattingViolation[] = [];

  for (const field of VAL.mandatoryFields as FieldKey[]) {
    if (!extraction.fields[field]) missingFields.push(field);
  }

  // Rule 6(1)(e) — MRP must carry the ₹ symbol.
  const mrp = extraction.fields.mrp;
  if (mrp && !mrp.value.includes("₹")) {
    formattingViolations.push({
      field: "mrp",
      ruleCited: rules.citations.mrpDeclaration,
      details: `Invalid MRP symbol: "${mrp.value}" — ₹ is mandatory.`,
    });
  }

  // Rule 6(1)(d) — date must be MM/YYYY or MM/YY.
  const mfd = extraction.fields.mfd_date;
  if (mfd && !/^(0[1-9]|1[0-2])\/(20\d{2}|\d{2})$/.test(mfd.value)) {
    formattingViolations.push({
      field: "mfd_date",
      ruleCited: rules.citations.dateOfManufacture,
      details: `Invalid date format "${mfd.value}" — must be MM/YYYY or MM/YY.`,
    });
  }

  // Rule 6(1)(a) — SI units for net quantity.
  const nq = extraction.fields.net_quantity;
  const unit = nq ? (nq.value.split(" ").pop() ?? "") : "";
  if (nq && !VAL.allowedSiUnits.includes(unit)) {
    formattingViolations.push({
      field: "net_quantity",
      ruleCited: rules.citations.netQuantity,
      details: `Non-standard unit in "${nq.value}" — must be g, kg, ml, l or N.`,
    });
  }

  // Fourth Schedule font heights.
  let fontSizeViolations: FontSizeViolation[] = [];
  let mmPerPixel: number | undefined;
  if (calibration && declaredRegions.length > 0) {
    const cal = runCalibration(
      calibration,
      declaredRegions,
      packageSizeValue,
      packageSizeUnit,
    );
    fontSizeViolations = cal.violations;
    mmPerPixel = cal.mmPerPixel;
  }

  const missingPenalty = missingFields.length * VAL.penalties.missingField;
  const formattingPenalty =
    formattingViolations.length * VAL.penalties.formattingViolation;
  const fontPenalty =
    fontSizeViolations.length * VAL.penalties.fontSizeViolation;
  const score = Math.max(
    0,
    VAL.maxScore - missingPenalty - formattingPenalty - fontPenalty,
  );

  return {
    isCompliant: score >= 80 && missingFields.length === 0,
    complianceScore: score,
    missingFields,
    formattingViolations,
    fontSizeViolations,
    appliedRuleVersion: rules.version,
    mmPerPixel,
  };
}

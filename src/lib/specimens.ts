// Specimen example cases — deterministic VisionAnalysis payloads that mirror
// the printed specimen labels exactly (see src/lib/synthetic-label.ts which
// draws PANELS). These run through the REAL rule engine (evaluate in
// convex/ruleEngine.ts) so repository, analytics and notices behave identically
// to live scans. Honest by construction: every value in each analysis is
// exactly what is printed on the corresponding specimen label.

import type { VisionAnalysis, DatabaseLookup } from "../convex/productRules";

export interface PanelLine {
  text: string;
  /** Deliberately small print (demonstrates Fourth-Schedule checks). */
  small?: boolean;
}

export interface SpecimenPanel {
  /** Title line (drawn uppercased). */
  title: string;
  /** Net-quantity caption under the title. */
  caption: string;
  /** Declaration lines. */
  lines: PanelLine[];
  /** Barcode digits printed under the drawn bar block. */
  barcode: string;
}

export interface ExampleCase {
  id: string;
  imageWidth: number;
  imageHeight: number;
  portalRole: "consumer" | "officer";
  source: "upload" | "camera" | "url" | "offline_sync";
  state: string;
  district: string;
  calibration?: { realHeightMm: number; boundingBoxPixelHeight: number };
  analysis: VisionAnalysis;
  database: DatabaseLookup;
}

/** Specimen panels (single source of truth for the canvas renderer). */
export const PANELS: Record<string, SpecimenPanel> = {
  muesli: {
    title: "Crunchy Muesli 500g",
    caption: "NET 500 g",
    lines: [
      { text: "M.R.P. ₹185/- (Inclusive of all taxes)" },
      { text: "Net Wt. 500 g" },
      { text: "MFD 03/2026" },
      { text: "Manufactured by Sunrise Foods Pvt. Ltd." },
      { text: "FSSAI Lic. No. 13321999000263" },
      { text: "Best Before 09/2026" },
      { text: "Batch No. MUS-0326-A" },
      { text: "Consumer Care: 1800-123-4567" },
      { text: "Country of Origin: India" },
      { text: "Ingredients: Oats (62%), Honey, Almonds, Raisins" },
    ],
    barcode: "8901058000016",
  },
  shampoo: {
    title: "HERBAL SHAMPOO",
    caption: "NET 340 ml",
    lines: [
      { text: "M.R.P. Rs 245.00" },
      { text: "Net Qty. 340 ml" },
      { text: "Pkd 11/25" },
      { text: "M/s Greenleaf Industries" },
      { text: "Consumer Care: care@example.com" },
    ],
    barcode: "8901030810042",
  },
  chips: {
    title: "Masala Chips",
    caption: "NET 80 g",
    lines: [
      { text: "MRP ₹35/-" },
      { text: "NET WT 80 g" },
      { text: "Manufactured by: Deccan Snacks Pvt Ltd" },
      { text: "MFD 08/2025" },
      { text: "Made in India" },
    ],
    barcode: "8901063010140",
  },
  water: {
    title: "MINERAL WATER",
    caption: "1 L",
    lines: [
      { text: "Rs.20/-", small: true },
      { text: "Pack 04/2026" },
      { text: "Marketed by AquaPure Beverages Ltd." },
      { text: "Consumer Care: +91 9876543210" },
    ],
    barcode: "8901058000113",
  },
};

/** Rough printed-text bounding boxes matching the canvas layout. */
export function lineBox(index: number, textLen: number, small = false) {
  const y = 244 + index * 56;
  return {
    x: 40,
    y,
    w: Math.min(560, Math.max(90, textLen * (small ? 8 : 13))),
    h: small ? 18 : 30,
  };
}

const muesliAnalysis: VisionAnalysis = {
  brand: "Sunrise Foods",
  productName: "Crunchy Muesli",
  productVariant: "500 g pack",
  category: "packaged_food",
  categoryConfidence: 0.97,
  packageType: "Carton box",
  manufacturer: "Sunrise Foods Pvt. Ltd.",
  manufacturerAddress: "Plot 12, Food Park, Bengaluru, Karnataka",
  netQuantity: "500 g",
  mrp: "₹185",
  batchNumber: "MUS-0326-A",
  manufactureDate: "03/2026",
  bestBefore: "09/2026",
  countryOfOrigin: "India",
  consumerCare: "1800-123-4567",
  fssaiLicense: "13321999000263",
  ingredients: "Oats (62%), Honey, Almonds, Raisins",
  barcode: {
    value: "8901058000016",
    symbology: "EAN-13",
    checksumValid: true,
    prefixRegion: "India",
  },
  fields: [
    { key: "brand", label: "Brand", value: "Sunrise Foods", evidence: "Sunrise Foods", confidence: 0.97, state: "present", boundingBox: { x: 40, y: 76, w: 260, h: 40 } },
    { key: "productName", label: "Product name", value: "Crunchy Muesli", evidence: "CRUNCHY MUESLI 500G", confidence: 0.97, state: "present", boundingBox: { x: 40, y: 76, w: 420, h: 40 } },
    { key: "mrp", label: "MRP", value: "₹185", evidence: "M.R.P. ₹185/- (Inclusive of all taxes)", confidence: 0.98, state: "present", boundingBox: lineBox(0, 38) },
    { key: "netQuantity", label: "Net quantity", value: "500 g", evidence: "Net Wt. 500 g", confidence: 0.97, state: "present", boundingBox: lineBox(1, 13) },
    { key: "manufactureDate", label: "Month & year of manufacture", value: "03/2026", evidence: "MFD 03/2026", confidence: 0.95, state: "present", boundingBox: lineBox(2, 11) },
    { key: "manufacturer", label: "Manufacturer", value: "Sunrise Foods Pvt. Ltd.", evidence: "Manufactured by Sunrise Foods Pvt. Ltd.", confidence: 0.96, state: "present", boundingBox: lineBox(3, 39) },
    { key: "fssaiLicense", label: "FSSAI licence", value: "13321999000263", evidence: "FSSAI Lic. No. 13321999000263", confidence: 0.96, state: "present", boundingBox: lineBox(4, 29) },
    { key: "bestBefore", label: "Best before", value: "09/2026", evidence: "Best Before 09/2026", confidence: 0.95, state: "present", boundingBox: lineBox(5, 19) },
    { key: "batchNumber", label: "Batch number", value: "MUS-0326-A", evidence: "Batch No. MUS-0326-A", confidence: 0.94, state: "present", boundingBox: lineBox(6, 20) },
    { key: "consumerCare", label: "Consumer care", value: "1800-123-4567", evidence: "Consumer Care: 1800-123-4567", confidence: 0.96, state: "present", boundingBox: lineBox(7, 28) },
    { key: "countryOfOrigin", label: "Country of origin", value: "India", evidence: "Country of Origin: India", confidence: 0.95, state: "present", boundingBox: lineBox(8, 24) },
    { key: "ingredients", label: "Ingredients", value: "Oats (62%), Honey, Almonds, Raisins", evidence: "Ingredients: Oats (62%), Honey, Almonds, Raisins", confidence: 0.9, state: "present", boundingBox: lineBox(9, 48) },
    { key: "barcode", label: "Barcode", value: "8901058000016", evidence: "EAN-13 8901058000016", confidence: 0.98, state: "present", boundingBox: { x: 40, y: 760, w: 260, h: 86 } },
  ],
  otherDeclarations: ["Green vegetarian mark visible"],
  warnings: [],
  imageQualityConfidence: 0.95,
  engine: "specimen",
  notes: "Pinned specimen analysis — values mirror the printed panel exactly.",
};

const shampooAnalysis: VisionAnalysis = {
  brand: "Greenleaf",
  productName: "Herbal Shampoo",
  productVariant: null,
  category: "personal_care",
  categoryConfidence: 0.93,
  packageType: "Bottle",
  manufacturer: "Greenleaf Industries",
  manufacturerAddress: null,
  netQuantity: "340 ml",
  mrp: "Rs 245.00",
  batchNumber: null,
  manufactureDate: "11/25",
  bestBefore: null,
  countryOfOrigin: null,
  consumerCare: "care@example.com",
  fssaiLicense: null,
  ingredients: null,
  barcode: {
    value: "8901030810042",
    symbology: "EAN-13",
    checksumValid: true,
    prefixRegion: "India",
  },
  fields: [
    { key: "brand", label: "Brand", value: "Greenleaf", evidence: "M/s Greenleaf Industries", confidence: 0.9, state: "present", boundingBox: lineBox(3, 24) },
    { key: "productName", label: "Product name", value: "Herbal Shampoo", evidence: "HERBAL SHAMPOO", confidence: 0.96, state: "present", boundingBox: { x: 40, y: 76, w: 330, h: 40 } },
    { key: "mrp", label: "MRP", value: "Rs 245.00", evidence: "M.R.P. Rs 245.00", confidence: 0.95, state: "present", boundingBox: lineBox(0, 16) },
    { key: "netQuantity", label: "Net quantity", value: "340 ml", evidence: "Net Qty. 340 ml", confidence: 0.96, state: "present", boundingBox: lineBox(1, 15) },
    { key: "manufactureDate", label: "Month & year of packing", value: "11/25", evidence: "Pkd 11/25", confidence: 0.9, state: "present", boundingBox: lineBox(2, 9) },
    { key: "manufacturer", label: "Manufacturer", value: "Greenleaf Industries", evidence: "M/s Greenleaf Industries", confidence: 0.92, state: "present", boundingBox: lineBox(3, 24) },
    { key: "consumerCare", label: "Consumer care", value: "care@example.com", evidence: "Consumer Care: care@example.com", confidence: 0.93, state: "present", boundingBox: lineBox(4, 32) },
    { key: "barcode", label: "Barcode", value: "8901030810042", evidence: "EAN-13 8901030810042", confidence: 0.97, state: "present", boundingBox: { x: 40, y: 560, w: 260, h: 86 } },
  ],
  otherDeclarations: [],
  warnings: [],
  imageQualityConfidence: 0.92,
  engine: "specimen",
  notes: "Pinned specimen analysis.",
};

const chipsAnalysis: VisionAnalysis = {
  brand: "Deccan Snacks",
  productName: "Masala Chips",
  productVariant: null,
  category: "packaged_food",
  categoryConfidence: 0.94,
  packageType: "Pouch",
  manufacturer: "Deccan Snacks Pvt Ltd",
  manufacturerAddress: null,
  netQuantity: "80 g",
  mrp: "₹35",
  batchNumber: null,
  manufactureDate: "08/2025",
  bestBefore: null,
  countryOfOrigin: "India",
  consumerCare: null,
  fssaiLicense: null,
  ingredients: null,
  barcode: {
    value: "8901063010140",
    symbology: "EAN-13",
    checksumValid: true,
    prefixRegion: "India",
  },
  fields: [
    { key: "brand", label: "Brand", value: "Deccan Snacks", evidence: "Manufactured by: Deccan Snacks Pvt Ltd", confidence: 0.88, state: "present", boundingBox: lineBox(2, 39) },
    { key: "productName", label: "Product name", value: "Masala Chips", evidence: "MASALA CHIPS", confidence: 0.96, state: "present", boundingBox: { x: 40, y: 76, w: 260, h: 40 } },
    { key: "mrp", label: "MRP", value: "₹35", evidence: "MRP ₹35/-", confidence: 0.96, state: "present", boundingBox: lineBox(0, 8) },
    { key: "netQuantity", label: "Net quantity", value: "80 g", evidence: "NET WT 80 g", confidence: 0.97, state: "present", boundingBox: lineBox(1, 11) },
    { key: "manufactureDate", label: "Month & year of manufacture", value: "08/2025", evidence: "MFD 08/2025", confidence: 0.94, state: "present", boundingBox: lineBox(3, 11) },
    { key: "manufacturer", label: "Manufacturer", value: "Deccan Snacks Pvt Ltd", evidence: "Manufactured by: Deccan Snacks Pvt Ltd", confidence: 0.95, state: "present", boundingBox: lineBox(2, 39) },
    { key: "countryOfOrigin", label: "Country of origin", value: "India", evidence: "Made in India", confidence: 0.9, state: "present", boundingBox: lineBox(4, 13) },
    { key: "barcode", label: "Barcode", value: "8901063010140", evidence: "EAN-13 8901063010140", confidence: 0.97, state: "present", boundingBox: { x: 40, y: 560, w: 260, h: 86 } },
  ],
  otherDeclarations: [],
  warnings: ["Back-panel declarations (FSSAI, ingredients, best-before, batch) are not in frame."],
  imageQualityConfidence: 0.9,
  engine: "specimen",
  notes: "Front-panel-only capture — an honest REVIEW demonstration.",
};

const waterAnalysis: VisionAnalysis = {
  brand: "AquaPure",
  productName: "Mineral Water",
  productVariant: "1 L bottle",
  category: "beverage",
  categoryConfidence: 0.96,
  packageType: "PET bottle",
  manufacturer: null,
  packer: null,
  importer: null,
  manufacturerAddress: null,
  netQuantity: "1 L",
  mrp: "Rs.20",
  batchNumber: null,
  manufactureDate: "04/2026",
  bestBefore: null,
  countryOfOrigin: null,
  consumerCare: "+91 9876543210",
  fssaiLicense: null,
  ingredients: null,
  barcode: {
    value: "8901058000113",
    symbology: "EAN-13",
    checksumValid: true,
    prefixRegion: "India",
  },
  fields: [
    { key: "productName", label: "Product name", value: "Mineral Water", evidence: "MINERAL WATER", confidence: 0.97, state: "present", boundingBox: { x: 40, y: 76, w: 300, h: 40 } },
    { key: "mrp", label: "MRP", value: "Rs.20", evidence: "Rs.20/-", confidence: 0.93, state: "present", boundingBox: lineBox(0, 7, true) },
    { key: "netQuantity", label: "Net quantity", value: "1 L", evidence: "1 L", confidence: 0.96, state: "present", boundingBox: { x: 196, y: 136, w: 44, h: 26 } },
    { key: "manufactureDate", label: "Month & year of packing", value: "04/2026", evidence: "Pack 04/2026", confidence: 0.9, state: "present", boundingBox: lineBox(1, 12) },
    { key: "manufacturer", label: "Marketer / packer", value: "AquaPure Beverages Ltd.", evidence: "Marketed by AquaPure Beverages Ltd.", confidence: 0.9, state: "present", boundingBox: lineBox(2, 37) },
    { key: "consumerCare", label: "Consumer care", value: "+91 9876543210", evidence: "Consumer Care: +91 9876543210", confidence: 0.94, state: "present", boundingBox: lineBox(3, 31) },
    { key: "barcode", label: "Barcode", value: "8901058000113", evidence: "EAN-13 8901058000113", confidence: 0.97, state: "present", boundingBox: { x: 40, y: 520, w: 260, h: 86 } },
  ],
  otherDeclarations: [],
  warnings: [],
  imageQualityConfidence: 0.93,
  engine: "specimen",
  notes: "Pinned specimen analysis.",
};

const muesliDb: DatabaseLookup = {
  product: {
    source: "UPCitemdb",
    found: true,
    title: "Sunrise Crunchy Muesli 500g",
    brand: "Sunrise Foods",
    category: "Food",
    netWeight: "500 g",
  },
};

const shampooDb: DatabaseLookup = {
  product: {
    source: "UPCitemdb",
    found: true,
    title: "Greenleaf Herbal Shampoo 340ml",
    brand: "Herbal Essence Ltd.",
    category: "Personal Care",
    netWeight: "340 ml",
  },
};

const chipsDb: DatabaseLookup = {
  product: {
    source: "UPCitemdb",
    found: true,
    title: "Deccan Masala Chips 80g",
    brand: "Deccan Snacks",
    category: "Food",
    netWeight: "80 g",
  },
};

const waterDb: DatabaseLookup = {
  product: { source: "UPCitemdb", found: false },
};

/** The six seeded example cases (mixed portals, states and verdicts). */
export const EXAMPLE_CASES: Array<
  ExampleCase & { seedState?: string; seedDistrict?: string }
> = [
  { id: "muesli", imageWidth: 640, imageHeight: 880, portalRole: "consumer", source: "upload", state: "Karnataka", district: "Bengaluru Urban", calibration: { realHeightMm: 240, boundingBoxPixelHeight: 800 }, analysis: muesliAnalysis, database: muesliDb },
  { id: "shampoo", imageWidth: 640, imageHeight: 880, portalRole: "officer", source: "camera", state: "Maharashtra", district: "Pune", calibration: { realHeightMm: 190, boundingBoxPixelHeight: 800 }, analysis: shampooAnalysis, database: shampooDb },
  { id: "chips", imageWidth: 640, imageHeight: 880, portalRole: "consumer", source: "upload", state: "Telangana", district: "Hyderabad", calibration: undefined, analysis: chipsAnalysis, database: chipsDb },
  { id: "water", imageWidth: 640, imageHeight: 880, portalRole: "officer", source: "offline_sync", state: "Tamil Nadu", district: "Chennai", calibration: { realHeightMm: 300, boundingBoxPixelHeight: 800 }, analysis: waterAnalysis, database: waterDb },
  { id: "shampoo", imageWidth: 640, imageHeight: 880, portalRole: "officer", source: "camera", state: "Karnataka", district: "Mysuru", calibration: { realHeightMm: 190, boundingBoxPixelHeight: 800 }, analysis: shampooAnalysis, database: shampooDb },
  { id: "water", imageWidth: 640, imageHeight: 880, portalRole: "officer", source: "offline_sync", state: "Tamil Nadu", district: "Coimbatore", calibration: { realHeightMm: 300, boundingBoxPixelHeight: 800 }, analysis: waterAnalysis, database: waterDb },
];

// ============================================================================
// VERSIONED LEGAL METROLOGY (PACKAGED COMMODITIES) RULES KNOWLEDGE BASE
// ============================================================================
// Source of truth: Department of Consumer Affairs (Ministry of Consumer
// Affairs, Food and Public Distribution) publications — the Principal Rules,
// 2011 (G.S.R. 640(E), dated 07.03.2011) and the amending notifications as
// published on consumeraffairs.gov.in / the e-Gazette:
//
//   • LM (PC) Rules, 2011 (Principal)              G.S.R. 640(E)  07.03.2011
//   • LM (PC) Amendment Rules, 2014 (importer
//     declarations consolidated into Rule 6)
//   • LM (PC) Amendment Rules, 2017 (e-commerce)   G.S.R. 629(E)  23.06.2017
//     → Rule 6(10) e-listing declarations, Rule 9(6); w.e.f. 01.01.2018
//   • LM (PC) Amendment Rules, 2021                G.S.R. 779(E)  02.11.2021
//     → unit sale price (Rule 6(1)(f)), ₹ symbol for MRP, single date basis
//       (month & year of manufacture only), consumer-care telephone + e-mail;
//       w.e.f. 01.04.2022
//   • LM (PC) Amendment Rules, 2022 (computation)  notified 28.03.2022
//     → unit sale price computation clarified; Second Schedule (standard
//       pack sizes) omitted; USP in force w.e.f. 01.10.2022
//   • LM (PC) Second Amendment Rules, 2025         G.S.R. 881(E)  02.12.2025
//     → Rule 26(a) proviso: pan masala exempt; w.e.f. 01.02.2026
//   • LM (PC) Amendment Rules, 2026                G.S.R. 128(E)  13.02.2026
//     → Rule 6(10A) country-of-origin filter on e-commerce; w.e.f. 01.07.2026
//   • LM (PC) Second Amendment Rules, 2026         notified 27.04.2026
//     → substitutes Rule 6(10A); w.e.f. 01.07.2027
//
// GUIDING PRINCIPLES (enforced by the engine, not by this file):
//   1. Nothing is invented at runtime. Every requirement cites a rule number,
//      the amendment that last changed it, and that amendment's effective date.
//   2. The AI first determines WHICH requirements apply (category, origin,
//      channel, package context), then checks each applicable one.
//   3. Failure to READ a declaration is never a FAIL — it is REVIEW.
//      FAIL is reserved for values that WERE read and are clearly non-compliant.
//   4. Exceptions/exemptions (Rule 26 etc.) are first-class records; an exempt
//      requirement is not a violation.
//
// SUB-RULE NUMBERING NOTE: letters of Rule 6(1) follow the current
// consolidated DCA text — (a) name/address, (b) country of origin (inserted
// with the 2014 importer consolidation), (c) common name, (d) net quantity,
// (e) retail sale price (MRP), (f) unit sale price (2021), (g) month & year,
// (h) best before/use by, (i) consumer care. MRP at 6(1)(e) is corroborated by
// Pepsico India Holdings v. State of Kerala (2022). Where a letter could not be
// independently verified from a primary source, the citation is written at
// clause level ("Rule 6(1) — <requirement>") rather than inventing a letter.
// ============================================================================

import type { ProductCategory } from "./productRules";

// ---------------------------------------------------------------------------
// Amendment registry — every requirement points at exactly one of these
// ---------------------------------------------------------------------------

export interface AmendmentRecord {
  id: string;
  title: string;
  notification: string;
  dateNotified: string; // ISO date
  effectiveDate: string; // ISO date
  sourceUrl: string;
  summary: string;
}

export const AMENDMENTS: Record<string, AmendmentRecord> = {
  am2011_principal: {
    id: "am2011_principal",
    title: "Legal Metrology (Packaged Commodities) Rules, 2011 (Principal)",
    notification: "G.S.R. 640(E)",
    dateNotified: "2011-03-07",
    effectiveDate: "2011-03-07",
    sourceUrl: "https://consumeraffairs.gov.in/pages/legal-metrology-act",
    summary:
      "Principal rules: mandatory declarations (Rule 6), principal display panel and placement (Rule 7), net quantity (Rule 11), retail sale price (Rule 18), exemptions (Rule 26), registration (Rule 27), Fourth Schedule numeral-height slabs.",
  },
  am2014_importer: {
    id: "am2014_importer",
    title: "Legal Metrology (PC) Amendment Rules, 2014",
    notification: "DCA notification (2014)",
    dateNotified: "2014-01-01",
    effectiveDate: "2014-01-01",
    sourceUrl: "https://consumeraffairs.gov.in/pages/legal-metrology-act",
    summary:
      "Consolidated the Legal Metrology (Display of Information on Imported Packages) Rules into the PC Rules — importer name/address and country of origin declarations for imported packages.",
  },
  am2017_ecommerce: {
    id: "am2017_ecommerce",
    title: "Legal Metrology (PC) Amendment Rules, 2017",
    notification: "G.S.R. 629(E) dated 23.06.2017",
    dateNotified: "2017-06-23",
    effectiveDate: "2018-01-01",
    sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1497983",
    summary:
      "Inserted Rule 6(10): e-commerce entities must display the Rule 6(1) mandatory declarations on the digital network (month & year excepted); Rule 9(6) declaration for e-commerce transactions.",
  },
  am2021: {
    id: "am2021",
    title: "Legal Metrology (PC) Amendment Rules, 2021",
    notification: "G.S.R. 779(E) dated 02.11.2021",
    dateNotified: "2021-11-02",
    effectiveDate: "2022-04-01",
    sourceUrl:
      "https://consumeraffairs.gov.in/pages/legal-metrology-act (G.S.R. 779(E))",
    summary:
      "Introduced unit sale price (Rule 6(1)(f)); MRP declared with the ₹ symbol; removed month/year of pre-packing or import as an alternative to manufacture date; consumer-care to include telephone number and e-mail address.",
  },
  am2022: {
    id: "am2022",
    title: "Legal Metrology (PC) Amendment Rules, 2022",
    notification: "DCA notification dated 28.03.2022",
    dateNotified: "2022-03-28",
    effectiveDate: "2022-10-01",
    sourceUrl: "https://consumeraffairs.gov.in/pages/legal-metrology-act",
    summary:
      "Clarified unit sale price computation (two decimal places; free-quantity exclusion) and omitted the Second Schedule (standard pack sizes) — any net quantity may be packed.",
  },
  am2025_second: {
    id: "am2025_second",
    title: "Legal Metrology (PC) Second Amendment Rules, 2025",
    notification: "G.S.R. 881(E) dated 02.12.2025",
    dateNotified: "2025-12-02",
    effectiveDate: "2026-02-01",
    sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2198215&reg=3&lang=1",
    summary:
      "Inserted a proviso under Rule 26(a): the provisions of Rule 26(a) shall not apply to pan masala.",
  },
  am2026: {
    id: "am2026",
    title: "Legal Metrology (PC) Amendment Rules, 2026",
    notification: "G.S.R. 128(E) dated 13.02.2026",
    dateNotified: "2026-02-13",
    effectiveDate: "2026-07-01",
    sourceUrl: "https://consumeraffairs.gov.in/pages/legal-metrology-act",
    summary:
      "Inserted Rule 6(10A): every e-commerce entity selling imported products must provide listings through a searchable and sortable filter specifying country of origin.",
  },
  am2026_second: {
    id: "am2026_second",
    title: "Legal Metrology (PC) Second Amendment Rules, 2026",
    notification: "DCA notification dated 27.04.2026",
    dateNotified: "2026-04-27",
    effectiveDate: "2027-07-01",
    sourceUrl: "https://consumeraffairs.gov.in/pages/legal-metrology-act",
    summary:
      "Substitutes Rule 6(10A) (revised country-of-origin filter requirements) with effect from 01.07.2027.",
  },
};

/** Version stamp surfaced on every report. Bump when the KB itself changes. */
export const KB_VERSION = "kb-2026.09.1";
export const KB_SOURCES =
  "Department of Consumer Affairs — LM (PC) Rules 2011 consolidated with amendments G.S.R. 640(E)/2011, G.S.R. 629(E)/2017, G.S.R. 779(E)/2021, 28.03.2022 notification, G.S.R. 881(E)/2025, G.S.R. 128(E)/2026 and the 27.04.2026 notification.";

// ---------------------------------------------------------------------------
// Exceptions / exemptions registry (Rule 26 & FAQ-consolidated carve-outs)
// ---------------------------------------------------------------------------

export type ExceptionCondition =
  | { type: "netQuantityAtMost"; value: number; unit: "g" | "ml" }
  | { type: "productClassIn"; classes: string[] }
  | { type: "notForRetailSale" }
  | { type: "uspEqualsRetailPrice" }
  | { type: "innerPackage" }
  | { type: "whenPackedDeclaration"; classes: string[] }
  | { type: "dateBasisWhenPacked" };

export interface ExceptionRule {
  id: string;
  name: string;
  ruleCited: string;
  description: string;
  condition: ExceptionCondition;
  /** Requirement ids this exception waives when its condition matches. */
  waives: string[];
  /** Requirement ids that remain applicable despite the exemption. */
  keeps: string[];
  amendmentId: string;
}

export const EXCEPTIONS: ExceptionRule[] = [
  {
    id: "ex_rule26_small_pack",
    name: "Small-package exemption (≤ 10 g / ≤ 10 ml)",
    ruleCited: "Rule 26(a)",
    description:
      "Packages containing 10 g or less / 10 ml or less are exempt from specified retail declarations under Rule 26. The unit sale price is not required on retail packs of 10 g / 10 ml or less (Department of Consumer Affairs FAQ).",
    condition: { type: "netQuantityAtMost", value: 10, unit: "g" },
    waives: ["rq_unit_sale_price"],
    keeps: ["rq_name_address", "rq_common_name", "rq_net_quantity", "rq_mrp"],
    amendmentId: "am2011_principal",
  },
  {
    id: "ex_rule26_small_pack_ml",
    name: "Small-package exemption (≤ 10 ml)",
    ruleCited: "Rule 26(a)",
    description:
      "Same exemption as ex_rule26_small_pack applied on volume — packs of 10 ml or less.",
    condition: { type: "netQuantityAtMost", value: 10, unit: "ml" },
    waives: ["rq_unit_sale_price"],
    keeps: ["rq_name_address", "rq_common_name", "rq_net_quantity", "rq_mrp"],
    amendmentId: "am2011_principal",
  },
  {
    id: "ex_wholesale_not_for_retail",
    name: "Wholesale / institutional package",
    ruleCited: "Rule 2(l), 2(m) & Rule 26 proviso context",
    description:
      "Wholesale packages, and packages sold to institutional/industrial consumers marked 'NOT FOR RETAIL SALE', follow a lighter declaration set. Unit sale price is not required on wholesale packages (DCA FAQ).",
    condition: { type: "notForRetailSale" },
    waives: ["rq_unit_sale_price"],
    keeps: ["rq_name_address", "rq_net_quantity", "rq_mrp"],
    amendmentId: "am2011_principal",
  },
  {
    id: "ex_usp_equals_mrp",
    name: "Unit sale price equals retail sale price",
    ruleCited: "Rule 6(1)(f) proviso (DCA FAQ)",
    description:
      "Unit sale price is not required where the retail sale price equals the unit sale price (e.g. single-unit packs).",
    condition: { type: "uspEqualsRetailPrice" },
    waives: ["rq_unit_sale_price"],
    keeps: [],
    amendmentId: "am2022",
  },
  {
    id: "ex_inner_package",
    name: "Inner package (outer carries declarations)",
    ruleCited: "Proviso to Rule 9(3)",
    description:
      "Where the outer package carries all required declarations, the inner package is relieved — including unit sale price (DCA FAQ). Detectable only when the image shows an inner pack inside a fully-declared outer pack.",
    condition: { type: "innerPackage" },
    waives: ["rq_unit_sale_price"],
    keeps: [],
    amendmentId: "am2017_ecommerce",
  },
  {
    id: "ex_when_packed_soaps",
    name: "'When packed' date basis (soaps, lotions, creams, camphor)",
    ruleCited: "Rule 6(1)(g) proviso (DCA FAQ)",
    description:
      "A 'when packed' declaration is permitted in place of month & year of manufacture for all kinds of soaps, lotions, creams and camphor.",
    condition: { type: "whenPackedDeclaration", classes: ["soap", "lotion", "cream", "camphor"] },
    waives: [],
    keeps: ["rq_month_year"],
    amendmentId: "am2011_principal",
  },
  {
    id: "ex_pan_masala_rule26a",
    name: "Pan masala exempt from Rule 26(a)",
    ruleCited: "Rule 26(a) proviso (G.S.R. 881(E))",
    description:
      "With effect from 01.02.2026, the provisions of Rule 26(a) shall not apply to pan masala. Surfaced whenever the vision analysis identifies the product class as pan masala.",
    condition: { type: "productClassIn", classes: ["pan masala"] },
    waives: [],
    keeps: [],
    amendmentId: "am2025_second",
  },
  {
    id: "ex_drugs_cosmetics",
    name: "Drugs under the Drugs and Cosmetics Act",
    ruleCited: "Rule 26",
    description:
      "Packages of drugs covered under the Drugs and Cosmetics Act are exempt from these rules — the scan is out of scope and should be evaluated under the applicable drugs labelling regime.",
    condition: { type: "productClassIn", classes: ["drug", "pharmaceutical", "medicine"] },
    waives: [
      "rq_unit_sale_price", "rq_month_year", "rq_best_before",
      "rq_consumer_care", "rq_fssai", "rq_ingredients",
    ],
    keeps: [],
    amendmentId: "am2011_principal",
  },
  {
    id: "ex_fastfood_restaurant",
    name: "Fast food packed by restaurant / hotel",
    ruleCited: "Rule 26",
    description:
      "Fast food items packed by a restaurant or hotel are exempt from these rules.",
    condition: { type: "productClassIn", classes: ["fast food"] },
    waives: ["rq_unit_sale_price", "rq_month_year", "rq_best_before", "rq_consumer_care"],
    keeps: [],
    amendmentId: "am2011_principal",
  },
];

// ---------------------------------------------------------------------------
// Rule records — the requirement matrix. DATA ONLY (serializable); the
// format validators live in the rule engine, keyed by record id.
// ---------------------------------------------------------------------------

export type RequirementScope =
  | "all"
  | ProductCategory[]
  | "imported"
  | "channel_ecommerce"
  | "channel_advertisement"
  | "officer"
  | "label_non_applicable";

export type ValidationMethod =
  | "ai_format_check"       // engine validates the read value's format/content
  | "ai_presence_with_officer" // presence detectable; correctness needs an officer
  | "calibrated_measurement" // requires physical calibration (font heights)
  | "officer_verification"   // cannot be concluded from the image alone
  | "out_of_label_scope";    // transactional / platform obligation, not on the label

export interface RuleRecord {
  id: string;
  /** Rule number of the Legal Metrology (PC) Rules, 2011. */
  ruleNumber: string;
  /** Exact sub-rule citation as used in reports (e.g. "Rule 6(1)(e)"). */
  subRule: string;
  /** Schedule / table / FAQ reference backing measurable or format aspects. */
  scheduleReference?: string;
  /** The requirement as it stands in the cited version. */
  requirement: string;
  /** Short UI title. */
  requirementShort: string;
  /** Which products / channels / contexts this applies to. */
  scope: RequirementScope;
  /** Extra applicability gate reason shown when scope is category-specific. */
  applicabilityNote?: string;
  /** Exceptions that can waive this requirement. */
  exceptionIds: string[];
  /** How the engine validates it. */
  validationMethod: ValidationMethod;
  /** What evidence is needed to reach PASS. */
  evidenceRequired: string;
  /** Governing statute for cross-regime items (FSSAI etc.). */
  governingRegulation: string;
  /** Amendment that last shaped this requirement. */
  amendmentId: string;
  /** Effective date of the cited version (ISO). */
  effectiveDate: string;
  /** Which extracted field backs this requirement. */
  fieldKey: string;
  /** Mandatory on the cited scope. */
  mandatory: boolean;
  /** Version notes — what the amendment changed, for traceability. */
  versionNotes: string;
}

export const RULE_RECORDS: RuleRecord[] = [
  // ------------------------------------------------------------------ Rule 6
  {
    id: "rq_name_address",
    ruleNumber: "6",
    subRule: "Rule 6(1)(a)",
    requirement:
      "The package must bear the name and complete address of the manufacturer, or where the packer is different, of the packer and manufacturer, or of the importer for imported packages.",
    requirementShort: "Name & address of manufacturer / packer / importer",
    scope: "all",
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired:
      "Printed maker/packer/importer block with an entity name and at least a locality/city address.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "manufacturer",
    mandatory: true,
    versionNotes:
      "Import-route wording consolidated by the 2014 amendment (importer named for imported packages).",
  },
  {
    id: "rq_country_origin_imported",
    ruleNumber: "6",
    subRule: "Rule 6(1)(b)",
    requirement:
      "Every imported package must declare the country of origin (or manufacture or assembly) of the commodity.",
    requirementShort: "Country of origin (imported packages)",
    scope: "imported",
    applicabilityNote:
      "Applies when the package is identified as imported (foreign origin declared, importer block present, or foreign-market markers).",
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired:
      "A printed country-of-origin statement ('Made in …' / 'Country of Origin: …').",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2014_importer",
    effectiveDate: "2014-01-01",
    fieldKey: "countryOfOrigin",
    mandatory: true,
    versionNotes:
      "Import-declaration regime consolidated from the (Display of Information on Imported Packages) Rules by the 2014 amendment.",
  },
  {
    id: "rq_common_name",
    ruleNumber: "6",
    subRule: "Rule 6(1)(c)",
    requirement:
      "The common or generic name of the commodity contained in the package must be declared, distinct from any trade or brand name.",
    requirementShort: "Common / generic name of the commodity",
    scope: "all",
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired: "Printed product/generic name.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "productName",
    mandatory: true,
    versionNotes: "Unchanged since the principal rules.",
  },
  {
    id: "rq_net_quantity",
    ruleNumber: "6",
    subRule: "Rule 6(1)(d)",
    scheduleReference: "Read with Rule 11 (net quantity excludes packaging)",
    requirement:
      "The net quantity must be declared in the standard unit of weight or measure, or by number where the commodity is sold by count. Net quantity excludes the package and wrapper; where the commodity is in a liquid medium, drained weight is relevant.",
    requirementShort: "Net quantity in prescribed units",
    scope: "all",
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired:
      "Printed net-quantity declaration (g, kg, ml, l, N or count).",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2022",
    effectiveDate: "2022-10-01",
    fieldKey: "netQuantity",
    mandatory: true,
    versionNotes:
      "Second Schedule (prescribed standard pack sizes) omitted w.e.f. 01.10.2022 — any net quantity may be packed; 'non-standard size' declaration no longer exists.",
  },
  {
    id: "rq_mrp",
    ruleNumber: "6",
    subRule: "Rule 6(1)(e)",
    scheduleReference: "Read with Rule 2(m) & Rule 18(2)",
    requirement:
      "The retail sale price (MRP) inclusive of all taxes must be declared in Indian currency using the ₹ symbol. Sale above the declared MRP is prohibited (Rule 18(2)); the printed MRP must not be altered (Rule 18(5)-(6)).",
    requirementShort: "Retail sale price (MRP) with ₹ symbol",
    scope: "all",
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired: "Printed MRP line, e.g. 'M.R.P. ₹ 120.00 (inclusive of all taxes)'.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2021",
    effectiveDate: "2022-04-01",
    fieldKey: "mrp",
    mandatory: true,
    versionNotes:
      "G.S.R. 779(E)/2021: MRP to be declared with the ₹ symbol (the 'Rs.' style is no longer a valid declaration). A single revised-MRP sticker is permitted only for a price REDUCTION and must not cover the original declaration (Rule 6(2) proviso).",
  },
  {
    id: "rq_unit_sale_price",
    ruleNumber: "6",
    subRule: "Rule 6(1)(f)",
    scheduleReference: "Computation per G.S.R. 779(E)/2021 as clarified 2022",
    requirement:
      "The unit sale price (inclusive of all taxes) per specified unit of weight/measure/number must be declared, rounded to two decimal places. Unit per g below 1 kg (kg above), per ml below 1 L (L above), per cm below 1 m (m above), per number where sold by count. Free quantities are excluded from the computation.",
    requirementShort: "Unit sale price",
    scope: "all",
    exceptionIds: [
      "ex_rule26_small_pack",
      "ex_rule26_small_pack_ml",
      "ex_wholesale_not_for_retail",
      "ex_usp_equals_mrp",
      "ex_inner_package",
    ],
    validationMethod: "ai_format_check",
    evidenceRequired:
      "Printed unit sale price line, e.g. '₹ 0.37 per g' / '₹ 20.00 per litre'.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2022",
    effectiveDate: "2022-10-01",
    fieldKey: "unitSalePrice",
    mandatory: true,
    versionNotes:
      "Introduced by G.S.R. 779(E)/2021 (w.e.f. 01.04.2022); computation clarified and brought into force 01.10.2022 by the 2022 amendment. Not required where USP equals the retail sale price, on wholesale packages, on ≤ 10 g/ml retail packs, on inner packages where the outer pack carries all declarations, or on e-commerce listings.",
  },
  {
    id: "rq_month_year",
    ruleNumber: "6",
    subRule: "Rule 6(1)(g)",
    requirement:
      "The month and year of manufacture must be declared. (The earlier alternative of month & year of pre-packing or import was removed by the 2021 amendment — a single manufacture-date basis now applies.)",
    requirementShort: "Month & year of manufacture",
    scope: "all",
    exceptionIds: ["ex_when_packed_soaps"],
    validationMethod: "ai_format_check",
    evidenceRequired: "Printed date in MM/YYYY or MM/YY (or permitted 'when packed' basis).",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2021",
    effectiveDate: "2022-04-01",
    fieldKey: "manufactureDate",
    mandatory: true,
    versionNotes:
      "G.S.R. 779(E)/2021 removed the month/year-of-pre-packing-or-import alternative. 'When packed' remains permitted for soaps, lotions, creams and camphor (DCA FAQ).",
  },
  {
    id: "rq_best_before",
    ruleNumber: "6",
    subRule: "Rule 6(1)(h)",
    requirement:
      "Where the commodity may become unfit for human consumption over time, the 'Best before' or 'Use by' date (month and year) must be declared.",
    requirementShort: "Best before / use by (where applicable)",
    scope: ["packaged_food", "beverage", "personal_care"],
    applicabilityNote:
      "Applies to commodities with limited shelf life (foods, beverages, cosmetics). For other categories shelf-life relevance cannot be determined from the image alone.",
    exceptionIds: [],
    validationMethod: "ai_presence_with_officer",
    evidenceRequired: "Printed 'Best before …' / 'Use by …' with month and year.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011 (food labelling read with FSS (Labelling & Display) Regulations, 2020)",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "bestBefore",
    mandatory: true,
    versionNotes:
      "Rule 4 definitions of 'Best before' and 'Use by' unchanged; FSSAI's Labelling & Display Regulations, 2020 govern the food-labelling form.",
  },
  {
    id: "rq_consumer_care",
    ruleNumber: "6",
    subRule: "Rule 6(1)(i)",
    requirement:
      "Consumer-care details must be declared: the name, address, telephone number and e-mail address of the person or office who can be contacted in case of consumer complaints.",
    requirementShort: "Consumer-care details (incl. telephone & e-mail)",
    scope: "all",
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired:
      "Printed consumer-care block; the 2021 form requires a telephone number and e-mail address.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2021",
    effectiveDate: "2022-04-01",
    fieldKey: "consumerCare",
    mandatory: true,
    versionNotes:
      "G.S.R. 779(E)/2021 requires the consumer-care declaration to carry a telephone number and e-mail address. Partial blocks (phone without e-mail etc.) are REVIEW, not FAIL, because the remaining lines may be on another panel.",
  },
  {
    id: "rq_ecommerce_listing_declarations",
    ruleNumber: "6",
    subRule: "Rule 6(10)",
    requirement:
      "An e-commerce entity must display on its digital network the mandatory declarations required under Rule 6(1), except the month and year of manufacture/packing. Unit sale price is not required on the listing (DCA FAQ).",
    requirementShort: "E-commerce listing declarations",
    scope: "channel_ecommerce",
    applicabilityNote:
      "Platform/listing obligation — outside the scope of a physical-package scan; evaluated when the report context is an e-commerce listing.",
    exceptionIds: [],
    validationMethod: "out_of_label_scope",
    evidenceRequired: "Listing page showing the Rule 6(1) declarations.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2017_ecommerce",
    effectiveDate: "2018-01-01",
    fieldKey: "productName",
    mandatory: true,
    versionNotes: "Inserted by G.S.R. 629(E)/2017, w.e.f. 01.01.2018.",
  },
  {
    id: "rq_ecommerce_origin_filter",
    ruleNumber: "6",
    subRule: "Rule 6(10A)",
    requirement:
      "Every e-commerce entity selling imported products must provide those listings through a searchable and sortable filter specifying the country of origin.",
    requirementShort: "E-commerce country-of-origin filter (imported products)",
    scope: "channel_ecommerce",
    applicabilityNote:
      "Platform capability obligation — outside the scope of a physical-package scan.",
    exceptionIds: [],
    validationMethod: "out_of_label_scope",
    evidenceRequired: "Platform filter UI (searchable/sortable by country of origin).",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2026",
    effectiveDate: "2026-07-01",
    fieldKey: "productName",
    mandatory: true,
    versionNotes:
      "Inserted by G.S.R. 128(E)/2026 w.e.f. 01.07.2026; the sub-rule is substituted by the Second Amendment Rules, 2026 w.e.f. 01.07.2027.",
  },
  // ------------------------------------------------------------------ Rule 7
  {
    id: "rq_placement_pdp",
    ruleNumber: "7",
    subRule: "Rule 7(1)-(2)",
    scheduleReference: "Principal display panel area per Rule 7(2) formulas",
    requirement:
      "Mandatory declarations must appear on the principal display panel — grouped together in one place, or grouped as pre-printed and online-printed information. Declarations must not be scattered around the pack.",
    requirementShort: "Placement on the principal display panel",
    scope: "all",
    exceptionIds: [],
    validationMethod: "officer_verification",
    evidenceRequired:
      "Full front-panel capture showing the grouping of declarations (only a partial placement conclusion is possible from a single photo).",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "manufacturer",
    mandatory: true,
    versionNotes: "Unchanged since the principal rules.",
  },
  // ------------------------------------------------------------------ Rule 9
  {
    id: "rq_font_net_quantity",
    ruleNumber: "9",
    subRule: "Rule 9(1)",
    scheduleReference: "Fourth Schedule — numeral height by net quantity",
    requirement:
      "The height of numerals in the net-quantity declaration must meet the Fourth Schedule minimum for the package size (slabs ascending with quantity).",
    requirementShort: "Net-quantity numeral height (Fourth Schedule)",
    scope: "all",
    exceptionIds: [],
    validationMethod: "calibrated_measurement",
    evidenceRequired:
      "Physical calibration (real package height) plus a confidently localized bounding box around the net-quantity declaration.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "netQuantity",
    mandatory: true,
    versionNotes: "Fourth Schedule slabs unchanged.",
  },
  {
    id: "rq_font_declarations",
    ruleNumber: "9",
    subRule: "Rule 9(2) & Table I (DCA FAQ)",
    scheduleReference: "Table I — minimum type height by principal display panel area",
    requirement:
      "Numerals and letters of the mandatory declarations must meet the minimum type height for the principal display panel area (e.g. <50 cm² → 1.0 mm; 50–100 → 1.5 mm; 100–500 → 2.5 mm; 500–2500 → 4.0 mm; >2500 → 6.0 mm; higher for blown/formed/moulded containers).",
    requirementShort: "Minimum type height (Table I)",
    scope: "all",
    exceptionIds: [],
    validationMethod: "calibrated_measurement",
    evidenceRequired:
      "Physical calibration plus measured character height; panel area determines the applicable minimum.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011 (type-height table per DCA FAQ)",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "mrp",
    mandatory: true,
    versionNotes:
      "For MRP the size requirement applies to the printed value; for consumer care it applies to all letters and numerals.",
  },
  {
    id: "rq_clear_space_net_quantity",
    ruleNumber: "9",
    subRule: "Rule 9(3) context (DCA FAQ)",
    requirement:
      "The area surrounding the net-quantity declaration must be free of other printed matter: above and below by a space equal to the numeral height, and left/right by double the numeral height.",
    requirementShort: "Clear space around net quantity",
    scope: "all",
    exceptionIds: [],
    validationMethod: "officer_verification",
    evidenceRequired: "Front-panel capture around the net-quantity declaration at adequate resolution.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "netQuantity",
    mandatory: true,
    versionNotes: "Unchanged since the principal rules.",
  },
  // ----------------------------------------------------------------- Rule 6(2)
  {
    id: "rq_no_individual_stickers",
    ruleNumber: "6",
    subRule: "Rule 6(2)",
    requirement:
      "A single mandatory declaration (such as date of manufacture or MRP) must not be given by affixing an individual sticker. Exception: a sticker declaring a REDUCED MRP is permitted provided it does not cover the manufacturer's original MRP declaration.",
    requirementShort: "No individual-sticker declarations",
    scope: "all",
    exceptionIds: [],
    validationMethod: "officer_verification",
    evidenceRequired: "Package surface showing whether declarations are printed or stickered.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "mrp",
    mandatory: true,
    versionNotes: "Reduced-MRP sticker proviso unchanged; Rule 33 circulars permit revised-MRP declarations on unsold stock.",
  },
  // ---------------------------------------------------------------- Rule 11
  {
    id: "rq_drained_weight",
    ruleNumber: "11",
    subRule: "Rule 11(3) context",
    requirement:
      "Where a commodity is packed in a liquid medium, the drained weight of the contents must also be declared.",
    requirementShort: "Drained weight (commodities in liquid medium)",
    scope: ["packaged_food"],
    applicabilityNote:
      "Applies when the vision analysis identifies the commodity as packed in a liquid medium (brine, syrup, oil).",
    exceptionIds: [],
    validationMethod: "ai_presence_with_officer",
    evidenceRequired: "Printed drained-weight declaration on packs sold with liquid medium.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "netQuantity",
    mandatory: true,
    versionNotes: "Unchanged since the principal rules.",
  },
  // ---------------------------------------------------------------- Rule 27
  {
    id: "rq_27_registration",
    ruleNumber: "27",
    subRule: "Rule 27(1)-(2)",
    requirement:
      "Every manufacturer, packer and importer of pre-packaged commodities must register with the Director/Controller of Legal Metrology within ninety days of commencing pre-packing.",
    requirementShort: "Registration of manufacturer / packer / importer",
    scope: "officer",
    applicabilityNote:
      "Entity-level obligation — not visible on the package; verified through the registration certificate during inspection.",
    exceptionIds: [],
    validationMethod: "officer_verification",
    evidenceRequired: "Certificate of registration (Rule 27) for the maker/packer/importer of record.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "manufacturer",
    mandatory: true,
    versionNotes: "Unchanged since the principal rules.",
  },
  // --------------------------------------------------------- Cross-regime
  {
    id: "rq_fssai",
    ruleNumber: "—",
    subRule: "FSS (Labelling & Display) Regulations, 2020 — 2.5 licence display",
    requirement:
      "Food products must display the FBO's 14-digit FSSAI licence number and logo. (Not an LM-PC requirement — checked because it is label-adjacent and often confused with Rule 6 declarations.)",
    requirementShort: "FSSAI licence number (food products)",
    scope: ["packaged_food", "beverage"],
    exceptionIds: [],
    validationMethod: "ai_format_check",
    evidenceRequired: "Printed 14-digit licence number with FSSAI logo/marking.",
    governingRegulation: "FSS (Labelling & Display) Regulations, 2020 (FSSAI)",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "fssaiLicense",
    mandatory: true,
    versionNotes:
      "Governed by FSSAI, not the Department of Consumer Affairs; surfaced for completeness of the label review.",
  },
  {
    id: "rq_ingredients",
    ruleNumber: "—",
    subRule: "FSS (Labelling & Display) Regulations, 2020 — 2.2.1 ingredients list",
    requirement:
      "Packaged food must carry a list of ingredients in descending order of weight. (Not an LM-PC requirement — surfaced for completeness.)",
    requirementShort: "List of ingredients (food)",
    scope: ["packaged_food", "beverage"],
    exceptionIds: [],
    validationMethod: "ai_presence_with_officer",
    evidenceRequired: "Printed ingredient list with descending-order wording.",
    governingRegulation: "FSS (Labelling & Display) Regulations, 2020 (FSSAI)",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "ingredients",
    mandatory: true,
    versionNotes: "Per DCA/FSSAI division of competence: LM governs MRP, net weight and consumer care on food packs; ingredient labelling is FSSAI's.",
  },
  // ------------------------------------------------- Transactional context
  {
    id: "rq_no_sale_above_mrp",
    ruleNumber: "18",
    subRule: "Rule 18(2)",
    requirement:
      "No retail dealer or other person (including manufacturer, packer, importer and wholesale dealer) shall make any sale of a commodity in packed form at a price exceeding the declared retail sale price.",
    requirementShort: "No sale above the declared MRP",
    scope: "label_non_applicable",
    applicabilityNote:
      "Transaction-time obligation — cannot be tested from a label photo; checked at point of sale.",
    exceptionIds: [],
    validationMethod: "out_of_label_scope",
    evidenceRequired: "Bill of sale / shelf price versus declared MRP.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "mrp",
    mandatory: true,
    versionNotes: "Rule 18(3) advertisement requirement waived for voluntary revised-MRP declarations per the Rule 33 circular of 18.09.2025.",
  },
  {
    id: "rq_advertisement_mrp_qty",
    ruleNumber: "31",
    subRule: "Rule 31(1)",
    requirement:
      "Any advertisement for a retail sale must declare the retail sale price and the net quantity.",
    requirementShort: "Advertisement must show MRP & net quantity",
    scope: "channel_advertisement",
    applicabilityNote:
      "Advertisement-context obligation — evaluated when the report context is an advertisement, not a package scan.",
    exceptionIds: [],
    validationMethod: "out_of_label_scope",
    evidenceRequired: "Advertisement copy showing MRP and net quantity.",
    governingRegulation: "Legal Metrology (PC) Rules, 2011",
    amendmentId: "am2011_principal",
    effectiveDate: "2011-03-07",
    fieldKey: "mrp",
    mandatory: true,
    versionNotes: "Unit sale price is not required in advertisements (DCA FAQ).",
  },
];

/** Human-readable label for the scope enum (used in reports). */
export function scopeLabel(scope: RequirementScope): string {
  switch (scope) {
    case "all":
      return "All pre-packaged commodities (retail)";
    case "imported":
      return "Imported packages";
    case "channel_ecommerce":
      return "E-commerce listings (platform obligation)";
    case "channel_advertisement":
      return "Advertisements";
    case "officer":
      return "Entity-level obligation (officer verification)";
    case "label_non_applicable":
      return "Not testable from a label image (transaction-time obligation)";
    default:
      return Array.isArray(scope)
        ? `Categories: ${scope.join(", ")}`
        : String(scope);
  }
}

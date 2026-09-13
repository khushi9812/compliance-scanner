// Shared schema validators — the contract shared by the vision action, the
// rule engine, and both portals. The AI-vision pipeline carries its payloads
// as v.any() inside the DB (schemaValidation is off), so these helpers focus
// on the pieces the app filters and renders on.

import { v } from "convex/values";

/** Portal role that produced a scan. */
export const portalRole = v.union(v.literal("consumer"), v.literal("officer"));

/** Normed address of an inspection site (state/district optional). */
export const geoLocation = v.object({
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  state: v.optional(v.string()),
  district: v.optional(v.string()),
});

/** Overall engine decision. */
export const decisionValidator = v.union(
  v.literal("PASS"),
  v.literal("FAIL"),
  v.literal("REVIEW"),
);

/** Brand key used for repeat-offender aggregation. */
export function brandKey(
  brand?: string,
  productName?: string,
): string {
  const b = (brand ?? "").trim().toLowerCase();
  if (b) return b;
  const p = (productName ?? "").trim().toLowerCase();
  if (p) return p;
  return "unidentified";
}

/** Human label for a decision chip. */
export function decisionLabel(d: "PASS" | "FAIL" | "REVIEW"): string {
  return d === "PASS" ? "Compliant" : d === "FAIL" ? "Non-compliant" : "Needs review";
}

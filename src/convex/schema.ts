import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const decisionValidator = v.union(
  v.literal("PASS"),
  v.literal("FAIL"),
  v.literal("REVIEW"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // AI vision compliance analyses (consumer + officer portals).
    scans: defineTable({
      scanId: v.string(),
      timestamp: v.number(),
      imageHash: v.string(),
      imageWidth: v.number(),
      imageHeight: v.number(),
      evidenceStorageId: v.optional(v.id("_storage")),
      imageUrl: v.optional(v.string()),
      portalRole: v.union(v.literal("consumer"), v.literal("officer")),
      source: v.union(
        v.literal("upload"),
        v.literal("camera"),
        v.literal("url"),
        v.literal("offline_sync"),
      ),
      geolocation: v.optional(
        v.object({
          lat: v.optional(v.number()),
          lng: v.optional(v.number()),
          state: v.optional(v.string()),
          district: v.optional(v.string()),
        }),
      ),
      calibration: v.optional(
        v.object({
          realHeightMm: v.number(),
          boundingBoxPixelHeight: v.number(),
        }),
      ),
      // Full VisionAnalysis payload (product understanding + extraction).
      analysis: v.any(),
      // Barcode product-database lookup result.
      database: v.any(),
      // Full rule-engine output (requirements, cross-check, fonts, decision).
      result: v.any(),
      // Denormalized for indexes / analytics.
      decision: decisionValidator,
      brand: v.optional(v.string()),
      productName: v.optional(v.string()),
      category: v.string(),
      createdAt: v.number(),
      officerId: v.optional(v.id("users")),
    })
      .index("by_scanId", ["scanId"])
      .index("by_createdAt", ["createdAt"])
      .index("by_role_createdAt", ["portalRole", "createdAt"])
      .index("by_officer_createdAt", ["officerId", "createdAt"])
      .index("by_decision_createdAt", ["decision", "createdAt"])
      .index("by_category_createdAt", ["category", "createdAt"]),

    // Generated legal notices / reports.
    reports: defineTable({
      reportId: v.string(),
      scanDocId: v.id("scans"),
      noticeNo: v.string(),
      officerId: v.optional(v.id("users")),
      officerName: v.string(),
      generatedAt: v.number(),
      violationCount: v.number(),
    }).index("by_generatedAt", ["generatedAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;

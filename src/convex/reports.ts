// Reports API — Automated Digital Notice Generator.
// Drafts a legal-grade inspection notice from a flagged scan: notice number,
// legal header, violation lines with citations, evidence refs, and officer
// details. PDF/DOCX rendering happens client-side (see src/lib/notice-doc.ts)
// so no external binaries are required.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { REQUIREMENTS } from "./productRules";
import type { EngineResult } from "./ruleEngine";

export interface NoticeViolation {
  clause: string;
  requirementId?: string;
  observed: string;
  required: string;
  penaltyNote: string;
}

export interface NoticeEvidence {
  label: string;
  imageHash: string;
  imageUrl?: string;
}

export interface NoticeDraft {
  scanDocId: string;
  scanId: string;
  noticeNo: string;
  generatedAt: number;
  officerId?: string;
  officerName: string;
  subject: string;
  addressee: string;
  body: string[];
  violations: NoticeViolation[];
  evidence: NoticeEvidence[];
  applicableCount: number;
  passCount: number;
  failCount: number;
  reviewCount: number;
  ruleVersion: string;
}

/** Human requirement text for a field key (from the curated knowledge base). */
function requirementTextFor(fieldKey: string): string {
  return (
    REQUIREMENTS.find((r) => r.fieldKey === fieldKey)?.requirementText ??
    "Mandatory declaration per Rule 6(1), Legal Metrology (PC) Rules, 2011"
  );
}

/** Build a notice draft from a stored scan (read-only). */
export const buildNotice = query({
  args: { scanDocId: v.id("scans") },
  handler: async (ctx, args): Promise<NoticeDraft | null> => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;

    const scan = await ctx.db.get(args.scanDocId);
    if (!scan) return null;

    const result = scan.result as EngineResult | undefined;
    const scanRef = scan.scanId;
    const now = Date.now();
    const seq = (now % 10000).toString().padStart(4, "0");
    const noticeNo = `LM/ENF/${new Date(now).getFullYear()}/${seq}/${scanRef}`;

    // Violations = mandatory requirements the engine confidently failed.
    const violations: NoticeViolation[] = (result?.requirements ?? [])
      .filter((r) => r.status === "FAIL")
      .map((r) => ({
        clause: r.ruleCited,
        requirementId: r.requirementId,
        observed: [r.detected ?? "—", r.reason ?? ""].filter(Boolean).join(" — "),
        required: requirementTextFor(r.requirementId),
        penaltyNote:
          "Non-declaration / incorrect declaration attracts penalties under the Legal Metrology Act, 2009 §36.",
      }));

    const draft: NoticeDraft = {
      scanDocId: scan._id,
      scanId: scanRef,
      noticeNo,
      generatedAt: now,
      officerId: userId ?? undefined,
      officerName: user?.name ?? "Inspecting Officer",
      subject: `Notice — non-compliant packaged commodity declarations (Scan ${scanRef})`,
      addressee: scan.brand
        ? `M/s ${scan.brand}`
        : "The Manufacturer / Packer / Importer (per panel declaration)",
      body: [
        `Whereas an inspection of the packaged commodity bearing scan reference ${scanRef} was carried out under the Legal Metrology Act, 2009 and the Legal Metrology (Packaged Commodities) Rules, 2011;`,
        `And whereas the applicable declarations were verified with an evidence-anchored rule evaluation — of ${result?.applicableCount ?? 0} applicable requirements, ${result?.passCount ?? 0} passed, ${result?.failCount ?? 0} failed and ${result?.reviewCount ?? 0} could not be reliably determined from the captured image;`,
        "And whereas you are hereby directed to show cause, within 15 days of receipt of this notice, why action should not be initiated against you for the violations listed below;",
        "Take notice that failure to respond within the said period will be construed as non-contestation and proceedings may proceed ex parte.",
      ],
      violations,
      evidence: [
        {
          label: "Label capture (full panel, SHA-256 hashed)",
          imageHash: scan.imageHash,
          imageUrl: scan.imageUrl,
        },
      ],
      applicableCount: result?.applicableCount ?? 0,
      passCount: result?.passCount ?? 0,
      failCount: result?.failCount ?? 0,
      reviewCount: result?.reviewCount ?? 0,
      ruleVersion: result?.appliedRuleVersion ?? "lm2011.vision.2.0",
    };
    return draft;
  },
});

/** Persist a finalized report after the officer exports it. */
export const saveReport = mutation({
  args: {
    scanDocId: v.id("scans"),
    noticeNo: v.string(),
    officerName: v.string(),
    violationCount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();
    const reportId = `RPT-${now.toString(36).toUpperCase()}`;
    await ctx.db.insert("reports", {
      reportId,
      scanDocId: args.scanDocId,
      noticeNo: args.noticeNo,
      officerId: userId ?? undefined,
      officerName: args.officerName,
      generatedAt: now,
      violationCount: args.violationCount,
    });
    return reportId;
  },
});

/** List reports for the repository. */
export const listReports = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reports")
      .withIndex("by_generatedAt")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

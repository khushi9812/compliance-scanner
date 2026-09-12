// Reports API — Automated Digital Notice Generator.
// Drafts a legal-grade inspection notice from a flagged scan: notice number,
// legal header, violation lines with citations, evidence refs, and officer
// details. PDF/DOCX rendering happens client-side (see src/lib/notice-doc.ts)
// so no external binaries are required.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export interface NoticeViolation {
  clause: string;
  field?: string;
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
  noticeNo: string;
  generatedAt: number;
  officerId?: string;
  officerName: string;
  subject: string;
  addressee: string;
  body: string[];
  violations: NoticeViolation[];
  evidence: NoticeEvidence[];
  complianceScore: number;
  ruleVersion: string;
}

const requiredText: Record<string, string> = {
  mrp: "MRP with ₹ symbol, inclusive of all taxes (Rule 6(1)(e))",
  net_quantity: "Net quantity in standard SI units (Rule 6(1)(a))",
  mfd_date: "Month & year in MM/YYYY (Rule 6(1)(d))",
  manufacturer: "Name & full address of manufacturer/packer (Rule 6(1)(b))",
  consumer_care: "Consumer-care phone/email/URL (Rule 6(1)(f))",
  country_of_origin: "Country of origin declaration (Rule 6(1)(i))",
};

/** Build a notice draft from a stored scan (read-only). */
export const buildNotice = query({
  args: { scanDocId: v.id("scans") },
  handler: async (ctx, args): Promise<NoticeDraft | null> => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;

    const scan = await ctx.db.get(args.scanDocId);
    if (!scan) return null;

    const result = scan.result;
    const scanRef = scan.scanId;
    const now = Date.now();
    const seq = (now % 10000).toString().padStart(4, "0");
    const noticeNo = `LM/ENF/${new Date(now).getFullYear()}/${seq}/${scanRef}`;

    const violations: NoticeViolation[] = [];

    for (const f of result?.missingFields ?? []) {
      violations.push({
        clause: "Rule 6(1) — mandatory declaration absent",
        field: f,
        observed: "Not declared / not detectable on the panel",
        required: requiredText[f] ?? "Mandatory declaration per Rule 6(1)",
        penaltyNote:
          "Non-declaration attracts penalties under the Legal Metrology Act, 2009 §36.",
      });
    }
    for (const v of result?.formattingViolations ?? []) {
      violations.push({
        clause: v.ruleCited,
        field: v.field ?? undefined,
        observed: v.details,
        required: v.field
          ? (requiredText[v.field] ?? "Format per Rule 6")
          : "Format per Rule 6",
        penaltyNote: "Incorrect declaration is an offence under §36 of the Act.",
      });
    }
    for (const v of result?.fontSizeViolations ?? []) {
      violations.push({
        clause: v.citation,
        field: v.field,
        observed: `Character height ${v.actualMm} mm (measured via physical calibration)`,
        required: `Minimum ${v.requiredMm} mm per Fourth Schedule slab`,
        penaltyNote:
          "Undersized declarations are an offence under §36 of the Act.",
      });
    }

    const draft: NoticeDraft = {
      scanDocId: scan._id,
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
        `And whereas the mandatory declarations under Rule 6(1) were found deficient — ${violations.length} violation(s) recorded with a compliance score of ${result?.complianceScore ?? 0}/100;`,
        "And whereas you are hereby directed to show cause, within 15 days of receipt of this notice, why action should not be initiated against you for the violations listed below;",
        "Take notice that failure to respond within the said period will be construed as non-contestation and proceedings may proceed ex parte.",
      ],
      violations,
      evidence: [
        {
          label: "Label capture (full panel)",
          imageHash: scan.imageHash,
          imageUrl: scan.imageUrl,
        },
      ],
      complianceScore: result?.complianceScore ?? 0,
      ruleVersion: result?.appliedRuleVersion ?? "2011.04.fourth-schedule",
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

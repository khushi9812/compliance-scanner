// Notice document builders — render a NoticeDraft into (a) a legal-grade
// print/PDF view and (b) an editable Word-compatible .doc file, plus the
// consumer grievance text for the National Consumer Helpline.

import type { NoticeDraft } from "@/convex/reports";
import { requirementLabel } from "./scan-client";
import type { EngineResult } from "@/convex/ruleEngine";

export type { NoticeDraft };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Government-notice-style HTML document (used for print + docx). */
export function noticeHtml(draft: NoticeDraft): string {
  const rows = draft.violations
    .map(
      (v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(v.clause)}</b>${v.requirementId ? ` — ${esc(requirementLabel(v.requirementId))}` : ""}</td>
        <td>${esc(v.observed)}</td>
        <td>${esc(v.required)}</td>
      </tr>`,
    )
    .join("");

  const tally = `Applicable requirements: ${draft.applicableCount} — ✅ PASS ${draft.passCount} · ❌ FAIL ${draft.failCount} · ⚠️ REVIEW ${draft.reviewCount}`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(draft.noticeNo)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; font-size: 12.5px; line-height: 1.55; margin: 0; padding: 24px; }
  .head { text-align: center; border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 18px; }
  .head h1 { font-size: 17px; letter-spacing: 2px; margin: 0 0 4px; text-transform: uppercase; }
  .head p { margin: 2px 0; font-size: 11.5px; }
  .meta { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
  .meta td { padding: 3px 6px; vertical-align: top; font-size: 12px; }
  .meta td:first-child { width: 22%; white-space: nowrap; color: #333; }
  table.viol { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 11.5px; }
  table.viol th, table.viol td { border: 1px solid #444; padding: 6px 8px; text-align: left; vertical-align: top; }
  table.viol th { background: #eee; text-transform: uppercase; letter-spacing: 0.6px; font-size: 10.5px; }
  ol.body-paras { padding-left: 20px; }
  ol.body-paras li { margin-bottom: 8px; }
  .evidence { border: 1px dashed #666; padding: 10px; margin-top: 14px; }
  .sign { margin-top: 42px; width: 60%; margin-left: auto; text-align: center; }
  .sign .line { border-top: 1px solid #111; margin-top: 48px; padding-top: 6px; }
  .stamp { margin-top: 10px; font-family: monospace; border: 3px double #8b1a1a; color: #8b1a1a; display: inline-block; padding: 4px 10px; transform: rotate(-3deg); letter-spacing: 2px; font-size: 11px; }
</style>
</head>
<body>
  <div class="head">
    <h1>Legal Metrology — Inspection Notice</h1>
    <p>Under the Legal Metrology Act, 2009 and the Legal Metrology (Packaged Commodities) Rules, 2011</p>
  </div>

  <table class="meta">
    <tr><td>Notice No.</td><td><b>${esc(draft.noticeNo)}</b></td></tr>
    <tr><td>Generated</td><td>${fmtDate(draft.generatedAt)}</td></tr>
    <tr><td>Scan Reference</td><td>${esc(draft.scanId)}</td></tr>
    <tr><td>To</td><td>${esc(draft.addressee)}</td></tr>
    <tr><td>Inspecting Officer</td><td>${esc(draft.officerName)}</td></tr>
    <tr><td>Rule Evaluation</td><td>${esc(tally)} (ruleset ${esc(draft.ruleVersion)}, KB ${esc(draft.kbVersion ?? "")})</td></tr>
  </table>

  <p><b>SUBJECT:</b> ${esc(draft.subject)}</p>

  <ol class="body-paras">
    ${draft.body.map((p) => `<li>${esc(p)}</li>`).join("")}
  </ol>

  <p><b>PARTICULARS OF VIOLATIONS</b></p>
  <table class="viol">
    <thead>
      <tr><th>#</th><th>Clause cited</th><th>Observed on the package</th><th>Required under the Rules</th></tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="4">No violations recorded.</td></tr>`}
    </tbody>
  </table>

  <div class="evidence">
    <b>EVIDENCE</b>
    <div>SHA-256 chain-of-custody hash: <code>${esc(draft.evidence[0]?.imageHash ?? "—")}</code></div>
    <div>${esc(draft.evidence[0]?.label ?? "Label capture")}</div>
  </div>

  <div class="sign">
    <div class="line"><b>${esc(draft.officerName)}</b><br/>Inspecting Officer, Legal Metrology</div>
    <div class="stamp">ISSUED VIA METROSCAN</div>
  </div>
</body>
</html>`;
}

/** Trigger browser print-to-PDF for the notice. */
export function printNotice(draft: NoticeDraft): void {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    alert("Please allow pop-ups to print the notice.");
    return;
  }
  win.document.write(noticeHtml(draft));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/** Download the notice HTML as an editable Word-compatible document. */
export function downloadDocx(draft: NoticeDraft): void {
  const html = noticeHtml(draft);
  const blob = new Blob(
    [
      "MIME-Version: 1.0\nContent-Type: multipart/related; boundary=\"----=_mower\"\n\n------=_mower\nContent-Type: text/html; charset=\"utf-8\"\nContent-Transfer-Encoding: 8bit\n\n",
      html,
      "\n------=_mower--",
    ],
    { type: "application/msword" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${draft.noticeNo.replace(/[^\w\-]+/g, "_")}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Plain-text grievance body for the National Consumer Helpline draft. */
export function grievanceText(opts: {
  scanId: string;
  productName?: string;
  brand?: string;
  result?: EngineResult;
  location?: { lat?: number; lng?: number; state?: string; district?: string };
}): string {
  const parts: string[] = [];
  parts.push(
    `I wish to report a packaged commodity that does not carry the mandatory declarations required under Rule 6 of the Legal Metrology (Packaged Commodities) Rules, 2011.`,
  );
  if (opts.productName || opts.brand) {
    parts.push(
      `Product: ${opts.productName ?? opts.brand ?? "Unknown"}${opts.brand && opts.productName && opts.brand !== opts.productName ? ` (${opts.brand})` : ""}.`,
    );
  }
  if (opts.result) {
    const fails = opts.result.requirements.filter((r) => r.status === "FAIL");
    if (fails.length > 0) {
      parts.push(
        `Violations recorded: ${fails
          .map((r) => `${r.title} (${r.ruleCited})`)
          .join("; ")}.`,
      );
    }
    const reviews = opts.result.requirements.filter(
      (r) => r.status === "REVIEW",
    );
    if (reviews.length > 0) {
      parts.push(
        `Declarations that could not be verified from the image: ${reviews
          .map((r) => r.title)
          .join(", ")}.`,
      );
    }
  }
  parts.push(`Evidence reference (scan ID): ${opts.scanId}.`);
  if (opts.location?.state || opts.location?.district) {
    parts.push(
      `Purchase location: ${[opts.location.district, opts.location.state]
        .filter(Boolean)
        .join(", ")}.`,
    );
  }
  if (opts.location?.lat != null && opts.location?.lng != null) {
    parts.push(
      `GPS: ${opts.location.lat.toFixed(5)}, ${opts.location.lng.toFixed(5)}.`,
    );
  }
  parts.push(
    `I request the Legal Metrology department to take appropriate action under the Legal Metrology Act, 2009.`,
  );
  return parts.join("\n\n");
}

/** The National Consumer Helpline portal URL (prefilled via query params). */
export function nchUrl(text: string): string {
  return `https://consumerhelpline.gov.in/cgi-bin/complaintregister.cgi?complaint=${encodeURIComponent(text)}`;
}

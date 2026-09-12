import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { FIELD_LABELS } from "@/lib/scan-client";
import {
  downloadDocx,
  printNotice,
  type NoticeDraft,
} from "@/lib/notice-doc";
import {
  ArrowLeft,
  FileDown,
  Loader2,
  Printer,
  Save,
  Gavel,
} from "lucide-react";

export default function Notice() {
  const { scanId = "" } = useParams();
  const navigate = useNavigate();
  const scan = useQuery(
    api.scans.getScanByScanId,
    scanId ? { scanId } : "skip",
  );
  const saveReport = useMutation(api.reports.saveReport);
  const [saved, setSaved] = useState(false);

  if (scan === undefined) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }
  if (scan === null) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">
          Scan {scanId} not found.
        </p>
        <Button variant="outline" asChild className="mt-3">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
        </Button>
      </Centered>
    );
  }

  const result = scan.result;
  const draft: NoticeDraft = {
    scanDocId: scan._id,
    noticeNo: `LM/ENF/${new Date().getFullYear()}/${String(
      (scan.timestamp % 100000) % 10000,
    ).padStart(4, "0")}/${scan.scanId}`,
    generatedAt: Date.now(),
    officerName: "Inspecting Officer",
    subject: `Notice — non-compliant packaged commodity declarations (Scan ${scan.scanId})`,
    addressee: scan.brand
      ? `M/s ${scan.brand}`
      : "The Manufacturer / Packer / Importer (per panel declaration)",
    body: [
      `Whereas an inspection of the packaged commodity bearing scan reference ${scan.scanId} was carried out under the Legal Metrology Act, 2009 and the Legal Metrology (Packaged Commodities) Rules, 2011;`,
      `And whereas the mandatory declarations under Rule 6(1) were found deficient — ${
        (result?.missingFields.length ?? 0) +
        (result?.formattingViolations.length ?? 0) +
        (result?.fontSizeViolations.length ?? 0)
      } violation(s) recorded with a compliance score of ${result?.complianceScore ?? 0}/100;`,
      "And whereas you are hereby directed to show cause, within 15 days of receipt of this notice, why action should not be initiated against you for the violations listed below;",
    ],
    violations: [
      ...(result?.missingFields ?? []).map((f) => ({
        clause: "Rule 6(1) — mandatory declaration absent",
        field: f,
        observed: "Not declared / not detectable on the panel",
        required: "Mandatory declaration per Rule 6(1)",
        penaltyNote: "Legal Metrology Act, 2009 §36",
      })),
      ...(result?.formattingViolations ?? []).map((v) => ({
        clause: v.ruleCited,
        field: v.field ?? undefined,
        observed: v.details,
        required: "Format per Rule 6",
        penaltyNote: "Legal Metrology Act, 2009 §36",
      })),
      ...(result?.fontSizeViolations ?? []).map((v) => ({
        clause: v.citation,
        field: v.field,
        observed: `Character height ${v.actualMm} mm`,
        required: `Minimum ${v.requiredMm} mm (Fourth Schedule slab)`,
        penaltyNote: "Legal Metrology Act, 2009 §36",
      })),
    ],
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

  async function handleSave() {
    try {
      await saveReport({
        scanDocId: draft.scanDocId as never,
        noticeNo: draft.noticeNo,
        officerName: draft.officerName,
        violationCount: draft.violations.length,
      });
      setSaved(true);
      toast.success("Report filed to the case repository.");
    } catch {
      toast.error("Could not file the report.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-20 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm">
            <Logo className="size-7" />
            <span className="font-semibold">Notice Generator</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => printNotice(draft)}>
              <Printer className="size-4" /> Print / PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadDocx(draft)}>
              <FileDown className="size-4" /> Editable document
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSave()}
              disabled={saved}
            >
              <Save className="size-4" /> {saved ? "Filed" : "File report"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <Card className="mb-5 no-print">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gavel className="size-4 text-primary" /> Automated Digital Notice
            </CardTitle>
            <CardDescription>
              Rendered from scan evidence with cited clauses, confidence data,
              and chain-of-custody hash. Export as PDF (print) or an editable
              Word document.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="spec-tag">
              {draft.violations.length} violation(s)
            </Badge>
            <Badge variant="outline" className="spec-tag">
              Score {draft.complianceScore}/100
            </Badge>
            <Badge variant="outline" className="spec-tag font-mono">
              ruleset {draft.ruleVersion}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          </CardContent>
        </Card>

        {/* Paper preview of the notice */}
        <Card className="receipt-paper mx-auto max-w-3xl">
          <CardContent className="space-y-5 p-6 sm:p-10">
            <div className="text-center">
              <p className="text-lg font-bold uppercase tracking-[0.2em]">
                Legal Metrology — Inspection Notice
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Under the Legal Metrology Act, 2009 and the Legal Metrology
                (Packaged Commodities) Rules, 2011
              </p>
              <div className="mx-auto mt-3 h-0.5 w-40 bg-foreground/70" style={{ borderTop: "3px double var(--foreground)" }} />
            </div>

            <div className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Notice No.</span>
              <span className="font-mono font-semibold">{draft.noticeNo}</span>
              <span className="text-muted-foreground">To</span>
              <span>{draft.addressee}</span>
              <span className="text-muted-foreground">Inspecting Officer</span>
              <span>{draft.officerName}</span>
              <span className="text-muted-foreground">Compliance score</span>
              <span className="font-mono">{draft.complianceScore}/100</span>
            </div>

            <div>
              <p className="text-sm font-semibold">SUBJECT</p>
              <p className="text-sm">{draft.subject}</p>
            </div>

            <ol className="list-decimal space-y-2 pl-6 text-sm">
              {draft.body.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>

            <div>
              <p className="mb-2 text-sm font-semibold">
                PARTICULARS OF VIOLATIONS
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-[10px] uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Clause cited</th>
                      <th className="px-3 py-2">Observed</th>
                      <th className="px-3 py-2">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.violations.map((v, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{v.clause}</span>
                          {v.field && (
                            <span className="block text-muted-foreground">
                              {FIELD_LABELS[v.field] ?? v.field}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{v.observed}</td>
                        <td className="px-3 py-2">{v.required}</td>
                      </tr>
                    ))}
                    {draft.violations.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          No violations recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="evidence-frame rounded-md p-4 text-xs">
              <p className="font-semibold">EVIDENCE</p>
              <p className="mt-1 break-all font-mono">
                SHA-256: {draft.evidence[0]?.imageHash}
              </p>
              <p className="text-muted-foreground">{draft.evidence[0]?.label}</p>
            </div>

            <div className="pt-6 text-right">
              <div className="ml-auto w-fit border-t border-foreground pt-2 text-sm">
                <p className="font-semibold">{draft.officerName}</p>
                <p className="text-xs text-muted-foreground">
                  Inspecting Officer, Legal Metrology
                </p>
                <p className="stamp mt-3 text-[10px] text-red-800">
                  ISSUED VIA METROSCAN
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {children}
    </div>
  );
}

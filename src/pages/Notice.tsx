// Notice page — renders the server-generated inspection notice draft for a
// scan, with print (PDF) and Word export. Violations come from the vision
// rule engine's mandatory FAIL results with their exact rule citations.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { FileDown, Gavel, Printer, Save } from "lucide-react";
import { downloadDocx, printNotice } from "@/lib/notice-doc";
import { requirementLabel } from "@/lib/scan-client";
import { StatusChip } from "@/components/report-view";

export default function Notice() {
  const { scanId } = useParams<{ scanId: string }>();

  // Resolve the human scanId to the internal document id first.
  const scan = useQuery(
    api.scans.getScanByScanId,
    scanId ? { scanId } : "skip",
  );
  const draft = useQuery(
    api.reports.buildNotice,
    scan ? { scanDocId: scan._id } : "skip",
  );
  const saveReport = useMutation(api.reports.saveReport);

  const [officerName, setOfficerName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  if (!scanId || (scan && !draft)) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }
  if (!scan) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading scan {scanId}…
          </CardContent>
        </Card>
      </main>
    );
  }

  const onSave = async () => {
    if (!draft) return;
    try {
      const id = await saveReport({
        scanDocId: draft.scanDocId as never,
        noticeNo: draft.noticeNo,
        officerName: officerName || draft.officerName,
        violationCount: draft.violations.length,
      });
      setSavedId(id);
      toast.success(`Report saved (${id}).`);
    } catch {
      toast.error("Could not save the report.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Gavel className="h-6 w-6 text-primary" />
            Inspection Notice
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafted from the evidence-anchored rule evaluation of scan{" "}
            <span className="font-mono">{scanId}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => draft && printNotice(draft)} disabled={!draft}>
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
          <Button variant="outline" onClick={() => draft && downloadDocx(draft)} disabled={!draft}>
            <FileDown className="mr-2 h-4 w-4" /> Word
          </Button>
          <Button onClick={() => void onSave()} disabled={!draft}>
            <Save className="mr-2 h-4 w-4" /> Save report
          </Button>
        </div>
      </header>

      {draft && (
        <>
          <Card className="mb-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rule evaluation summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="secondary">{draft.applicableCount} applicable</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                ✅ {draft.passCount} PASS
              </Badge>
              <Badge variant="destructive">❌ {draft.failCount} FAIL</Badge>
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                ⚠️ {draft.reviewCount} REVIEW
              </Badge>
              <span className="text-xs text-muted-foreground">
                ruleset {draft.ruleVersion}
              </span>
            </CardContent>
          </Card>

          <Card className="mb-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{draft.noticeNo}</CardTitle>
              <CardDescription>
                {new Date(draft.generatedAt).toLocaleString("en-IN")} · To:{" "}
                {draft.addressee}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="font-semibold">{draft.subject}</p>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                {draft.body.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>

              <div>
                <p className="mb-2 font-semibold">Particulars of violations</p>
                {draft.violations.length === 0 ? (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-4 text-center text-muted-foreground">
                    No mandatory violations recorded — a notice may not be warranted.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.violations.map((v, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-red-500/30 bg-red-500/5 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status="FAIL" />
                          <span className="text-sm font-semibold">
                            {requirementLabel(v.requirementId ?? "")}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {v.clause}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-xs">
                          <b>Observed:</b> {v.observed}
                        </p>
                        <p className="text-xs">
                          <b>Required:</b> {v.required}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{v.penaltyNote}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs">
                <p className="font-semibold">Evidence</p>
                <p className="mt-1">
                  {draft.evidence[0]?.label} · SHA-256{" "}
                  <span className="font-mono">{draft.evidence[0]?.imageHash.slice(0, 24)}…</span>
                </p>
                {draft.evidence[0]?.imageUrl && (
                  <a
                    className="mt-1 inline-block text-primary underline"
                    href={draft.evidence[0].imageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View stored capture
                  </a>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3 border-t border-border/50 pt-4">
                <div className="flex-1">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Officer name override (optional)
                  </p>
                  <Input
                    placeholder={draft.officerName}
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {savedId ? `Saved as ${savedId}` : "Not yet saved to the repository"}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

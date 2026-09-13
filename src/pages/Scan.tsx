// Consumer portal — Google Lens-style product scan.
// Upload / camera / URL / specimen → on-device barcode decode → vision action
// (AI whole-image understanding + GTIN lookup + rule engine) → full report.

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Camera,
  ClipboardPaste,
  FlaskConical,
  Link2,
  Loader2,
  RefreshCcw,
  ScanLine,
  Upload,
  WifiOff,
} from "lucide-react";
import { AnalysisReport } from "@/components/report-view";
import {
  acquireGeotag,
  decodeBarcode,
  enqueueOfflineScan,
  loadQueue,
  prepareCapture,
  queueCount,
  syncOfflineQueue,
} from "@/lib/scan-client";
import { LABEL_SAMPLES } from "@/lib/label-samples";
import { makeSyntheticLabel } from "@/lib/synthetic-label";
import { EXAMPLE_CASES } from "@/lib/specimens";
import { grievanceText, nchUrl } from "@/lib/notice-doc";
import type { PreparedCapture } from "@/lib/scan-client";

const STAGES = [
  "Analyzing package image (Lens-style visual understanding)…",
  "Detecting barcode & verifying checksum…",
  "Looking up GTIN in the product database…",
  "Classifying product & selecting applicable rules…",
  "Evaluating Legal Metrology requirements…",
] as const;

export default function Scan() {
  const analyzeAndRecord = useAction(api.vision.analyzeAndRecord);

  const [capture, setCapture] = useState<PreparedCapture | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [scanId, setScanId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ dataUrl: string; w: number; h: number } | null>(
    null,
  );
  const [queuedCount, setQueuedCount] = useState(queueCount());

  const scan = useQuery(
    api.scans.getScanByScanId,
    scanId ? { scanId } : "skip",
  );

  const runVision = async (prep: PreparedCapture, specimenId?: string) => {
    setBusy(true);
    setStage(0);
    setScanId(null);
    const stageTimer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1800);
    try {
      const barcode = await decodeBarcode(prep.dataUrl);
      const geo = await acquireGeotag();
      const spec = specimenId ? EXAMPLE_CASES.find((c) => c.id === specimenId) : undefined;
      const id = await analyzeAndRecord({
        imageDataUrl: prep.dataUrl,
        imageHash: prep.imageHash,
        imageWidth: prep.width,
        imageHeight: prep.height,
        portalRole: "consumer",
        source: prep.source,
        geolocation: Object.keys(geo).length ? geo : undefined,
        barcodeOverride: barcode ?? undefined,
        ...(spec
          ? {
              specimenAnalysis: spec.analysis,
              specimenDb: spec.database,
              specimenImage: prep.dataUrl,
              calibration: spec.calibration,
            }
          : {}),
      });
      setPending({ dataUrl: prep.dataUrl, w: prep.width, h: prep.height });
      setScanId(id);
      toast.success("Analysis complete");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Analysis failed — please try again.",
      );
    } finally {
      clearInterval(stageTimer);
      setBusy(false);
    }
  };

  const onFile = async (file: File | Blob, source: PreparedCapture["source"]) => {
    try {
      const prep = await prepareCapture(file, source);
      setCapture(prep);
      await runVision(prep);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the image.");
    }
  };

  const onSpecimen = async (id: string) => {
    try {
      const dataUrl = makeSyntheticLabel(id);
      const prep = await prepareCapture(dataUrl, "upload");
      setCapture(prep);
      await runVision(prep, id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not render the specimen.");
    }
  };

  const onUrl = async () => {
    if (!urlInput.trim()) return;
    try {
      const prep = await prepareCapture(urlInput.trim(), "url");
      setCapture(prep);
      await runVision(prep);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load that URL.");
    }
  };

  const onSync = async () => {
    const { synced, failed } = await syncOfflineQueue((args) => analyzeAndRecord(args));
    setQueuedCount(queueCount());
    toast.info(`Synced ${synced} offline scan(s)${failed ? `, ${failed} failed` : ""}.`);
  };

  const evidenceUrl = pending?.dataUrl ?? capture?.dataUrl;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ScanLine className="h-6 w-6 text-primary" />
            Scan a package
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lens-style AI reads the whole label — brand, declarations, barcode — and
            checks it against the Legal Metrology (PC) Rules, 2011.
          </p>
        </div>
        {queuedCount > 0 && (
          <Button variant="outline" onClick={onSync}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Sync {queuedCount} offline scan{queuedCount > 1 ? "s" : ""}
          </Button>
        )}
      </header>

      <Tabs defaultValue="capture" className="space-y-5">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="capture">Capture</TabsTrigger>
          <TabsTrigger value="specimens">Specimens</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>

        <TabsContent value="capture" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4 text-primary" /> Upload photo
                </CardTitle>
                <CardDescription>Clear, full-label photos work best.</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-sm font-medium hover:bg-muted/50">
                  <Upload className="mr-2 h-4 w-4" /> Choose image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f, "upload");
                    }}
                  />
                </label>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-4 w-4 text-primary" /> Camera
                </CardTitle>
                <CardDescription>Point at the label and capture.</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-sm font-medium hover:bg-muted/50">
                  <Camera className="mr-2 h-4 w-4" /> Open camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f, "camera");
                    }}
                  />
                </label>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4 text-primary" /> From URL
                </CardTitle>
                <CardDescription>Paste a public image link.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="https://…"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button className="w-full" onClick={() => void onUrl()} disabled={busy}>
                  <ClipboardPaste className="mr-2 h-4 w-4" /> Analyze URL
                </Button>
              </CardContent>
            </Card>
          </div>

          {busy && (
            <Card>
              <CardContent className="space-y-3 py-5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {STAGES[stage]}
                </p>
                <Progress value={((stage + 1) / STAGES.length) * 100} />
                <p className="text-xs text-muted-foreground">
                  Nothing is invented — only what the model can actually read on the
                  package is reported. Uncertain areas come back as REVIEW.
                </p>
              </CardContent>
            </Card>
          )}

          {!navigator.onLine && (
            <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              <WifiOff className="h-4 w-4" /> You appear to be offline — scans are
              queued locally and sync automatically when you press Sync.
            </p>
          )}
        </TabsContent>

        <TabsContent value="specimens">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-primary" /> Deterministic
                specimen labels
              </CardTitle>
              <CardDescription>
                Rendered panels with pinned ground truth — useful to see exactly how
                PASS / FAIL / REVIEW verdicts are produced.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LABEL_SAMPLES.map((s) => (
                <button
                  key={s.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => void onSpecimen(s.id)}
                  disabled={busy}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span>
                    <span className="block text-sm font-semibold">{s.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {s.verdictHint}
                    </span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          {busy && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            </div>
          )}

          {!busy && !scan && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No report yet — capture an image or run a specimen, then open this
                  tab.
                </p>
              </CardContent>
            </Card>
          )}

          {!busy && scan && (
            <>
              <AnalysisReport
                doc={scan}
                imageUrl={scan.imageUrl ?? evidenceUrl}
                showDebug
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Raise a complaint</CardTitle>
                  <CardDescription>
                    Pre-filled grievance text for the National Consumer Helpline.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <a
                      href={nchUrl(
                        grievanceText({
                          scanId: scan.scanId,
                          productName: scan.productName ?? undefined,
                          brand: scan.brand ?? undefined,
                          result: scan.result,
                          location: scan.geolocation,
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open National Consumer Helpline with complaint text
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

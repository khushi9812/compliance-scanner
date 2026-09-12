import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Link } from "react-router";
import { motion } from "framer-motion";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/use-auth";
import {
  prepareCapture,
  acquireGeotag,
  FIELD_LABELS,
  missingFieldSentence,
} from "@/lib/scan-client";
import { grievanceText, nchUrl } from "@/lib/notice-doc";
import { LABEL_SAMPLES } from "@/lib/label-samples";
import { makeSyntheticLabel } from "@/lib/synthetic-label";
import {
  ScanLine,
  Upload,
  Camera,
  Link2,
  Gavel,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  FlaskConical,
  Loader2,
  Scale,
  MapPin,
  BadgeCheck,
  AlertOctagon,
  FileText,
} from "lucide-react";

interface ConsumerResult {
  scanId: string;
  geotagged: boolean;
  geolocation?: { lat?: number; lng?: number };
  evidenceDataUrl?: string;
  imageHash: string;
}

export default function Scan() {
  const { isAuthenticated } = useAuth();
  const processScan = useAction(api.scans.processScan);
  const recent = useQuery(api.scans.listScans, {
    portalRole: "consumer",
    limit: 6,
  });

  const [tab, setTab] = useState<"upload" | "camera" | "url">("upload");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ConsumerResult | null>(null);
  const [grievanceOpen, setGrievanceOpen] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [grievanceSent, setGrievanceSent] = useState(false);

  // Attach the live stream once the <video> element is mounted.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
    if (!cameraOn && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  async function runScan(
    prepared: Awaited<ReturnType<typeof prepareCapture>>,
    example?: {
      layoutIndex: number;
      sizeOverride?: { value: number; unit: string };
    },
  ) {
    setBusy("scanning");
    try {
      const geo = await acquireGeotag();
      const scanId = await processScan({
        imageHash: prepared.imageHash,
        imageWidth: prepared.width,
        imageHeight: prepared.height,
        portalRole: "consumer",
        source: prepared.source,
        geolocation:
          geo.lat != null ? { lat: geo.lat, lng: geo.lng } : undefined,
        ...(example
          ? {
              layoutIndex: example.layoutIndex,
              packageSizeOverride: example.sizeOverride,
              state: "Karnataka",
              district: "Bengaluru Urban",
            }
          : {}),
      });
      setResult({
        scanId,
        geotagged: geo.lat != null,
        geolocation: geo.lat != null ? { lat: geo.lat, lng: geo.lng } : undefined,
        evidenceDataUrl: prepared.dataUrl,
        imageHash: prepared.imageHash,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Scan failed. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(f: File) {
    setBusy("preparing");
    try {
      const prepared = await prepareCapture(f, "upload");
      await runScan(prepared);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read image.");
      setBusy(null);
    }
  }

  async function handleUrl() {
    const url = urlInput.current?.value.trim();
    if (!url) {
      toast.error("Paste an image URL first.");
      return;
    }
    setBusy("preparing");
    try {
      const prepared = await prepareCapture(url, "url");
      await runScan(prepared);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Could not load image from that URL (CORS or invalid).",
      );
      setBusy(null);
    }
  }

  async function startCamera() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setCameraOn(true);
    } catch {
      toast.error("Camera unavailable — use upload instead.");
    }
  }

  function stopCamera() {
    setCameraOn(false);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !cameraOn) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.92),
    );
    if (!blob) return;
    stopCamera();
    setBusy("preparing");
    const prepared = await prepareCapture(blob, "camera");
    await runScan(prepared);
  }

  async function trySample(sampleId: string) {
    const s = LABEL_SAMPLES.find((x) => x.id === sampleId);
    if (!s) return;
    setBusy("preparing");
    try {
      const blob = await (await fetch(makeSyntheticLabel(sampleId))).blob();
      const prepared = await prepareCapture(blob, "upload");
      await runScan(prepared, {
        layoutIndex: s.layoutIndex,
        sizeOverride: s.sizeOverride,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Specimen failed.");
      setBusy(null);
    }
  }

  // Authoritative verdict comes from the persisted scan document.
  const full = useQuery(
    api.scans.getScanByScanId,
    result ? { scanId: result.scanId } : "skip",
  );

  const displayed = useMemo(() => {
    if (!full || !result) return null;
    return {
      ...result,
      isCompliant: full.result?.isCompliant ?? false,
      complianceScore: full.result?.complianceScore ?? 0,
      fields: (full.extraction?.fields ?? {}) as Record<
        string,
        { value: string; confidence: number } | undefined
      >,
      missingFields: full.result?.missingFields ?? [],
      formattingViolations: full.result?.formattingViolations ?? [],
    };
  }, [full, result]);

  const grievanceBody = useMemo(() => {
    if (!displayed) return "";
    return grievanceText({
      scanId: displayed.scanId,
      productName: displayed.fields.manufacturer?.value,
      result: {
        missingFields: displayed.missingFields,
        formattingViolations: displayed.formattingViolations,
        complianceScore: displayed.complianceScore,
      },
      location: displayed.geolocation,
    });
  }, [displayed]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header strip */}
      <header className="sticky top-0 z-20 border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="size-7" />
            <span className="text-sm font-semibold tracking-tight">
              MetroScan
            </span>
            <Badge
              variant="outline"
              className="spec-tag ml-1 hidden sm:inline-flex"
            >
              Consumer Portal
            </Badge>
          </Link>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard">
                  <Scale className="size-4" /> Officer Dashboard
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/auth?returnTo=%2Fdashboard">
                  <Gavel className="size-4" /> Officer Login
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 max-w-2xl">
          <div className="spec-tag mb-3 inline-flex">
            <ScanLine className="size-3.5" /> Rule 6 · Fourth Schedule
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Scan a label.
            <br />
            <span className="marker-yellow">Know your rights.</span>
          </h1>
          <p className="mt-3 text-muted-foreground">
            Photograph any packaged commodity — MetroScan reads the mandatory
            declarations, checks them against the Legal Metrology (Packaged
            Commodities) Rules 2011, and tells you in plain language what's
            missing.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Capture column */}
          <Card className="evidence-frame relative overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScanLine className="size-5 text-primary" /> Capture the label
              </CardTitle>
              <CardDescription>
                Upload, live camera, e-commerce URL — or try a specimen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="upload">
                    <Upload className="size-4" /> Upload
                  </TabsTrigger>
                  <TabsTrigger value="camera">
                    <Camera className="size-4" /> Camera
                  </TabsTrigger>
                  <TabsTrigger value="url">
                    <Link2 className="size-4" /> URL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="mt-4">
                  <button
                    type="button"
                    className="draft-grid flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy != null}
                  >
                    <Upload className="size-6" />
                    Tap to choose a photo of the label
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </TabsContent>

                <TabsContent value="camera" className="mt-4">
                  {!cameraOn ? (
                    <Button
                      className="w-full"
                      onClick={() => void startCamera()}
                    >
                      <Camera className="size-4" /> Open camera
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <video
                        ref={videoRef}
                        className="w-full rounded-md border bg-black"
                        playsInline
                        muted
                      />
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => void captureFrame()}
                        >
                          <ScanLine className="size-4" /> Capture &amp; scan
                        </Button>
                        <Button variant="outline" onClick={stopCamera}>
                          Stop
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="url" className="mt-4">
                  <div className="flex gap-2">
                    <Input
                      ref={urlInput}
                      placeholder="https://shop.example.com/product.jpg"
                    />
                    <Button
                      onClick={() => void handleUrl()}
                      disabled={busy != null}
                    >
                      Fetch
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    E-commerce image URLs are fetched directly; cross-origin
                    images that block reading will be rejected.
                  </p>
                </TabsContent>
              </Tabs>

              <div className="mt-5 border-t pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <FlaskConical className="size-3.5" /> OR SCAN A SPECIMEN LABEL
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {LABEL_SAMPLES.map((s) => (
                    <button
                      key={s.id}
                      className="rounded-md border bg-card px-3 py-2 text-left text-xs transition hover:border-primary hover:bg-accent"
                      onClick={() => void trySample(s.id)}
                      disabled={busy != null}
                      title={s.verdictHint}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{s.emoji}</span>
                        <span className="font-medium">{s.name}</span>
                      </span>
                      <span className="mt-1 block text-muted-foreground">
                        {s.verdictHint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Result column */}
          <div>
            {busy ? (
              <Card className="h-full">
                <CardContent className="flex h-full min-h-80 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm">
                    {busy === "preparing"
                      ? "Hashing & normalizing capture…"
                      : "Running OCR → calibration → Rule 6 validation…"}
                  </p>
                </CardContent>
              </Card>
            ) : displayed ? (
              <ResultCard
                result={displayed}
                onGrievance={() => setGrievanceOpen(true)}
                onReset={() => setResult(null)}
              />
            ) : (
              <Card className="receipt-paper h-full">
                <CardContent className="flex h-full min-h-80 flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
                  <ScanLine className="size-10 opacity-40" />
                  <p className="max-w-60 text-sm">
                    No scan yet. Capture a label to see its compliance verdict.
                  </p>
                  {recent && recent.length > 0 && (
                    <div className="mt-2 w-full max-w-72 text-left">
                      <p className="spec-tag mb-2 inline-flex">
                        Recent community scans
                      </p>
                      <div className="space-y-1">
                        {recent.slice(0, 3).map((r) => (
                          <div
                            key={r._id}
                            className="flex items-center justify-between rounded border bg-card px-2 py-1 text-xs"
                          >
                            <span className="truncate font-mono">
                              {r.scanId}
                            </span>
                            {r.isCompliant === true ? (
                              <BadgeCheck className="size-4 text-emerald-700" />
                            ) : (
                              <AlertOctagon className="size-4 text-red-700" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Grievance dialog */}
      <Dialog
        open={grievanceOpen}
        onOpenChange={(o) => {
          setGrievanceOpen(o);
          if (!o) setGrievanceSent(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File a consumer grievance</DialogTitle>
            <DialogDescription>
              Pre-filled with this scan's evidence. Review, then file on the
              National Consumer Helpline.
            </DialogDescription>
          </DialogHeader>
          {displayed && (
            <>
              <textarea
                className="ledger-grid min-h-48 w-full rounded-md border bg-card p-3 font-mono text-xs"
                readOnly
                value={grievanceBody}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="size-3.5" />
                {displayed.geotagged
                  ? "Geotag attached"
                  : "No GPS permission — location omitted"}
                <FileText className="ml-2 size-3.5" />
                Evidence hash {displayed.imageHash.slice(0, 12)}…
              </div>
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(grievanceBody);
                toast.success("Complaint draft copied.");
              }}
            >
              <Copy className="size-4" /> Copy draft
            </Button>
            <Button
              onClick={() => {
                setGrievanceSent(true);
                window.open(nchUrl(grievanceBody), "_blank");
              }}
            >
              <ExternalLink className="size-4" /> File on National Consumer
              Helpline
            </Button>
          </DialogFooter>
          {grievanceSent && (
            <p className="text-xs text-emerald-700">
              Draft opened on the helpline portal — attach your label photo
              there to complete the complaint.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultCard({
  result,
  onGrievance,
  onReset,
}: {
  result: {
    isCompliant: boolean;
    complianceScore: number;
    scanId: string;
    fields: Record<string, { value: string; confidence: number } | undefined>;
    missingFields: string[];
    formattingViolations: Array<{
      ruleCited: string;
      details: string;
      field?: string | null;
    }>;
    evidenceDataUrl?: string;
  };
  onGrievance: () => void;
  onReset: () => void;
}) {
  const ok = result.isCompliant;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className={ok ? "border-emerald-700/40" : "border-red-700/40"}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                {ok ? (
                  <CheckCircle2 className="size-5 text-emerald-700" />
                ) : (
                  <AlertTriangle className="size-5 text-red-700" />
                )}
                {ok ? "Compliant" : "Flagged"}
              </CardTitle>
              <CardDescription>
                Score {result.complianceScore}/100 · {result.scanId}
              </CardDescription>
            </div>
            <div className={`stamp text-xs ${ok ? "text-emerald-700" : "text-red-700"}`}>
              {ok ? "PASS" : "FAIL"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const entry = result.fields[key];
              const missing = result.missingFields.includes(key);
              const violation = result.formattingViolations.find(
                (v) => v.field === key,
              );
              return (
                <div
                  key={key}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    missing
                      ? "border-red-700/40 bg-red-700/5"
                      : violation
                        ? "border-amber-600/50 bg-amber-600/5"
                        : "border-emerald-700/30 bg-emerald-700/5"
                  }`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  {missing ? (
                    <p className="mt-0.5 text-xs text-red-700">
                      Not found on label
                    </p>
                  ) : violation ? (
                    <p className="mt-0.5 text-xs text-amber-700">
                      {violation.details}
                    </p>
                  ) : (
                    <p className="mt-0.5 font-medium">
                      {entry?.value ?? "—"}
                      {entry?.confidence != null && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {(entry.confidence * 100).toFixed(0)}% conf.
                        </span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {result.missingFields.length > 0 && (
            <p className="marker-red text-sm">
              {missingFieldSentence(result.missingFields)}
            </p>
          )}

          {result.evidenceDataUrl && (
            <div className="evidence-frame rounded-md p-2">
              <img
                src={result.evidenceDataUrl}
                alt="Captured label"
                className="max-h-40 w-auto rounded"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!ok && (
              <Button onClick={onGrievance}>
                <Gavel className="size-4" /> File a grievance
              </Button>
            )}
            <Button variant="outline" onClick={onReset}>
              <ScanLine className="size-4" /> Scan another
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

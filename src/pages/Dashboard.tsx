// Officer portal — enforcement dashboard for the vision pipeline.
// Analytics overview · new inspection (with calibration + offline queue) ·
// repository of scans with full reports and notice generation.

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart3,
  Camera,
  ClipboardList,
  FileText,
  Gavel,
  Loader2,
  RefreshCcw,
  ScanLine,
  Upload,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AnalysisReport, StatusChip } from "@/components/report-view";
import {
  acquireGeotag,
  decodeBarcode,
  enqueueOfflineScan,
  loadQueue,
  prepareCapture,
  queueCount,
  syncOfflineQueue,
  type PreparedCapture,
} from "@/lib/scan-client";
import { EXAMPLE_CASES } from "@/lib/specimens";
import { makeSyntheticLabel } from "@/lib/synthetic-label";

const DECISION_COLORS: Record<string, string> = {
  PASS: "#10b981",
  FAIL: "#ef4444",
  REVIEW: "#f59e0b",
};

function AnalyticsOverview() {
  const analytics = useQuery(api.scans.analytics, {});

  if (!analytics) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Total scans", value: analytics.total },
    { label: "Compliant (PASS)", value: analytics.pass },
    { label: "Non-compliant (FAIL)", value: analytics.fail },
    { label: "Needs review", value: analytics.review },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="py-4">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-primary" /> Verdicts — last 14 days
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip />
                <Bar dataKey="pass" stackId="a" fill={DECISION_COLORS.PASS} radius={[0, 0, 2, 2]} />
                <Bar dataKey="review" stackId="a" fill={DECISION_COLORS.REVIEW} />
                <Bar dataKey="fail" stackId="a" fill={DECISION_COLORS.FAIL} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gavel className="h-4 w-4 text-primary" /> Most frequent violations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analytics.violationTypes.length === 0 && (
              <p className="text-sm text-muted-foreground">No violations recorded yet.</p>
            )}
            {analytics.violationTypes.map((v) => (
              <div
                key={v.category}
                className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 text-sm last:border-0"
              >
                <span className="min-w-0 truncate">{v.category}</span>
                <Badge variant="destructive">{v.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Repeat offender brands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analytics.repeatOffenders.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing flagged yet.</p>
            )}
            {analytics.repeatOffenders.map((r) => (
              <div key={r.brand} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{r.brand}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.fail} FAIL / {r.total} scans
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Violations by state</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analytics.byState.length === 0 && (
              <p className="text-sm text-muted-foreground">No geotagged scans yet.</p>
            )}
            {analytics.byState.map((s) => (
              <div key={s.state} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">
                  {s.state}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({s.districts} district{s.districts === 1 ? "" : "s"})
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.fail} FAIL / {s.total} scans
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NewInspection() {
  const analyzeAndRecord = useAction(api.vision.analyzeAndRecord);
  const [busy, setBusy] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  const [captured, setCaptured] = useState<PreparedCapture | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [realHeightMm, setRealHeightMm] = useState("");
  const [queued, setQueued] = useState(queueCount());

  const detail = useQuery(
    api.scans.getScanByScanId,
    scanId ? { scanId } : "skip",
  );

  const runVision = async (prep: PreparedCapture, specimenId?: string) => {
    setBusy(true);
    setScanId(null);
    try {
      const barcode = await decodeBarcode(prep.dataUrl);
      const geo = await acquireGeotag();
      const spec = specimenId ? EXAMPLE_CASES.find((c) => c.id === specimenId) : undefined;
      const calibration =
        realHeightMm && prep.height
          ? { realHeightMm: Number(realHeightMm), boundingBoxPixelHeight: prep.height }
          : spec?.calibration;
      const id = await analyzeAndRecord({
        imageDataUrl: prep.dataUrl,
        imageHash: prep.imageHash,
        imageWidth: prep.width,
        imageHeight: prep.height,
        portalRole: "officer",
        source: prep.source,
        geolocation: Object.keys(geo).length ? geo : undefined,
        calibration,
        barcodeOverride: barcode ?? undefined,
        ...(spec
          ? {
              specimenAnalysis: spec.analysis,
              specimenDb: spec.database,
              specimenImage: prep.dataUrl,
            }
          : {}),
      });
      setPending({ dataUrl: prep.dataUrl, w: prep.width, h: prep.height });
      setCaptured(prep);
      setScanId(id);
      toast.success("Inspection recorded");
    } catch (e) {
      // Offline field mode: queue for sync.
      if (!navigator.onLine || (e instanceof Error && /fetch|network/i.test(e.message))) {
        enqueueOfflineScan({
          queuedAt: Date.now(),
          payload: {
            imageDataUrl: prep.dataUrl,
            imageHash: prep.imageHash,
            imageWidth: prep.width,
            imageHeight: prep.height,
            portalRole: "officer",
            source: "offline_sync",
            calibration:
              realHeightMm && prep.height
                ? { realHeightMm: Number(realHeightMm), boundingBoxPixelHeight: prep.height }
                : undefined,
            barcodeOverride: (await decodeBarcode(prep.dataUrl)) ?? undefined,
          },
        });
        setQueued(queueCount());
        toast.info("Offline — scan queued for sync.");
      } else {
        toast.error(e instanceof Error ? e.message : "Analysis failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    const { synced, failed } = await syncOfflineQueue((args) => analyzeAndRecord(args));
    setQueued(queueCount());
    toast.info(`Synced ${synced} scan(s)${failed ? `, ${failed} failed` : ""}.`);
  };

  const evidenceUrl = pending?.dataUrl ?? captured?.dataUrl;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary" /> New inspection
          </CardTitle>
          <CardDescription>
            Lens-style vision analysis + GTIN lookup + rule engine. Optionally
            calibrate with the real package height to measure Fourth-Schedule
            character heights.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm font-medium hover:bg-muted/50">
            <Upload className="h-5 w-5 text-primary" /> Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void prepareCapture(f, "upload").then((p) => runVision(p));
              }}
            />
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm font-medium hover:bg-muted/50">
            <Camera className="h-5 w-5 text-primary" /> Capture with camera
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void prepareCapture(f, "camera").then((p) => runVision(p));
              }}
            />
          </label>
          <div className="flex flex-col justify-center gap-2">
            <Input
              placeholder="Real package height (mm) — optional calibration"
              inputMode="decimal"
              value={realHeightMm}
              onChange={(e) => setRealHeightMm(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="…or paste image URL"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <Button
                disabled={busy || !urlInput.trim()}
                onClick={() => {
                  void prepareCapture(urlInput.trim(), "url")
                    .then((p) => runVision(p))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "URL failed."));
                }}
              >
                Go
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {busy && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Running vision analysis, barcode lookup and rule evaluation…
          </CardContent>
        </Card>
      )}

      {queued > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <WifiOff className="h-4 w-4" /> {queued} offline scan{queued > 1 ? "s" : ""} queued
          </p>
          <Button size="sm" variant="outline" onClick={() => void onSync()}>
            <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Sync now
          </Button>
        </div>
      )}

      {!busy && detail && (
        <AnalysisReport doc={detail} imageUrl={detail.imageUrl ?? evidenceUrl} showDebug />
      )}
    </div>
  );
}

function Repository() {
  const navigate = useNavigate();
  const [decision, setDecision] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const scans = useQuery(api.scans.listScans, {
    portalRole: undefined,
    decision: decision as "all" | "PASS" | "FAIL" | "REVIEW",
    category: category,
    search: search || undefined,
    limit: 200,
  });

  const categories = useMemo(() => {
    const set = new Set((scans ?? []).map((s) => s.category));
    return ["all", ...[...set].sort()];
  }, [scans]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={decision} onValueChange={setDecision}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Verdict" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verdicts</SelectItem>
            <SelectItem value="PASS">✅ PASS</SelectItem>
            <SelectItem value="FAIL">❌ FAIL</SelectItem>
            <SelectItem value="REVIEW">⚠️ REVIEW</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          placeholder="Search brand / product / scan ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!scans && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {scans && scans.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No scans match these filters yet — run an inspection to populate the
            repository.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {scans?.map((s) => (
          <Card
            key={s._id}
            className="cursor-pointer py-3 transition-shadow hover:shadow-md"
            onClick={() => navigate(`/notice/${s.scanId}`)}
          >
            <CardContent className="flex flex-wrap items-center gap-3 px-4">
              <StatusChip status={s.decision} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.brand ?? "⚠️ Unidentified brand"} — {s.productName ?? "unidentified product"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.scanId} · {s.category} · {s.source} ·{" "}
                  {new Date(s.timestamp).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {s.state ? ` · ${s.district ?? ""}, ${s.state}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <span className="text-emerald-700 dark:text-emerald-300">✅ {s.passCount}</span>
                <span className="text-red-700 dark:text-red-300">❌ {s.failCount}</span>
                <span className="text-amber-700 dark:text-amber-300">⚠️ {s.reviewCount}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/notice/${s.scanId}`);
                  }}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> Notice
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const seed = useMutation(api.scans.seedExampleCases);
  const [tab, setTab] = useState("overview");

  const onSeed = async () => {
    try {
      const res = await seed({});
      toast.info(
        "seeded" in res && res.seeded
          ? `Seeded ${res.count} specimen scans.`
          : "Repository already has scans — nothing seeded.",
      );
      setTab("repository");
    } catch {
      toast.error("Seeding failed.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-6 w-6 text-primary" />
            Enforcement Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vision-based Legal Metrology inspections — evidence-anchored PASS / FAIL /
            REVIEW verdicts with rule citations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void onSeed()}>
          <Gavel className="mr-2 h-4 w-4" /> Load specimen cases
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inspect">New inspection</TabsTrigger>
          <TabsTrigger value="repository">Repository</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <AnalyticsOverview />
        </TabsContent>
        <TabsContent value="inspect">
          <NewInspection />
        </TabsContent>
        <TabsContent value="repository">
          <Repository />
        </TabsContent>
      </Tabs>
    </main>
  );
}

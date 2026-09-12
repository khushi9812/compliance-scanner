import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
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
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/use-auth";
import {
  prepareCapture,
  acquireGeotag,
  queueCount,
  loadQueue,
  enqueueOfflineScan,
  syncOfflineQueue,
  FIELD_LABELS,
} from "@/lib/scan-client";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  LogOut,
  ScanLine,
  Upload,
  Ruler,
  RefreshCw,
  WifiOff,
  Database,
  BarChart3,
  FileWarning,
  FileText,
  Search,
  MapPin,
  ShieldCheck,
  Gavel,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

type Region = {
  regionId: number;
  rawText: string;
  confidence: number;
  boundingBox: { x: number; y: number; w: number; h: number };
  classification: string;
  match?: { field: string; value: string };
};

interface Prepared {
  dataUrl: string;
  width: number;
  height: number;
  imageHash: string;
  source: "upload" | "camera" | "url" | "offline_sync";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const processScan = useAction(api.scans.processScan);
  const saveReport = useMutation(api.reports.saveReport);
  const analytics = useQuery(api.scans.analytics);
  const reports = useQuery(api.reports.listReports, { limit: 20 });

  const [tab, setTab] = useState("scanner");
  const [offlineMode, setOfflineMode] = useState(false);
  const [pending, setPending] = useState(queueCount());
  const [syncing, setSyncing] = useState(false);

  // Scanner state
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanId, setLastScanId] = useState<string | null>(null);
  const [realHeightMm, setRealHeightMm] = useState(220);
  const [bboxPixelHeight, setBboxPixelHeight] = useState(1200);
  const [calibrateOn, setCalibrateOn] = useState(true);
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState("g");
  const fileInput = useRef<HTMLInputElement>(null);

  // Repository state
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      status: statusFilter as "all" | "compliant" | "flagged",
      portalRole:
        roleFilter === "consumer" || roleFilter === "officer"
          ? (roleFilter as "consumer" | "officer")
          : undefined,
      search: search || undefined,
      limit: 100,
    }),
    [statusFilter, roleFilter, search],
  );
  const scans = useQuery(api.scans.listScans, filters);
  const detail = useQuery(
    api.scans.getScanByScanId,
    detailId ? { scanId: detailId } : "skip",
  );

  async function pickFile(f: File) {
    try {
      const p = await prepareCapture(f, "upload");
      setPrepared(p);
      setLastScanId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read image.");
    }
  }

  async function runInspection() {
    if (!prepared) {
      toast.error("Choose a label capture first.");
      return;
    }
    const geo = await acquireGeotag();
    const payload = {
      imageHash: prepared.imageHash,
      imageWidth: prepared.width,
      imageHeight: prepared.height,
      portalRole: "officer" as const,
      source: prepared.source,
      geolocation: geo.lat != null ? { lat: geo.lat, lng: geo.lng, state: undefined, district: undefined } : undefined,
      calibration: calibrateOn
        ? { realHeightMm, boundingBoxPixelHeight: bboxPixelHeight }
        : undefined,
      packageSizeOverride:
        sizeValue && !Number.isNaN(parseFloat(sizeValue))
          ? { value: parseFloat(sizeValue), unit: sizeUnit }
          : undefined,
    };

    if (offlineMode) {
      enqueueOfflineScan({ queuedAt: Date.now(), payload, localPreview: prepared.dataUrl });
      setPending(queueCount());
      setLastScanId("QUEUED-OFFLINE");
      toast.info("Queued offline — evidence stored with hash.", {
        description: payload.imageHash.slice(0, 24) + "…",
      });
      return;
    }

    setScanning(true);
    try {
      const scanId = await processScan(payload);
      setLastScanId(scanId);
      toast.success(`Inspection ${scanId} recorded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inspection failed.");
    } finally {
      setScanning(false);
    }
  }

  async function doSync() {
    setSyncing(true);
    try {
      const res = await syncOfflineQueue(async (args) => {
        return await processScan(args);
      });
      setPending(queueCount());
      if (res.synced > 0) toast.success(`Synced ${res.synced} queued inspection(s).`);
      if (res.failed > 0) toast.warning(`${res.failed} failed — kept in queue.`);
      if (res.synced === 0 && res.failed === 0) toast.info("Queue empty.");
    } finally {
      setSyncing(false);
    }
  }

  const queued = loadQueue();

  const lastScan = useQuery(
    api.scans.getScanByScanId,
    lastScanId && lastScanId !== "QUEUED-OFFLINE" ? { scanId: lastScanId } : "skip",
  );

  const regions: Region[] = (lastScan?.regions ?? []) as Region[];
  const result = lastScan?.result;

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo className="size-8" />
            <div>
              <p className="text-sm font-semibold leading-tight tracking-tight">
                MetroScan — Enforcement Portal
              </p>
              <p className="text-xs text-muted-foreground">
                {user?.email ?? user?.name ?? "Field officer"} · Legal Metrology
                (PC) Rules 2011
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-1 flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
              <WifiOff
                className={`size-4 ${offlineMode ? "text-amber-600" : "text-muted-foreground"}`}
              />
              <Label className="text-xs" htmlFor="offline-switch">
                Field mode
              </Label>
              <Switch
                id="offline-switch"
                checked={offlineMode}
                onCheckedChange={setOfflineMode}
              />
              {pending > 0 && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {pending} queued
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void doSync()}
              disabled={syncing || pending === 0}
            >
              {syncing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sync queue
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleSignOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5 h-11 w-full justify-start gap-1 rounded-md border bg-card p-1 sm:w-fit">
            <TabsTrigger value="scanner" className="gap-2 px-4">
              <ScanLine className="size-4" /> Inspection Scanner
            </TabsTrigger>
            <TabsTrigger value="repository" className="gap-2 px-4">
              <Database className="size-4" /> Case Repository
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 px-4">
              <BarChart3 className="size-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------ SCANNER ------------------------------ */}
          <TabsContent value="scanner">
            <div className="grid gap-5 lg:grid-cols-5">
              {/* Capture + calibration */}
              <div className="space-y-5 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Upload className="size-4 text-primary" /> Field capture
                    </CardTitle>
                    <CardDescription>
                      Offline-first: captures are hashed (SHA-256) and can be
                      queued when field mode is on.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <button
                      type="button"
                      className="draft-grid flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload className="size-6" />
                      Choose label photo / evidence capture
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void pickFile(f);
                        e.currentTarget.value = "";
                      }}
                    />
                    {prepared && (
                      <div className="evidence-frame rounded-md p-2">
                        <img
                          src={prepared.dataUrl}
                          alt="capture"
                          className="max-h-48 w-full rounded object-contain"
                        />
                        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                          SHA-256 {prepared.imageHash.slice(0, 32)}…
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Ruler className="size-4 text-primary" /> Physical
                      calibration
                    </CardTitle>
                    <CardDescription>
                      Fourth Schedule slabs compare measured character heights.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="cal-switch" className="text-sm">
                        Enable font-height checks
                      </Label>
                      <Switch
                        id="cal-switch"
                        checked={calibrateOn}
                        onCheckedChange={setCalibrateOn}
                      />
                    </div>
                    {calibrateOn && (
                      <>
                        <div>
                          <div className="mb-1.5 flex justify-between text-sm">
                            <Label>Package height (real, mm)</Label>
                            <span className="font-mono text-primary">
                              {realHeightMm} mm
                            </span>
                          </div>
                          <Slider
                            value={[realHeightMm]}
                            min={20}
                            max={600}
                            step={5}
                            onValueChange={([v]) => setRealHeightMm(v)}
                          />
                        </div>
                        <div>
                          <Label>Package bounding box (px in capture)</Label>
                          <Input
                            type="number"
                            min={50}
                            value={bboxPixelHeight}
                            onChange={(e) =>
                              setBboxPixelHeight(parseInt(e.target.value) || 0)
                            }
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            mm/px ={" "}
                            {bboxPixelHeight > 0
                              ? (realHeightMm / bboxPixelHeight).toFixed(4)
                              : "—"}
                          </p>
                        </div>
                        <div className="grid grid-cols-[1fr_5rem] gap-2">
                          <div>
                            <Label>Package size (optional override)</Label>
                            <Input
                              type="number"
                              placeholder="e.g. 500"
                              value={sizeValue}
                              onChange={(e) => setSizeValue(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <Select value={sizeUnit} onValueChange={setSizeUnit}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="g">g</SelectItem>
                                <SelectItem value="kg">kg</SelectItem>
                                <SelectItem value="ml">ml</SelectItem>
                                <SelectItem value="l">l</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void runInspection()}
                  disabled={scanning || !prepared}
                >
                  {scanning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : offlineMode ? (
                    <WifiOff className="size-4" />
                  ) : (
                    <ScanLine className="size-4" />
                  )}
                  {offlineMode ? "Queue offline inspection" : "Run inspection"}
                </Button>
                {offlineMode && queued.length > 0 && (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <p className="mb-2 font-medium">Offline queue preview</p>
                    {queued.slice(-3).reverse().map((q) => (
                      <p key={q.queuedAt} className="truncate font-mono">
                        {new Date(q.queuedAt).toLocaleTimeString()} ·{" "}
                        {q.payload.imageHash.slice(0, 14)}…
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Verdict panel */}
              <div className="space-y-5 lg:col-span-3">
                {!lastScan ? (
                  <Card className="h-full">
                    <CardContent className="flex h-full min-h-96 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                      <ShieldCheck className="size-10 opacity-40" />
                      <p className="max-w-72 text-sm">
                        Run an inspection to see the OCR regions, bounding-box
                        overlay, and the Rule 6 / Fourth Schedule verdict here.
                      </p>
                    </CardContent>
                  </Card>
                ) : lastScanId === "QUEUED-OFFLINE" ? (
                  <Card className="border-amber-600/40">
                    <CardContent className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
                      <WifiOff className="size-10 text-amber-600" />
                      <p className="text-sm font-medium">Queued for sync</p>
                      <p className="max-w-72 text-sm text-muted-foreground">
                        Evidence is stored locally with its SHA-256 hash and
                        will be filed to the repository when you hit
                        “Sync queue”.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <VerdictHeader
                      scanId={lastScan?.scanId ?? ""}
                      isCompliant={result?.isCompliant ?? false}
                      score={result?.complianceScore ?? 0}
                      hash={lastScan?.imageHash ?? ""}
                      geotag={lastScan?.geolocation}
                    />
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          Bounding-box overlay
                        </CardTitle>
                        <CardDescription>
                          OCR regions classified into Rule 6 fields.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {prepared && (
                          <div className="relative inline-block w-full">
                            <img
                              src={prepared.dataUrl}
                              alt="evidence"
                              className="w-full rounded-md border"
                            />
                            {regions.map((r) => {
                              const color =
                                r.classification === "accepted"
                                  ? "#166534"
                                  : r.classification === "rejected_low_confidence"
                                    ? "#b45309"
                                    : "#7f1d1d";
                              const b = r.boundingBox;
                              return (
                                <div
                                  key={r.regionId}
                                  className="absolute"
                                  style={{
                                    left: `${(b.x / (lastScan?.imageWidth ?? 1)) * 100}%`,
                                    top: `${(b.y / (lastScan?.imageHeight ?? 1)) * 100}%`,
                                    width: `${(b.w / (lastScan?.imageWidth ?? 1)) * 100}%`,
                                    height: `${(b.h / (lastScan?.imageHeight ?? 1)) * 100}%`,
                                    border: `2px solid ${color}`,
                                    background: `${color}14`,
                                  }}
                                  title={r.rawText}
                                >
                                  <span
                                    className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[9px] font-medium text-white"
                                    style={{ background: color }}
                                  >
                                    {r.match
                                      ? r.match.field
                                      : r.classification.replace("rejected_", "")}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="mt-4 space-y-1.5">
                          {regions.map((r) => (
                            <div
                              key={r.regionId}
                              className="flex items-center justify-between gap-3 rounded border bg-card px-2.5 py-1.5 text-xs"
                            >
                              <span className="truncate font-mono">
                                “{r.rawText}”
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {r.match && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {r.match.value}
                                  </Badge>
                                )}
                                <span className="font-mono text-muted-foreground">
                                  {(r.confidence * 100).toFixed(0)}%
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    {result && result.fontSizeViolations.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            Fourth Schedule measurements
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-2 sm:grid-cols-2">
                          {result.fontSizeViolations.map((v, i) => (
                            <div
                              key={i}
                              className="rounded-md border border-red-700/40 bg-red-700/5 px-3 py-2 text-sm"
                            >
                              <p className="font-medium">
                                {FIELD_LABELS[v.field] ?? v.field}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                measured {v.actualMm} mm · required ≥{" "}
                                {v.requiredMm} mm
                              </p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          navigate(`/notice/${lastScan?.scanId ?? ""}`)
                        }
                        disabled={!lastScan || (result?.isCompliant ?? true)}
                      >
                        <Gavel className="size-4" /> Generate legal notice
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPrepared(null);
                          setLastScanId(null);
                        }}
                      >
                        <ScanLine className="size-4" /> New inspection
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ---------------------------- REPOSITORY ---------------------------- */}
          <TabsContent value="repository">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle>Case repository</CardTitle>
                    <CardDescription>
                      Every scan across both portals, filterable and
                      searchable.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        className="w-56 pl-8"
                        placeholder="Search scan id / brand…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="compliant">Compliant</SelectItem>
                        <SelectItem value="flagged">Flagged</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All portals</SelectItem>
                        <SelectItem value="consumer">Consumer</SelectItem>
                        <SelectItem value="officer">Officer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scan ID</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Portal</TableHead>
                      <TableHead>Brand / Maker</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Violations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(scans ?? []).map((s) => (
                      <TableRow
                        key={s._id}
                        className="cursor-pointer"
                        onClick={() => setDetailId(s.scanId)}
                      >
                        <TableCell className="font-mono text-xs">
                          {s.scanId}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(s.timestamp).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="spec-tag text-[10px]"
                          >
                            {s.portalRole}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-sm">
                          {s.brand ?? s.productName ?? "—"}
                        </TableCell>
                        <TableCell>
                          {s.isCompliant === true ? (
                            <Badge className="bg-emerald-700/15 text-emerald-800 hover:bg-emerald-700/25">
                              <CheckCircle2 className="size-3" /> Compliant
                            </Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              className="bg-red-700/10 text-red-800 hover:bg-red-700/20"
                            >
                              <AlertTriangle className="size-3" /> Flagged
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {s.violationCount + s.missingCount}
                        </TableCell>
                      </TableRow>
                    ))}
                    {scans && scans.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          No cases match the filters yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {reports && reports.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <p className="spec-tag mb-2 inline-flex">
                      <FileText className="size-3.5" /> Issued notices
                    </p>
                    <div className="space-y-1">
                      {reports.slice(0, 6).map((r) => (
                        <div
                          key={r._id}
                          className="flex items-center justify-between rounded border bg-card px-3 py-1.5 text-xs"
                        >
                          <span className="font-mono">{r.noticeNo}</span>
                          <span className="text-muted-foreground">
                            {r.officerName} · {r.violationCount} violation(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------- ANALYTICS ---------------------------- */}
          <TabsContent value="analytics">
            {!analytics ? (
              <Card>
                <CardContent className="flex min-h-64 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    icon={<Database className="size-4" />}
                    label="Total scans"
                    value={analytics.total}
                  />
                  <StatCard
                    icon={<CheckCircle2 className="size-4" />}
                    label="Compliant"
                    value={analytics.compliant}
                    tone="ok"
                  />
                  <StatCard
                    icon={<FileWarning className="size-4" />}
                    label="Flagged"
                    value={analytics.flagged}
                    tone="bad"
                  />
                  <StatCard
                    icon={<BarChart3 className="size-4" />}
                    label="Compliance ratio"
                    value={`${analytics.complianceRatio}%`}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        Verdicts · last 14 days
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.byDay}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                          <ReTooltip />
                          <Legend />
                          <Bar
                            dataKey="compliant"
                            name="Compliant"
                            stackId="a"
                            fill="var(--chart-1)"
                          />
                          <Bar
                            dataKey="flagged"
                            name="Flagged"
                            stackId="a"
                            fill="var(--chart-2)"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        Portal split & violations
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={analytics.violationTypes}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis
                            type="category"
                            dataKey="category"
                            width={130}
                            tick={{ fontSize: 10 }}
                          />
                          <ReTooltip />
                          <Bar dataKey="count" name="Occurrences" fill="var(--chart-3)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        Repeat offender ranking
                      </CardTitle>
                      <CardDescription>
                        Flagged scans per brand / manufacturer.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analytics.repeatOffenders.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No flagged brands yet.
                          </p>
                        )}
                        {analytics.repeatOffenders.map((r, i) => (
                          <div
                            key={r.brand}
                            className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              #{i + 1}
                            </span>
                            <span className="flex-1 truncate text-sm font-medium">
                              {r.brand}
                            </span>
                            <span className="marker-red px-1 font-mono text-xs">
                              {r.flagged}/{r.total} flagged
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        State / district heatmap
                      </CardTitle>
                      <CardDescription>
                        Flag density by inspection location.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        {analytics.byState.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No geotagged inspections yet.
                          </p>
                        )}
                        {analytics.byState.map((s) => {
                          const ratio = s.total > 0 ? s.flagged / s.total : 0;
                          return (
                            <div
                              key={s.state}
                              className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                              style={{
                                background: `rgba(180, 83, 9, ${Math.min(0.6, ratio * 0.75 + 0.06).toFixed(2)})`,
                              }}
                            >
                              <span className="flex items-center gap-2">
                                <MapPin className="size-3.5" />
                                {s.state}
                                <span className="text-xs text-muted-foreground">
                                  {s.districts} district(s)
                                </span>
                              </span>
                              <span className="font-mono text-xs">
                                {s.flagged}/{s.total}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Compliant vs flagged share
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Compliant", value: analytics.compliant },
                            { name: "Flagged", value: analytics.flagged },
                          ]}
                          dataKey="value"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          <Cell fill="var(--chart-1)" />
                          <Cell fill="var(--chart-2)" />
                        </Pie>
                        <ReTooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Case detail dialog */}
      <Dialog
        open={detailId != null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              {detail?.scanId ?? "Loading…"}
            </DialogTitle>
            <DialogDescription>
              {detail &&
                `${new Date(detail.timestamp).toLocaleString("en-IN")} · ${detail.portalRole} portal · ${detail.source}`}
            </DialogDescription>
          </DialogHeader>
          {detail?.result && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                {detail.result.isCompliant ? (
                  <Badge className="bg-emerald-700/15 text-emerald-800">
                    Compliant
                  </Badge>
                ) : (
                  <Badge variant="destructive">Flagged</Badge>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  score {detail.result.complianceScore}/100 · ruleset{" "}
                  {detail.result.appliedRuleVersion}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(FIELD_LABELS).map(([k, label]) => {
                  const missing = detail.result!.missingFields.includes(
                    k as never,
                  );
                  const val = detail.extraction?.fields?.[k]?.value;
                  return (
                    <div
                      key={k}
                      className={`rounded border px-2.5 py-1.5 ${missing ? "border-red-700/40 bg-red-700/5" : "bg-card"}`}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className="text-xs font-medium">
                        {missing ? "missing" : (val ?? "—")}
                      </p>
                    </div>
                  );
                })}
              </div>
              {detail.result.formattingViolations.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {detail.result.formattingViolations.map((v, i) => (
                    <li key={i}>
                      <span className="font-medium">{v.ruleCited}</span> —{" "}
                      {v.details}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setDetailId(null);
                    navigate(`/notice/${detail.scanId}`);
                  }}
                  disabled={detail.result.isCompliant}
                >
                  <Gavel className="size-4" /> Open notice generator
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/dashboard">Close</Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "ok" | "bad";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex size-9 items-center justify-center rounded-md ${
            tone === "ok"
              ? "bg-emerald-700/10 text-emerald-700"
              : tone === "bad"
                ? "bg-red-700/10 text-red-700"
                : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function VerdictHeader({
  scanId,
  isCompliant,
  score,
  hash,
  geotag,
}: {
  scanId: string;
  isCompliant: boolean;
  score: number;
  hash: string;
  geotag?: { lat?: number; lng?: number; state?: string; district?: string } | null;
}) {
  const ok = isCompliant;
  return (
    <Card className={ok ? "border-emerald-700/40" : "border-red-700/40"}>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          {ok ? (
            <CheckCircle2 className="size-8 text-emerald-700" />
          ) : (
            <AlertTriangle className="size-8 text-red-700" />
          )}
          <div>
            <p className="text-lg font-bold">
              {ok ? "COMPLIANT" : "FLAGGED"}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {score}/100
              </span>
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {scanId} · SHA-256 {hash.slice(0, 16)}…
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {geotag?.lat != null && (
            <p className="font-mono">
              {geotag.lat.toFixed(4)}, {(geotag.lng ?? 0).toFixed(4)}
            </p>
          )}
          {geotag?.state && <p>{geotag.state}</p>}
          <div className={`stamp mt-1 inline-block text-[10px] ${ok ? "text-emerald-700" : "text-red-700"}`}>
            {ok ? "VERIFIED" : "VIOLATION"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

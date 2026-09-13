// Shared vision-report components used by both portals: product information
// summary, compliance summary, evidence overlay with bounding boxes,
// rule-by-rule requirement cards, and the developer debug panel that exposes
// every stage of the pipeline (image → product → barcode → extraction →
// applicable rules → rule results → decision).

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  ChevronDown,
  Database,
  Eye,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { FIELD_LABELS, requirementLabel, type ScanDoc } from "@/lib/scan-client";
import type { ExtractedField, RequirementResult } from "@/convex/productRules";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Verdict helpers
// ---------------------------------------------------------------------------

export type Verdict = "PASS" | "FAIL" | "REVIEW";

export const VERDICT_META: Record<
  Verdict,
  { label: string; icon: typeof BadgeCheck; chip: string; banner: string; overall: string }
> = {
  PASS: {
    label: "PASS",
    icon: BadgeCheck,
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    banner:
      "bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200",
    overall: "✅ COMPLIANT",
  },
  FAIL: {
    label: "FAIL",
    icon: Ban,
    chip: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    banner: "bg-red-500/10 border-red-500/40 text-red-800 dark:text-red-200",
    overall: "❌ NON-COMPLIANT",
  },
  REVIEW: {
    label: "REVIEW",
    icon: AlertTriangle,
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    banner:
      "bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-200",
    overall: "⚠️ NEEDS REVIEW",
  },
};

export function StatusChip({
  status,
  className,
}: {
  status: Verdict;
  className?: string;
}) {
  const meta = VERDICT_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        meta.chip,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------------------
// Evidence image with bounding-box overlay
// ---------------------------------------------------------------------------

export function EvidenceImage({
  src,
  width,
  height,
  boxes,
  highlight,
  maxHeight = 560,
  className,
}: {
  src?: string | null;
  width: number;
  height: number;
  /** Boxes to always draw (faint). */
  boxes?: Array<{
    box: { x: number; y: number; w: number; h: number };
    label: string;
    status?: Verdict;
  }>;
  /** The actively-highlighted box (drawn bold). */
  highlight?: {
    box: { x: number; y: number; w: number; h: number };
    label: string;
  } | null;
  maxHeight?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 p-8 text-sm text-muted-foreground",
          className,
        )}
      >
        Evidence image not available
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-lg border border-border/60 bg-muted/30",
        className,
      )}
      style={{ maxWidth: maxHeight * (width / height) }}
    >
      <img src={src} alt="Evidence capture" className="block w-full" />
      {boxes?.map((b, i) => (
        <div
          key={i}
          className={cn(
            "pointer-events-none absolute rounded border-2",
            b.status === "FAIL"
              ? "border-red-500/70 bg-red-500/10"
              : b.status === "REVIEW"
                ? "border-amber-500/70 bg-amber-500/10"
                : "border-emerald-500/60 bg-emerald-500/5",
          )}
          style={{
            left: `${(b.box.x / width) * 100}%`,
            top: `${(b.box.y / height) * 100}%`,
            width: `${(b.box.w / width) * 100}%`,
            height: `${(b.box.h / height) * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-background/90 px-1 text-[10px] font-medium text-foreground/80 shadow">
            {b.label}
          </span>
        </div>
      ))}
      {highlight && (
        <div
          className="pointer-events-none absolute rounded border-[3px] border-blue-500"
          style={{
            left: `${(highlight.box.x / width) * 100}%`,
            top: `${(highlight.box.y / height) * 100}%`,
            width: `${(highlight.box.w / width) * 100}%`,
            height: `${(highlight.box.h / height) * 100}%`,
          }}
        >
          <span className="absolute -top-6 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            {highlight.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product information card (only detected values are shown)
// ---------------------------------------------------------------------------

const INFO_ROWS: Array<{ key: string; emoji: string }> = [
  { key: "brand", emoji: "🏷️" },
  { key: "productName", emoji: "📦" },
  { key: "packageType", emoji: "🗄️" },
  { key: "manufacturer", emoji: "🏭" },
  { key: "packer", emoji: "🧑‍🏭" },
  { key: "importer", emoji: "🚢" },
  { key: "manufacturerAddress", emoji: "📍" },
  { key: "netQuantity", emoji: "⚖️" },
  { key: "mrp", emoji: "💰" },
  { key: "batchNumber", emoji: "🔢" },
  { key: "manufactureDate", emoji: "📅" },
  { key: "bestBefore", emoji: "⏳" },
  { key: "countryOfOrigin", emoji: "🌍" },
  { key: "fssaiLicense", emoji: "🧾" },
  { key: "licenseInfo", emoji: "📜" },
  { key: "consumerCare", emoji: "📞" },
  { key: "ingredients", emoji: "🧂" },
  { key: "barcode", emoji: "🔗" },
];

export function ProductInfoCard({ doc }: { doc: ScanDoc }) {
  const a = doc.analysis;
  const values: Record<string, string | null | undefined> = {
    brand: a.brand,
    productName: a.productName,
    packageType: a.packageType,
    manufacturer: a.manufacturer,
    packer: a.packer,
    importer: a.importer,
    manufacturerAddress: a.manufacturerAddress,
    netQuantity: a.netQuantity,
    mrp: a.mrp,
    batchNumber: a.batchNumber,
    manufactureDate: a.manufactureDate,
    bestBefore: a.bestBefore,
    countryOfOrigin: a.countryOfOrigin,
    fssaiLicense: a.fssaiLicense,
    licenseInfo: a.licenseInfo,
    consumerCare: a.consumerCare,
    ingredients: a.ingredients,
    barcode: a.barcode.value,
  };
  const detected = INFO_ROWS.filter((r) => {
    const v = values[r.key];
    return typeof v === "string" && v.trim().length > 0;
  });

  const checksumBadge =
    a.barcode.value != null && a.barcode.checksumValid != null ? (
      <Badge
        variant={a.barcode.checksumValid ? "secondary" : "destructive"}
        className="ml-2"
      >
        {a.barcode.checksumValid ? "checksum valid" : "checksum invalid"}
      </Badge>
    ) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="h-4 w-4 text-primary" />
          Product Information
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {detected.length} of {INFO_ROWS.length} declarations detected
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {INFO_ROWS.map((row) => {
            const v = values[row.key];
            const show =
              typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
            return (
              <div
                key={row.key}
                className={cn(
                  "min-w-0 border-b border-border/40 pb-2",
                  row.key === "barcode" && checksumBadge && "sm:col-span-2",
                )}
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {row.emoji} {FIELD_LABELS[row.key] ?? row.key}
                </dt>
                <dd className="mt-0.5 break-words text-sm font-medium">
                  {show ? (
                    <>
                      {show}
                      {row.key === "barcode" && checksumBadge}
                    </>
                  ) : (
                    <span className="font-normal text-amber-600 dark:text-amber-400">
                      ⚠️ Unable to determine
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        {a.productVariant && (
          <p className="mt-3 text-xs text-muted-foreground">
            Variant: {a.productVariant}
          </p>
        )}
        {a.otherDeclarations.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Other declarations seen: {a.otherDeclarations.join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cross-check (image ↔ barcode database)
// ---------------------------------------------------------------------------

export function CrossCheckCard({ doc }: { doc: ScanDoc }) {
  const cc = doc.result.crossCheck;
  if (!cc.performed) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-muted-foreground" />
            Barcode Cross-Check
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {cc.note ?? "No decodable barcode — cross-check skipped."}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          Barcode Cross-Check
          {cc.mismatches.length > 0 && (
            <Badge className="ml-auto border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
              ⚠️ Information mismatch
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">IMAGE</p>
            <p className="font-medium">
              {doc.brand ?? "—"} / {doc.productName ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              BARCODE DATABASE {cc.source ? `(${cc.source})` : ""}
            </p>
            <p className="font-medium">
              {cc.dbFound
                ? `${cc.dbBrand ?? "—"} / ${cc.dbTitle ?? "—"}`
                : "Not found"}
            </p>
          </div>
        </div>
        {cc.mismatches.length === 0 && cc.dbFound ? (
          <p className="text-emerald-700 dark:text-emerald-300">→ MATCH ✅</p>
        ) : null}
        {cc.mismatches.map((m, i) => (
          <div
            key={i}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
          >
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              ⚠️ INFORMATION MISMATCH — {requirementLabel(m.field)}
            </p>
            <p className="mt-1">
              Package: <b>{m.imageValue}</b>
            </p>
            <p>
              Database: <b>{m.databaseValue}</b>
            </p>
            <p className="mt-1 font-medium">Action: REVIEW</p>
          </div>
        ))}
        {cc.barcodeChecksumValid === false && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Barcode check digit invalid — digits may have been misread or the code
            is not a valid GTIN.
          </p>
        )}
        {cc.note && <p className="text-xs text-muted-foreground">{cc.note}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Compliance summary + decision banner
// ---------------------------------------------------------------------------

export function ComplianceSummary({
  doc,
  children,
}: {
  doc: ScanDoc;
  children?: React.ReactNode;
}) {
  const r = doc.result;
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl border p-4",
          VERDICT_META[r.decision].banner,
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">
              Overall status
            </p>
            <p className="text-2xl font-bold">{VERDICT_META[r.decision].overall}</p>
          </div>
          <p className="max-w-md text-right text-xs opacity-80">
            {r.summarySentence}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="py-3">
          <CardContent className="px-3">
            <p className="text-xs text-muted-foreground">Applicable requirements</p>
            <p className="text-xl font-bold">{r.applicableCount}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">✅ PASS</p>
            <p className="text-xl font-bold">{r.passCount}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <p className="text-xs text-red-700 dark:text-red-300">❌ FAIL</p>
            <p className="text-xl font-bold">{r.failCount}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ REVIEW</p>
            <p className="text-xl font-bold">{r.reviewCount}</p>
          </CardContent>
        </Card>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule-by-rule requirement card
// ---------------------------------------------------------------------------

export function RequirementCard({
  req,
  imageUrl,
  imageWidth,
  imageHeight,
}: {
  req: RequirementResult;
  imageUrl?: string | null;
  imageWidth: number;
  imageHeight: number;
}) {
  const [showOnImage, setShowOnImage] = useState(false);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold">{req.title}</CardTitle>
          <StatusChip status={req.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          Applicable rule: {req.ruleCited}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Detected</p>
          <p className="font-medium">{req.detected ?? "Not reliably visible"}</p>
        </div>
        {req.evidence && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Evidence</p>
            <p className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">
              “{req.evidence}”
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Confidence</p>
            <p className="font-medium">{pct(req.confidence)}</p>
          </div>
          {req.boundingBox && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowOnImage((s) => !s)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              {showOnImage ? "Hide on image" : "Show on image"}
            </Button>
          )}
        </div>
        {req.reason && (
          <p
            className={cn(
              "rounded-md border px-2 py-1.5 text-xs",
              req.status === "FAIL"
                ? "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
                : req.status === "REVIEW"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                  : "border-border/50 bg-muted/40 text-muted-foreground",
            )}
          >
            {req.reason}
          </p>
        )}
        {showOnImage && req.boundingBox && (
          <EvidenceImage
            src={imageUrl}
            width={imageWidth}
            height={imageHeight}
            highlight={{
              box: req.boundingBox,
              label: req.detected ?? req.title,
            }}
            maxHeight={420}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Debug (developer) panel — full pipeline trace
// ---------------------------------------------------------------------------

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function DebugPanel({
  doc,
  imageUrl,
}: {
  doc: ScanDoc;
  imageUrl?: string | null;
}) {
  const a = doc.analysis;
  const [open, setOpen] = useState(false);

  const applicability = useMemo(
    () =>
      Object.fromEntries(
        (doc.result.applicability ?? []).map((x) => [x.requirementId, x]),
      ),
    [doc.result.applicability],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full">
          <Sparkles className="mr-2 h-4 w-4" />
          Developer mode — full pipeline trace
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1 · Original image</CardTitle>
          </CardHeader>
          <CardContent>
            <EvidenceImage
              src={imageUrl}
              width={doc.imageWidth}
              height={doc.imageHeight}
              maxHeight={480}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Engine: {a.engine} · image {doc.imageWidth}×{doc.imageHeight} · SHA-256{" "}
              <span className="font-mono">{doc.imageHash.slice(0, 16)}…</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              2 · Detected product &amp; barcode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <b>{a.brand ?? "⚠️ Unable to determine"}</b> —{" "}
              {a.productName ?? "⚠️ Unable to determine"}{" "}
              <span className="text-muted-foreground">
                (category {a.category}, confidence {pct(a.categoryConfidence)})
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Barcode: {a.barcode.value ?? "none detected"}
              {a.barcode.symbology ? ` · ${a.barcode.symbology}` : ""}
              {a.barcode.checksumValid != null
                ? ` · checksum ${a.barcode.checksumValid ? "valid" : "INVALID"}`
                : ""}
              {a.barcode.prefixRegion
                ? ` · prefix region ${a.barcode.prefixRegion}`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">3 · Extracted fields (AI)</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock
              data={a.fields.map((f: ExtractedField) => ({
                key: f.key,
                value: f.value ?? "(unreadable)",
                state: f.state,
                confidence: f.confidence,
                evidence: f.evidence,
                box: f.boundingBox,
              }))}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              AI image-quality confidence: {pct(a.imageQualityConfidence)}
              {a.warnings.length > 0
                ? ` · warnings: ${a.warnings.join(" | ")}`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">4 · Rule applicability</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock
              data={(doc.result.applicability ?? []).map((x) => ({
                id: x.requirementId,
                name: requirementLabel(x.requirementId),
                applicable: x.applicable,
                reason: x.reason,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">5 · Each rule result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {doc.result.requirements.map((r) => (
              <div
                key={r.requirementId}
                className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5"
              >
                <span className="min-w-0 truncate">
                  {applicability[r.requirementId]?.applicable === false ? "—" : "•"}{" "}
                  {r.title}{" "}
                  <span className="text-muted-foreground">({r.ruleCited})</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">{pct(r.confidence)}</span>
                  <StatusChip status={r.status} />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">6 · Final decision</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <JsonBlock
              data={{
                decision: doc.result.decision,
                counts: {
                  applicable: doc.result.applicableCount,
                  pass: doc.result.passCount,
                  fail: doc.result.failCount,
                  review: doc.result.reviewCount,
                },
                ruleVersion: doc.result.appliedRuleVersion,
                crossCheck: doc.result.crossCheck,
                fontChecks: doc.result.fontChecks,
              }}
            />
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Full report composition
// ---------------------------------------------------------------------------

export function AnalysisReport({
  doc,
  imageUrl,
  showDebug = true,
}: {
  doc: ScanDoc;
  imageUrl?: string | null;
  showDebug?: boolean;
}) {
  return (
    <div className="space-y-5">
      <ComplianceSummary doc={doc} />
      <Tabs defaultValue="report">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="report">Rule-by-rule</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          {showDebug && <TabsTrigger value="debug">Debug</TabsTrigger>}
        </TabsList>

        <TabsContent value="report" className="mt-4 space-y-4">
          <ProductInfoCard doc={doc} />
          <CrossCheckCard doc={doc} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {doc.result.requirements.map((r) => (
              <RequirementCard
                key={r.requirementId}
                req={r}
                imageUrl={imageUrl}
                imageWidth={doc.imageWidth}
                imageHeight={doc.imageHeight}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Image evidence — detected declarations highlighted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EvidenceImage
                src={imageUrl}
                width={doc.imageWidth}
                height={doc.imageHeight}
                boxes={doc.result.requirements
                  .filter((r) => r.boundingBox)
                  .map((r) => ({
                    box: r.boundingBox!,
                    label: r.detected ?? r.title,
                    status: r.status,
                  }))}
                maxHeight={640}
              />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {doc.result.requirements
              .filter((r) => r.boundingBox)
              .map((r) => (
                <Card key={r.requirementId} className="py-4">
                  <CardContent className="space-y-2 px-4 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{r.title}</p>
                      <StatusChip status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      AI interpretation: <b>{r.detected}</b>
                    </p>
                    {r.evidence && (
                      <p className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                        “{r.evidence}”
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Applicable requirement: {r.ruleCited}
                    </p>
                    <EvidenceImage
                      src={imageUrl}
                      width={doc.imageWidth}
                      height={doc.imageHeight}
                      highlight={{
                        box: r.boundingBox!,
                        label: r.detected ?? r.title,
                      }}
                      maxHeight={260}
                    />
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        {showDebug && (
          <TabsContent value="debug" className="mt-4">
            <DebugPanel doc={doc} imageUrl={imageUrl} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

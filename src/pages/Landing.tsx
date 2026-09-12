import { motion } from "framer-motion";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/use-auth";
import { LABEL_SAMPLES } from "@/lib/label-samples";
import {
  ScanLine,
  Camera,
  ShieldCheck,
  Gavel,
  Ruler,
  BarChart3,
  Database,
  FileText,
  WifiOff,
  Stamp,
  ArrowRight,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";

const RULE_CHECKS = [
  {
    icon: <ScanLine className="size-4" />,
    title: "MRP with ₹ symbol",
    clause: "Rule 6(1)(e)",
    detail:
      "Detects the MRP declaration and flags non-₹ currency formats such as “Rs 185”.",
  },
  {
    icon: <ScanLine className="size-4" />,
    title: "Net quantity in SI units",
    clause: "Rule 6(1)(a)",
    detail: "g, kg, ml, l, N — non-standard units are cited as violations.",
  },
  {
    icon: <ScanLine className="size-4" />,
    title: "Month & year of manufacture",
    clause: "Rule 6(1)(d)",
    detail: "Must be MM/YYYY or MM/YY; anything else gets flagged.",
  },
  {
    icon: <ScanLine className="size-4" />,
    title: "Manufacturer & consumer care",
    clause: "Rule 6(1)(b), (f)",
    detail: "Name/address of maker plus helpline phone, email or URL.",
  },
  {
    icon: <Ruler className="size-4" />,
    title: "Character height slabs",
    clause: "Fourth Schedule",
    detail:
      "Physical calibration turns pixels into millimetres and validates print size per package-weight slab.",
  },
  {
    icon: <ScanLine className="size-4" />,
    title: "Country of origin",
    clause: "Rule 6(1)(i)",
    detail: "“Made in …” / “Country of Origin: …” must be declared.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Ledger-paper top strip */}
      <div className="ledger-grid border-b bg-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo className="size-8" />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">MetroScan</p>
              <p className="text-[11px] text-muted-foreground">
                Legal Metrology (Packaged Commodities) Rules, 2011
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link to="/scan">
                <ScanLine className="size-4" /> Scan a label
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard"}>
                <Lock className="size-4" /> Officer portal
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="draft-grid border-b">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="outline" className="spec-tag mb-4">
              <Stamp className="size-3.5" /> Rule 6 · Fourth Schedule · automated
            </Badge>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Every pack tells the truth.
              <br />
              <span className="marker-yellow">We check the fine print.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground">
              MetroScan reads the mandatory declarations on any packaged
              commodity — MRP, net quantity, dates, maker, consumer care,
              origin — validates them against the Legal Metrology (Packaged
              Commodities) Rules 2011, and stamps a verdict in seconds.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/scan">
                  <Camera className="size-5" /> Scan a label free
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard"}>
                  <Gavel className="size-5" /> Enforcement portal
                </Link>
              </Button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              No account needed to scan · evidence hashed with SHA-256
            </p>
          </motion.div>

          {/* Verdict specimen */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex items-center"
          >
            <Card className="receipt-paper w-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Instant Scan Result</CardTitle>
                  <span className="stamp rotate-[-6deg] text-[10px] text-red-700">
                    Flagged
                  </span>
                </div>
                <CardDescription className="font-mono text-[11px]">
                  SCN-9F2A41… · score 35/100
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { label: "MRP", value: "Rs 185 — ₹ symbol missing", tone: "warn" },
                  { label: "Net Quantity", value: "500 g", tone: "ok" },
                  { label: "Mfd / Pkd", value: "03/2026", tone: "ok" },
                  { label: "Manufacturer", value: "Sunrise Foods Pvt. Ltd.", tone: "ok" },
                  { label: "Consumer Care", value: "Not found on label", tone: "bad" },
                  { label: "Country of Origin", value: "Not found on label", tone: "bad" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between rounded-md border px-3 py-1.5 ${
                      row.tone === "ok"
                        ? "border-emerald-700/30 bg-emerald-700/5"
                        : row.tone === "warn"
                          ? "border-amber-600/50 bg-amber-600/5"
                          : "border-red-700/40 bg-red-700/5"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {row.tone === "ok" && (
                        <CheckCircle2 className="size-3.5 text-emerald-700" />
                      )}
                      {row.tone !== "ok" && (
                        <AlertTriangle
                          className={`size-3.5 ${row.tone === "warn" ? "text-amber-700" : "text-red-700"}`}
                        />
                      )}
                      {row.value}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">
                  → One tap files a pre-filled grievance on the National
                  Consumer Helpline.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Dual portals */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="spec-tag mb-2 inline-flex">Two portals, one rulebook</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Built for shoppers and for the field
            </h2>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="group transition hover:border-primary/50">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-emerald-700/10 text-emerald-800">
                <Camera className="size-5" />
              </div>
              <CardTitle>Consumer Portal</CardTitle>
              <CardDescription>
                Check any pack in seconds — no signup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>· Upload, live camera, or e-commerce image URL</p>
              <p>· Plain-language verdict: what's missing, what's improper</p>
              <p>· One-click grievance draft for the National Consumer Helpline</p>
              <Button asChild variant="outline" className="mt-3">
                <Link to="/scan">
                  Open scanner <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group transition hover:border-primary/50">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Gavel className="size-5" />
              </div>
              <CardTitle>Enforcement Officer Portal</CardTitle>
              <CardDescription>
                Field inspections with legal-grade output.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>· Geotagged, timestamped, SHA-256 evidence chain-of-custody</p>
              <p>· Offline-first field mode with sync queue</p>
              <p>· Font calibration against Fourth Schedule slabs</p>
              <p>· One-click PDF / editable notice with cited clauses</p>
              <Button asChild className="mt-3">
                <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard"}>
                  Enter portal <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Rule coverage */}
      <section className="border-y bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="spec-tag mb-2 inline-flex">
            <Scale className="size-3.5" /> What the engine checks
          </p>
          <h2 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">
            The rulebook, encoded
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_CHECKS.map((c) => (
              <div
                key={c.clause}
                className="evidence-frame rounded-md p-4 transition hover:border-primary/50"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {c.icon}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {c.clause}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Officer feature strip */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: <Ruler className="size-4" />,
              t: "Physical calibration",
              d: "mm-per-pixel from real package height; character heights measured in millimetres.",
            },
            {
              icon: <WifiOff className="size-4" />,
              t: "Offline-first field mode",
              d: "Queued captures persist locally with hashes and sync when back online.",
            },
            {
              icon: <FileText className="size-4" />,
              t: "Notice generator",
              d: "Legal-grade PDF and editable Word notices with evidence and citations.",
            },
            {
              icon: <BarChart3 className="size-4" />,
              t: "Analytics & heatmaps",
              d: "Pass/fail ratios, repeat offenders, state/district violation density.",
            },
          ].map((f) => (
            <Card key={f.t}>
              <CardContent className="p-4">
                <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  {f.icon}
                </span>
                <p className="mt-3 text-sm font-semibold">{f.t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{f.d}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Specimen strip */}
      <section className="border-y bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="spec-tag mb-2 inline-flex">
                <Database className="size-3.5" /> Try the pipeline
              </p>
              <h2 className="text-xl font-bold tracking-tight">
                Four specimen labels are waiting in the scanner
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Each one fails a different subset of Rule 6 — see the verdicts
                for yourself.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {LABEL_SAMPLES.map((s) => (
                <span key={s.id} className="spec-tag">
                  {s.emoji} {s.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Know what the label owes you.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Scan your kitchen shelf. File what's wrong. Let the rulebook do the
          talking.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/scan">
              <ScanLine className="size-5" /> Scan a label now
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard"}>
              <Lock className="size-5" /> Officer sign-in
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span>MetroScan · Automated compliance for packaged commodities</span>
          </div>
          <span>
            Rules engine v2011.04 · References to the Legal Metrology Act, 2009
            & PC Rules, 2011 are indicative.
          </span>
        </div>
      </footer>
    </div>
  );
}

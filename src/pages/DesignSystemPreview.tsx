import React, { useState } from "react";
import {
  Button,
  IconButton,
  Badge,
  SeverityBadge,
  ProvenanceBadge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  HeroCard,
  Stat,
  Skeleton,
  EmptyState,
  ErrorState,
  Tooltip,
  Dialog,
  Drawer,
  Tabs,
  DataTable,
  Sparkline,
  TimeSeriesChart,
  Gauge,
  KeyValueList,
  CodeBlock,
  showToast,
  ConnectionIndicator,
  Tag,
  StatusDot,
  KpiCard,
  StepCard,
  Input,
  Select,
  Kbd,
  Pill,
} from "@/design/components";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ShieldAlert,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Activity,
  Layers,
  Terminal,
  Server,
  Zap,
  CheckCircle2,
  Lock,
  Swords,
  TrendingUp,
  Cpu,
  Shield,
  Search,
} from "lucide-react";

export default function DesignSystemPreview() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [gaugeValue, setGaugeValue] = useState(68);
  const [textInputVal, setTextInputVal] = useState("");
  const [selectVal, setSelectVal] = useState("auto");

  const sampleTableData = [
    { id: "inc_01", identity: "usr_alice", rule: "T1110 Brute Force", severity: "CRITICAL", score: 0.94, prov: "live" },
    { id: "inc_02", identity: "usr_bob", rule: "T1046 Discovery Scan", severity: "HIGH", score: 0.82, prov: "live" },
    { id: "inc_03", identity: "usr_charlie", rule: "T1020 Exfiltration", severity: "ELEVATED", score: 0.67, prov: "replay" },
    { id: "inc_04", identity: "usr_david", rule: "EWMA Drift Alert", severity: "LOW", score: 0.35, prov: "simulated" },
  ];

  const sampleTableColumns = [
    { accessorKey: "id", header: "Incident ID" },
    { accessorKey: "identity", header: "Identity" },
    { accessorKey: "rule", header: "Technique / Rule" },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }: any) => <SeverityBadge severity={row.original.severity} size="sm" />,
    },
    {
      accessorKey: "score",
      header: "Threat Score",
      cell: ({ row }: any) => (
        <span className="font-mono font-bold text-[#ffb454] sf-tabular">
          {(row.original.score * 100).toFixed(0)}%
        </span>
      ),
    },
    {
      accessorKey: "prov",
      header: "Provenance",
      cell: ({ row }: any) => <ProvenanceBadge provenance={row.original.prov} size="sm" />,
    },
  ];

  const sampleTimeSeriesData = [
    { time: "12:00", requests: 120, baseline: 110 },
    { time: "12:05", requests: 145, baseline: 115 },
    { time: "12:10", requests: 380, baseline: 120 },
    { time: "12:15", requests: 890, baseline: 125 },
    { time: "12:20", requests: 420, baseline: 125 },
    { time: "12:25", requests: 180, baseline: 120 },
  ];

  return (
    <div className="space-y-12 pb-20">
      {/* Page Header with Authoritative Tokens */}
      <PageHeader
        title="Design System & Component Library"
        description="Graphite & Amber design tokens, accessible components, and strict WCAG AA contrast standards."
        badge={<Tag variant="amber" size="sm">GRAPHITE & AMBER v2.0</Tag>}
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkles className="w-4 h-4" />}
              onClick={() => showToast.success("Design System Validated", "Tokens, components, and WCAG AA contrast verified.")}
            >
              Verify Tokens
            </Button>
          </div>
        }
      />

      {/* 0. Palette & Typography Foundations */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#fe9a00]" />
            Foundations: Palette & Typography
          </h2>
          <span className="text-xs font-mono text-[#5f6368]">Authoritative Visual Reference</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Graphite Surfaces */}
          <Card>
            <CardHeader>
              <CardTitle>Graphite Surfaces & Borders</CardTitle>
              <CardDescription>Pure neutral dark hierarchy. No cyan/indigo tint, no glassmorphism.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-3 rounded-lg bg-[#090c10] border border-[rgba(255,255,255,0.07)]">
                  <div className="text-[#9aa0a6] text-[10px]">--bg</div>
                  <div className="text-[#f0f2f5] font-semibold mt-1">#090c10</div>
                </div>
                <div className="p-3 rounded-lg bg-[#0f1013] border border-[rgba(255,255,255,0.07)]">
                  <div className="text-[#9aa0a6] text-[10px]">--surface-1</div>
                  <div className="text-[#f0f2f5] font-semibold mt-1">#0f1013</div>
                </div>
                <div className="p-3 rounded-lg bg-[#111417] border border-[rgba(255,255,255,0.07)]">
                  <div className="text-[#9aa0a6] text-[10px]">--surface-2</div>
                  <div className="text-[#f0f2f5] font-semibold mt-1">#111417</div>
                </div>
                <div className="p-3 rounded-lg bg-[#16181c] border border-[rgba(255,255,255,0.07)]">
                  <div className="text-[#9aa0a6] text-[10px]">--surface-3</div>
                  <div className="text-[#f0f2f5] font-semibold mt-1">#16181c</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Brand Amber vs Severity */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Amber & Strict Severity Spectrum</CardTitle>
              <CardDescription>
                Rule: Amber is brand only (never severity). Severity badges show icon + label.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Brand Amber */}
              <div>
                <span className="text-[11px] font-mono text-[#9aa0a6] block mb-1">BRAND AMBER</span>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-[#fe9a00] text-[#1a1203] font-bold text-center">
                    #fe9a00 (solid)
                  </div>
                  <div className="p-2 rounded bg-[#ffb454] text-[#1a1203] font-bold text-center">
                    #ffb454 (accent)
                  </div>
                  <div className="p-2 rounded bg-[#2d1f0b] text-[#ffb454] border border-[#fe9a00]/30 font-semibold text-center">
                    #2d1f0b (wash)
                  </div>
                </div>
              </div>

              {/* Severity Colors */}
              <div>
                <span className="text-[11px] font-mono text-[#9aa0a6] block mb-1">SEVERITY TOKENS (NEVER AMBER)</span>
                <div className="grid grid-cols-5 gap-1.5 text-[10px] font-mono text-center">
                  <div className="p-1.5 rounded bg-[#2b1218] border border-[#f4526b]/40 text-[#f4526b] font-semibold">
                    #f4526b CRIT
                  </div>
                  <div className="p-1.5 rounded bg-[#2b170c] border border-[#ff7a45]/40 text-[#ff7a45] font-semibold">
                    #ff7a45 HIGH
                  </div>
                  <div className="p-1.5 rounded bg-[#2b2513] border border-[#e9c46a]/40 text-[#e9c46a] font-semibold">
                    #e9c46a ELEV
                  </div>
                  <div className="p-1.5 rounded bg-[#0d281e] border border-[#3ddc97]/40 text-[#3ddc97] font-semibold">
                    #3ddc97 LOW
                  </div>
                  <div className="p-1.5 rounded bg-[#0f1f38] border border-[#5aa9ff]/40 text-[#5aa9ff] font-semibold">
                    #5aa9ff INFO
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 1. Buttons & Controls */}
      <section className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#fe9a00]" /> Buttons, Inputs & Controls
        </h2>
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">Button Variants (8px radius)</div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Primary Brand Amber</Button>
                <Button variant="secondary">Secondary Graphite</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive Non-Amber</Button>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">Sizes, Loading & Disabled States</div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="primary">Small (sm)</Button>
                <Button size="md" variant="primary">Medium (md)</Button>
                <Button size="lg" variant="primary">Large (lg)</Button>
                <Button
                  loading={buttonLoading}
                  variant="primary"
                  onClick={() => {
                    setButtonLoading(true);
                    setTimeout(() => setButtonLoading(false), 2000);
                  }}
                >
                  {buttonLoading ? "Executing Task..." : "Click to Test Loading"}
                </Button>
                <Button disabled variant="primary">Disabled Solid</Button>
                <Button disabled variant="secondary">Disabled Secondary</Button>
              </div>
            </div>

            {/* Inputs & Selects */}
            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">Form Primitives (Input, Select, Kbd)</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
                <Input
                  label="Search Target"
                  placeholder="e.g. prod-api-cluster"
                  value={textInputVal}
                  onChange={(e) => setTextInputVal(e.target.value)}
                  leftAdornment={<Search className="w-4 h-4" />}
                />
                <Select
                  label="Execution Strategy"
                  value={selectVal}
                  onChange={(e) => setSelectVal(e.target.value)}
                  options={[
                    { value: "auto", label: "Auto-calibrated" },
                    { value: "dry-run", label: "Dry Run Simulation" },
                    { value: "shadow", label: "Shadow Enforcement" },
                  ]}
                />
                <Input
                  label="Quota Token"
                  mono
                  defaultValue="0x9A4B...F1"
                  helperText="Tabular mono input"
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">Icon Buttons & Tags</div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Tooltip content="Launch attack scenario">
                    <IconButton icon={<Play className="w-4 h-4 text-[#fe9a00]" />} aria-label="Launch attack" />
                  </Tooltip>
                  <Tooltip content="Reset simulation state">
                    <IconButton icon={<RotateCcw className="w-4 h-4 text-[#9aa0a6]" />} aria-label="Reset simulation" />
                  </Tooltip>
                  <Tooltip content="System information">
                    <IconButton icon={<Info className="w-4 h-4 text-[#5f6368]" />} aria-label="Information" />
                  </Tooltip>
                </div>

                <div className="h-5 w-px bg-[rgba(255,255,255,0.1)]" />

                <div className="flex items-center gap-2">
                  <Tag variant="amber">MISSION CONSOLE</Tag>
                  <Tag variant="neutral">OPERATOR</Tag>
                  <Tag variant="neutral">STEP 01</Tag>
                  <StatusDot status="live" label="FEED ACTIVE" />
                  <StatusDot status="offline" label="STANDBY" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Badges, Severity & Provenance */}
      <section className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#f4526b]" /> Badges & Status Indicators
        </h2>
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">
                Incident Severity Badges (Icon + Label, Never Amber)
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SeverityBadge severity="CRITICAL" />
                <SeverityBadge severity="HIGH" />
                <SeverityBadge severity="ELEVATED" />
                <SeverityBadge severity="LOW" />
                <SeverityBadge severity="INFO" />
                <SeverityBadge severity="EMERGENCY_STOP" />
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">Provenance Badges</div>
              <div className="flex flex-wrap items-center gap-3">
                <ProvenanceBadge provenance="live" />
                <ProvenanceBadge provenance="replay" />
                <ProvenanceBadge provenance="simulated" />
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9aa0a6] font-mono uppercase mb-3">Pills & Connection Indicators</div>
              <div className="flex flex-wrap items-center gap-4">
                <ConnectionIndicator status="connected" lastSeq={142} latencyMs={8.4} />
                <ConnectionIndicator status="reconnecting" lastSeq={140} />
                <ConnectionIndicator status="stale" latencyMs={45.2} />
                <ConnectionIndicator status="disconnected" />
                <Pill label="SESSION" value="SF-01" variant="brand" />
                <Pill label="ROOM" value="HAK-4921" variant="default" />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 3. HeroCard, KpiCard & StepCard Showcase */}
      <section className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#fe9a00]" /> KPI Cards, Step Cards & Hero Cards
        </h2>

        {/* Hero Card */}
        <HeroCard>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag variant="amber">MISSION CONSOLE</Tag>
                <StatusDot status="live" label="CALIBRATED" />
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-[#f0f2f5]">
                Production Cluster Threat Monitoring
              </h3>
              <p className="text-sm text-[#9aa0a6] max-w-2xl">
                Dual-layer detection running live EWMA thresholding and LightGBM inference at &lt;10ms SLA.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="md">Audit Logs</Button>
              <Button variant="primary" size="md" icon={<Shield className="w-4 h-4" />}>
                Defense Active
              </Button>
            </div>
          </div>
        </HeroCard>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="THROUGHPUT"
            value="1,271"
            subtext="sustained peak load"
            trend={{ value: "+14.8%", positive: true }}
            icon={<Activity className="w-4 h-4 text-[#fe9a00]" />}
          />
          <KpiCard
            label="ACTIVE INCIDENTS"
            value="3"
            subtext="2 critical, 1 elevated"
            trend={{ value: "-25.0%", positive: true }}
            icon={<ShieldAlert className="w-4 h-4 text-[#f4526b]" />}
          />
          <KpiCard
            label="PIPELINE LATENCY"
            value="9.01 ms"
            subtext="SLA &lt; 500 ms"
            trend={{ value: "-4.2%", positive: true }}
            icon={<Cpu className="w-4 h-4 text-[#3ddc97]" />}
          />
          <KpiCard
            label="BRIER SCORE"
            value="0.041"
            subtext="calibrated confidence"
            icon={<TrendingUp className="w-4 h-4 text-[#ffb454]" />}
          />
        </div>

        {/* Guided Workflow Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StepCard
            stepNumber="01"
            title="Baseline Profiling"
            description="Extract historical request patterns and compute per-identity EWMA mean and variance."
            status="completed"
          />
          <StepCard
            stepNumber="02"
            title="Red Team Attack Execution"
            description="Inject participant attack vectors against targeted API endpoints with quota limits."
            status="active"
            actionLabel="View Scenarios"
            onAction={() => showToast.info("Step 02 Action", "Navigating to attack scenarios...")}
          />
          <StepCard
            stepNumber="03"
            title="Operator Incident Triage"
            description="Examine calibrated alerts, verify cryptographic hashes, and execute response mitigations."
            status="pending"
          />
        </div>
      </section>

      {/* 4. Visualizations: Gauge & Time Series */}
      <section className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#fe9a00]" /> Visualizations & Charts
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gauge Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Threat Level Gauge</CardTitle>
              <CardDescription>240° arc with calibrated threshold bands</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-4">
              <Gauge value={gaugeValue} label="Overall Threat" />
              <div className="w-full max-w-xs flex flex-col items-center gap-1.5">
                <span className="text-xs font-mono text-[#9aa0a6]">Interactive Value: {gaugeValue}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={gaugeValue}
                  onChange={(e) => setGaugeValue(Number(e.target.value))}
                  className="w-full accent-[#fe9a00] cursor-pointer"
                />
              </div>
            </CardContent>
          </Card>

          {/* Time Series Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Event Rate vs. Adaptive Baseline</CardTitle>
              <CardDescription>Multi-series responsive area chart with dark graphite styling</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeSeriesChart
                data={sampleTimeSeriesData}
                series={[
                  { key: "requests", name: "Observed Requests/s", color: "#fe9a00", fillOpacity: 0.25 },
                  { key: "baseline", name: "Adaptive Baseline", color: "#5aa9ff", fillOpacity: 0.12 },
                ]}
                height={220}
                yUnit="req/s"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 5. Virtualized Data Table */}
      <section className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
          <Server className="w-4 h-4 text-[#fe9a00]" /> Virtualized Data Table
        </h2>
        <DataTable
          data={sampleTableData}
          columns={sampleTableColumns}
          onRowClick={(row) => showToast.info(`Selected ${row.id}`, `Rule: ${row.rule}`)}
        />
      </section>

      {/* 6. Tabs, Dialogs, Drawers & CodeBlock */}
      <section className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-[#9aa0a6] flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#fe9a00]" /> Interactive Modals & Drawers
        </h2>
        <Tabs
          items={[
            {
              value: "modals",
              label: "Dialogs & Drawers",
              content: (
                <Card>
                  <CardContent className="space-y-4 pt-4">
                    <p className="text-sm text-[#9aa0a6]">
                      Accessible Dialogs and slide-out Drawers styled with graphite `#111417` and hairline borders.
                    </p>
                    <div className="flex gap-3">
                      <Button onClick={() => setDialogOpen(true)}>Open Modal Dialog</Button>
                      <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open Incident Drawer</Button>
                    </div>

                    <Dialog
                      open={dialogOpen}
                      onOpenChange={setDialogOpen}
                      title="Cryptographic Evidence Verification"
                      description="Validating SHA-256 tamper-evident hash chain for incident inc_01"
                    >
                      <div className="space-y-4">
                        <KeyValueList
                          items={[
                            { key: "hash", label: "Evidence Hash", value: "8f9f210a4d50...", copyable: "8f9f210a4d50293bd299f2", mono: true },
                            { key: "status", label: "Chain Status", value: "VERIFIED INTACT" },
                          ]}
                        />
                        <div className="flex justify-end gap-2 pt-2">
                          <Button size="sm" variant="secondary" onClick={() => setDialogOpen(false)}>Close</Button>
                        </div>
                      </div>
                    </Dialog>

                    <Drawer
                      open={drawerOpen}
                      onClose={() => setDrawerOpen(false)}
                      title="Incident Drilldown: inc_01"
                      description="MITRE ATT&CK T1110 Brute Force Detection"
                    >
                      <div className="space-y-4">
                        <SeverityBadge severity="CRITICAL" />
                        <KeyValueList
                          items={[
                            { key: "id", label: "Target Identity", value: "usr_alice", copyable: "usr_alice", mono: true },
                            { key: "score", label: "Calibrated Score", value: "94.2%", mono: true },
                            { key: "floor", label: "Hard Rule Floor", value: "0.85 (Enforced)", mono: true },
                          ]}
                        />
                        <CodeBlock
                          code={JSON.stringify({
                            incident_id: "inc_01",
                            rule: "T1110",
                            technique: "Brute Force",
                            confidence: 0.942,
                            features: { auth_failure_ratio_30s: 0.92, requests_5s: 140 },
                          }, null, 2)}
                        />
                      </div>
                    </Drawer>
                  </CardContent>
                </Card>
              ),
            },
            {
              value: "states",
              label: "Loading & Empty States",
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EmptyState
                    title="No Suspicious Anomalies"
                    description="All observed traffic is within the per-identity EWMA baseline tolerance."
                  />
                  <ErrorState
                    title="Stream Disconnected"
                    message="Degraded to local buffer. Reconnecting automatically."
                    onRetry={() => showToast.info("Retrying connection...")}
                  />
                </div>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

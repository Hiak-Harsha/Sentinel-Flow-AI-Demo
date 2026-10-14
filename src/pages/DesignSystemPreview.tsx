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
  CardFooter,
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
} from "lucide-react";

export default function DesignSystemPreview() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [gaugeValue, setGaugeValue] = useState(78);

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
        <span className="font-mono font-bold text-cyan-400">
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
    <div className="space-y-10 pb-16">
      <PageHeader
        title="Design System & Component Library"
        description="Core design tokens and accessible component primitives verified against WCAG AA contrast standards."
        badge={<Badge variant="cyan" dot>v3.0 Tokens</Badge>}
        actions={
          <div className="flex gap-2">
            <Button
              variant="accent"
              size="sm"
              icon={<Sparkles className="w-4 h-4" />}
              onClick={() => showToast.success("Tokens verified", "WCAG AA contrast ≥ 4.5:1 compliant.")}
            >
              Verify System
            </Button>
          </div>
        }
      />

      {/* 1. Buttons & IconButtons */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400" /> Buttons & Controls
        </h2>
        <Card variant="default">
          <CardContent className="space-y-6">
            <div>
              <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Variants</div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Primary Cyan</Button>
                <Button variant="accent">Accent Gradient</Button>
                <Button variant="secondary">Secondary Slate</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive Rose</Button>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Sizes & States</div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary">Small (sm)</Button>
                <Button size="md" variant="secondary">Medium (md)</Button>
                <Button size="lg" variant="secondary">Large (lg)</Button>
                <Button
                  loading={buttonLoading}
                  variant="primary"
                  onClick={() => {
                    setButtonLoading(true);
                    setTimeout(() => setButtonLoading(false), 2000);
                  }}
                >
                  {buttonLoading ? "Simulating..." : "Click to Test Loading"}
                </Button>
                <Button disabled variant="primary">Disabled</Button>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Icon Buttons & Tooltips</div>
              <div className="flex items-center gap-3">
                <Tooltip content="Launch attack scenario">
                  <IconButton icon={<Play className="w-4 h-4 text-cyan-400" />} aria-label="Launch attack" />
                </Tooltip>
                <Tooltip content="Reset simulation state">
                  <IconButton icon={<RotateCcw className="w-4 h-4 text-amber-400" />} aria-label="Reset simulation" />
                </Tooltip>
                <Tooltip content="Information details">
                  <IconButton icon={<Info className="w-4 h-4 text-slate-400" />} aria-label="Information" />
                </Tooltip>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Badges, Severity & Provenance */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-400" /> Badges & Status Indicators
        </h2>
        <Card>
          <CardContent className="space-y-6">
            <div>
              <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Incident Severity Badges (WCAG AA)</div>
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
              <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Provenance Badges</div>
              <div className="flex flex-wrap items-center gap-3">
                <ProvenanceBadge provenance="live" />
                <ProvenanceBadge provenance="replay" />
                <ProvenanceBadge provenance="simulated" />
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase font-semibold mb-3">Connection Status Indicators</div>
              <div className="flex flex-wrap items-center gap-4">
                <ConnectionIndicator status="connected" lastSeq={142} latencyMs={8.4} />
                <ConnectionIndicator status="reconnecting" lastSeq={140} />
                <ConnectionIndicator status="stale" latencyMs={45.2} />
                <ConnectionIndicator status="disconnected" />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 3. KPI Stats & Gauges */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" /> KPI Stats & Visual Gauges
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="Throughput"
            value="1,271"
            subtext="events / second"
            change={14.8}
            sparkline={<Sparkline data={[20, 35, 45, 60, 55, 75, 90]} color="#22d3ee" />}
          />
          <Stat
            label="Active Incidents"
            value="3"
            subtext="2 Critical, 1 High"
            change={-25.0}
            variant="critical"
            sparkline={<Sparkline data={[5, 4, 4, 3, 3, 2, 3]} color="#f43f5e" />}
          />
          <Stat
            label="p95 Pipeline Latency"
            value="9.01 ms"
            subtext="Sustained load SLA < 500ms"
            change={-4.2}
            variant="success"
            sparkline={<Sparkline data={[12, 11, 10, 9.5, 9.1, 9.01]} color="#10b981" />}
          />
          <Stat
            label="Model Brier Score"
            value="0.041"
            subtext="Platt calibrated (OOF)"
            variant="cyan"
            sparkline={<Sparkline data={[0.08, 0.06, 0.05, 0.045, 0.041]} color="#06b6d4" />}
          />
        </div>

        {/* Gauge Card */}
        <Card>
          <CardHeader>
            <CardTitle>Threat Level Gauge</CardTitle>
            <CardDescription>Real-time threat level gauge with 240° arc and color bands</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-around gap-6">
            <Gauge value={25} label="Low Risk" />
            <Gauge value={52} label="Elevated" />
            <Gauge value={gaugeValue} label="High Threat" />
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-slate-400">Interactive Test</span>
              <input
                type="range"
                min="0"
                max="100"
                value={gaugeValue}
                onChange={(e) => setGaugeValue(Number(e.target.value))}
                className="w-36 accent-cyan-400"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. Charts & Visualizations */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" /> Time Series Visualization
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Event Rate vs. Baseline Band</CardTitle>
            <CardDescription>Multi-series responsive area chart with dark styling and custom tooltips</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={sampleTimeSeriesData}
              series={[
                { key: "requests", name: "Observed Requests/s", color: "#22d3ee", fillOpacity: 0.35 },
                { key: "baseline", name: "Adaptive Baseline", color: "#6366f1", fillOpacity: 0.15 },
              ]}
              height={220}
              yUnit="req/s"
            />
          </CardContent>
        </Card>
      </section>

      {/* 5. Virtualized Data Table */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Server className="w-5 h-5 text-cyan-400" /> Virtualized Data Table
        </h2>
        <DataTable
          data={sampleTableData}
          columns={sampleTableColumns}
          onRowClick={(row) => showToast.info(`Selected ${row.id}`, `Rule: ${row.rule}`)}
        />
      </section>

      {/* 6. Tabs, Modals, Drawers, CodeBlock */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-amber-400" /> Layout & Interactive Primitives
        </h2>
        <Tabs
          items={[
            {
              value: "modals",
              label: "Dialogs & Drawers",
              content: (
                <Card>
                  <CardContent className="space-y-4 pt-4">
                    <p className="text-sm text-slate-400">
                      Accessible Radix UI Dialogs and slide-out Drawers for incident response and inspections.
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
                    title="Redis Stream Disconnected"
                    message="Degraded to in-process memory queue. Falling back gracefully."
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

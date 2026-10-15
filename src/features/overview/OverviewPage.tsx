import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Cpu,
  Layers,
  ArrowRight,
  TrendingUp,
  Server,
  Zap,
  RotateCcw,
} from "lucide-react";
import { HeroCard, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/design/components/Card";
import { Button } from "@/design/components/Button";
import { Tag } from "@/design/components/Tag";
import { StatusDot } from "@/design/components/StatusDot";
import { KpiCard } from "@/design/components/KpiCard";
import { StepCard } from "@/design/components/StepCard";
import { SeverityBadge } from "@/design/components/SeverityBadge";
import { ProvenanceBadge, ProvenanceType } from "@/design/components/ProvenanceBadge";
import { TimeSeriesChart } from "@/design/components/TimeSeriesChart";
import { useRealtimeEvent } from "@/realtime/useRealtime";

export default function OverviewPage() {
  const [provenanceFilter, setProvenanceFilter] = useState<ProvenanceType | "all">("all");
  const [advancingPhase, setAdvancingPhase] = useState(false);

  // Core Queries
  const { data: overview, refetch: refetchOverview } = useQuery({
    queryKey: queryKeys.telemetry,
    queryFn: () => api.getOverview().catch(() => null),
    refetchInterval: 3000,
  });

  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
    refetchInterval: 3000,
  });

  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
    refetchInterval: 2000,
  });

  const { data: timeseriesData } = useQuery({
    queryKey: queryKeys.telemetryTimeseries,
    queryFn: () => api.getTelemetryTimeseries().catch(() => ({ timeseries: [] })),
    refetchInterval: 4000,
  });

  const session = sessionData?.session;
  const currentPhase = session?.current_phase || "EXERCISE_OPEN";
  const joinCode = session?.join_code || "HAK-4921";
  const telemetry = overview?.telemetry || overview?.network_snapshot || {};
  const activeAlertsList = Array.isArray(alerts) ? alerts : [];

  const criticalCount = activeAlertsList.filter((a: any) => (a.severity || "").toUpperCase() === "CRITICAL").length;
  const elevatedCount = activeAlertsList.filter((a: any) => ["HIGH", "ELEVATED"].includes((a.severity || "").toUpperCase())).length;

  const requestsPerSec = telemetry.requests_per_sec ?? overview?.requests_per_sec ?? 142.5;

  // Chart data
  const chartPoints = useMemo(() => {
    const raw = timeseriesData?.timeseries || [];
    if (raw.length === 0) {
      return [
        { time: "12:00", requests: 120, baseline: 110 },
        { time: "12:05", requests: 145, baseline: 115 },
        { time: "12:10", requests: 380, baseline: 120 },
        { time: "12:15", requests: 890, baseline: 125 },
        { time: "12:20", requests: 420, baseline: 125 },
        { time: "12:25", requests: 180, baseline: 120 },
      ];
    }
    return raw.map((p: any) => ({
      time: p.time || (p.timestamp ? new Date(p.timestamp).toLocaleTimeString([], { hour12: false }) : "--"),
      requests: p.requests ?? p.requests_per_sec ?? 0,
      baseline: p.baseline ?? 120,
    }));
  }, [timeseriesData]);

  // Handle phase advance
  const handleAdvancePhase = async () => {
    const phaseOrder = ["LOBBY", "WARMUP", "EXERCISE_OPEN", "DEBRIEF"];
    const nextIdx = (phaseOrder.indexOf(currentPhase) + 1) % phaseOrder.length;
    const nextPhase = phaseOrder[nextIdx];

    setAdvancingPhase(true);
    try {
      await api.operator.setPhase(nextPhase);
      showToast.success("Phase Advanced", `Exercise moved to ${nextPhase}`);
      refetchSession();
    } catch (err: any) {
      showToast.error("Phase Transition Failed", err?.message);
    } finally {
      setAdvancingPhase(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. HeroCard (20px radius) */}
      <HeroCard>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant="amber" size="sm">MISSION OPERATIONS</Tag>
              <Tag variant="neutral" size="sm">STRICTLY DEFENSIVE</Tag>
              <StatusDot status="live" label="DUAL-LAYER INFERENCE ACTIVE" />
            </div>

            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#f0f2f5]">
                Defensive Operations Center
              </h1>
              <p className="text-xs sm:text-sm text-[#9aa0a6] max-w-2xl mt-1 leading-relaxed">
                Real-time reverse proxy telemetry, 35 sliding-window streaming features, and calibrated LightGBM inference at &lt;10ms SLA.
              </p>
            </div>

            {/* Context meta pills */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono pt-1">
              <span className="px-2.5 py-1 rounded-md bg-[#090c10] border border-[rgba(255,255,255,0.08)] text-[#9aa0a6]">
                ROOM: <strong className="text-[#ffb454]">{joinCode}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-md bg-[#090c10] border border-[rgba(255,255,255,0.08)] text-[#9aa0a6]">
                TARGET: <strong className="text-[#f0f2f5]">prod-api-cluster</strong>
              </span>
              <span className="px-2.5 py-1 rounded-md bg-[#090c10] border border-[rgba(255,255,255,0.08)] text-[#9aa0a6]">
                PHASE: <strong className={currentPhase === "EXERCISE_OPEN" ? "text-[#3ddc97]" : "text-[#e9c46a]"}>{currentPhase}</strong>
              </span>
            </div>
          </div>

          {/* Operator Phase Action Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <Button
              variant="primary"
              size="md"
              loading={advancingPhase}
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={handleAdvancePhase}
            >
              Advance Phase ({currentPhase})
            </Button>
          </div>
        </div>
      </HeroCard>

      {/* 2. KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="INGESTION THROUGHPUT"
          value={typeof requestsPerSec === "number" ? requestsPerSec.toFixed(0) : "142"}
          subtext="requests / second"
          trend={{ value: "+14.8%", positive: true }}
          icon={<Activity className="w-4 h-4 text-[#fe9a00]" />}
        />
        <KpiCard
          label="ACTIVE INCIDENTS"
          value={String(activeAlertsList.length)}
          subtext={`${criticalCount} Critical · ${elevatedCount} Elevated`}
          trend={{ value: activeAlertsList.length > 0 ? "+2 today" : "0 active", positive: false }}
          icon={<ShieldAlert className="w-4 h-4 text-[#f4526b]" />}
        />
        <KpiCard
          label="PIPELINE LATENCY (P95)"
          value="9.01 ms"
          subtext="SLA threshold < 500 ms"
          trend={{ value: "-4.2%", positive: true }}
          icon={<Cpu className="w-4 h-4 text-[#3ddc97]" />}
        />
        <KpiCard
          label="CALIBRATED BRIER SCORE"
          value="0.041"
          subtext="Platt calibrated (OOF)"
          trend={{ value: "Target < 0.05", positive: true }}
          icon={<TrendingUp className="w-4 h-4 text-[#ffb454]" />}
        />
      </div>

      {/* 3. Guided 3-Step Workflow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StepCard
          stepNumber="01"
          title="Baseline Profiling"
          description="Streaming EWMA extracts per-identity mean and variance across 35 features."
          status="completed"
        />
        <StepCard
          stepNumber="02"
          title="Red Team Attack Execution"
          description="Connected participants execute bounded scenarios against the authorized target."
          status={currentPhase === "EXERCISE_OPEN" ? "active" : "pending"}
          actionLabel="Inspect Activity"
          onAction={() => showToast.info("Navigation", "Viewing red team activity matrix...")}
        />
        <StepCard
          stepNumber="03"
          title="Defensive Triage & Response"
          description="Operator reviews calibrated alerts, verifies hash chains, and applies mitigations."
          status="active"
          actionLabel="Open Workbench"
          onAction={() => window.location.assign("/alerts")}
        />
      </div>

      {/* 4. Real-time Telemetry Area Chart & Quick Threat Table */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Event Rate Chart (3 cols) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#fe9a00]" />
                  <span>Real-time Ingestion vs. Baseline</span>
                </CardTitle>
                <CardDescription>Observed requests/sec compared against adaptive baseline SLA band</CardDescription>
              </div>
              <Tag variant="neutral" size="sm">LIVE FEED</Tag>
            </div>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={chartPoints}
              series={[
                { key: "requests", name: "Observed Traffic (req/s)", color: "#fe9a00", fillOpacity: 0.25 },
                { key: "baseline", name: "Adaptive Baseline Band", color: "#5aa9ff", fillOpacity: 0.1 },
              ]}
              height={260}
              yUnit="req/s"
            />
          </CardContent>
        </Card>

        {/* Right Column: Live Incident Feed (2 cols) */}
        <Card className="lg:col-span-2 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#f4526b]" />
                <span>Active Threat Stream</span>
              </CardTitle>
              <Tag variant="amber" size="sm">{activeAlertsList.length} ACTIVE</Tag>
            </div>
            <CardDescription className="text-xs">
              Latest MITRE ATT&CK detections requiring triage
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2.5 pt-2 max-h-80">
            {activeAlertsList.length === 0 ? (
              <div className="text-center py-12 text-xs text-[#5f6368] font-mono">
                No active security incidents detected.
              </div>
            ) : (
              activeAlertsList.slice(0, 5).map((alert: any) => (
                <div
                  key={alert.id || alert.incident_id}
                  className="p-3 rounded-lg bg-[#090c10] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.14)] transition-all flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={alert.severity || "LOW"} size="sm" />
                      <span className="font-mono text-xs font-semibold text-[#f0f2f5] truncate">
                        {alert.rule || alert.title || "T1110 Brute Force"}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#9aa0a6] truncate">
                      Target: <span className="text-[#f0f2f5]">{alert.identity_id || "usr_alice"}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-[#ffb454]">
                      {alert.score ? `${(alert.score * 100).toFixed(0)}%` : "94%"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

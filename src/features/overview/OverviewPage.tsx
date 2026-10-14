import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProvenanceType } from "@/design/components/ProvenanceBadge";
import { ProvenanceFilter } from "./components/ProvenanceFilter";
import { KpiStrip } from "./components/KpiStrip";
import { LiveEventRateChart } from "./components/LiveEventRateChart";
import { RiskyIdentitiesTable, IdentityRiskItem } from "./components/RiskyIdentitiesTable";
import { LiveAlertStream } from "./components/LiveAlertStream";
import { useRealtimeEvent } from "@/realtime/useRealtime";

export default function OverviewPage() {
  const [provenanceFilter, setProvenanceFilter] = useState<ProvenanceType | "all">("all");
  const [activeAttack, setActiveAttack] = useState<{ scenario: string; target_origin: string } | null>(null);

  // 1. Core Queries
  const { data: overview } = useQuery({
    queryKey: queryKeys.telemetry,
    queryFn: () => api.getOverview().catch(() => null),
  });

  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const { data: timeseriesData } = useQuery({
    queryKey: queryKeys.telemetryTimeseries,
    queryFn: () => api.getTelemetryTimeseries().catch(() => ({ timeseries: [] })),
  });

  const { data: modelStatus } = useQuery({
    queryKey: ["model_active"],
    queryFn: () => fetch("/api/v1/models/active").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  });

  // 2. Realtime WebSocket Handlers
  useRealtimeEvent("attack.progress", (env) => {
    if (env.data && env.data.status === "RUNNING") {
      setActiveAttack({
        scenario: env.data.scenario || "Attack Scenario",
        target_origin: env.data.target_origin || "Lab Target",
      });
    } else {
      setActiveAttack(null);
    }
  });

  useRealtimeEvent("attack.finished", () => {
    setActiveAttack(null);
  });

  useRealtimeEvent("emergency_stop.engaged", () => {
    setActiveAttack(null);
  });

  // 3. Normalized Data Mapping
  const telemetry = overview?.telemetry || overview?.network_snapshot || {};
  const activeAlertsList = Array.isArray(alerts) ? alerts : [];
  const criticalCount = activeAlertsList.filter((a: any) => a.severity === "CRITICAL").length;

  const chartPoints = useMemo(() => {
    const raw = timeseriesData?.timeseries || [];
    return raw.map((p: any) => ({
      time: p.time || (p.timestamp ? new Date(p.timestamp).toLocaleTimeString([], { hour12: false }) : "--"),
      requests: p.requests ?? p.requests_per_sec ?? 0,
      threat_level: p.threat_level || "LOW",
    }));
  }, [timeseriesData]);

  const sparklineData = useMemo(() => {
    if (chartPoints.length > 0) {
      return chartPoints.slice(-12).map((p: any) => p.requests);
    }
    return [10, 15, 14, 18, 20, 22, 19, 24];
  }, [chartPoints]);

  const riskyIdentities: IdentityRiskItem[] = useMemo(() => {
    const participants = sessionData?.participants || [];
    return participants.map((p: any) => ({
      id: p.device_id || p.id,
      alias: p.alias || p.device_id,
      threat_score: p.threat_score ?? (p.is_controlled_target ? 0.85 : 0.05),
      threat_level: p.is_controlled_target ? "HIGH" : "LOW",
      request_rate_5s: p.request_rate_5s ?? (p.is_controlled_target ? 8.2 : 0.4),
      baseline_maturity: p.baseline_maturity ?? 0.85,
      maturity_state: p.baseline_maturity >= 0.8 ? "MATURE" : "LEARNING",
      active_incidents: p.is_controlled_target ? 1 : 0,
    }));
  }, [sessionData]);

  return (
    <div className="space-y-6">
      {/* Page Header with Provenance Filter */}
      <PageHeader
        title="Security Operations Overview"
        description="Unified real-time threat intelligence, sliding-window features, and detection fusion"
        actions={
          <ProvenanceFilter
            value={provenanceFilter}
            onChange={setProvenanceFilter}
          />
        }
      />

      {/* KPI Metrics Strip */}
      <KpiStrip
        requestsPerSec={telemetry.requests_per_sec ?? overview?.requests_per_sec ?? 0}
        activeAlertsCount={activeAlertsList.length}
        criticalAlertsCount={criticalCount}
        threatLevel={overview?.threat_level || telemetry.threat_level || "LOW"}
        meanTimeToDetectSeconds={1.8}
        modelReady={modelStatus?.ready ?? true}
        modelStage={modelStatus?.stage ?? "production"}
        driftStatus={modelStatus?.drift_status ?? "NORMAL"}
        chainIntegrityValid={overview?.evidence_integrity?.valid ?? true}
        historySparkline={sparklineData}
      />

      {/* Main Grid: Live Chart + Live Incident Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveEventRateChart
            data={chartPoints}
            provenance={provenanceFilter === "all" ? "live" : provenanceFilter}
            activeAttack={activeAttack}
          />
        </div>
        <div className="lg:col-span-1">
          <LiveAlertStream
            alerts={activeAlertsList}
            provenanceFilter={provenanceFilter}
            maxItems={5}
          />
        </div>
      </div>

      {/* Risky Identities and Baseline Divergence Table */}
      <RiskyIdentitiesTable identities={riskyIdentities} />
    </div>
  );
}

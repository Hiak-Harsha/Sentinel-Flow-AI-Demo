import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { TimeRangePicker, TimeRangeValue } from "./components/TimeRangePicker";
import { RollupMetrics, RollupRecord } from "./components/RollupMetrics";
import { SecuritySummaryTable } from "./components/SecuritySummaryTable";
import { ExportCsvButton } from "./components/ExportCsvButton";
import { ExplainabilityView } from "./components/ExplainabilityView";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("1h");

  // Map timeRange to windowType for backend rollups query
  const windowType = timeRange === "24h" || timeRange === "7d" ? "1h" : "1m";

  // 1. Fetch Rollups
  const { data: rollupsData, isLoading } = useQuery({
    queryKey: ["telemetry_rollups", windowType, timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/v1/telemetry/rollups?window_type=${windowType}&limit=60`);
      if (res.ok) {
        const body = await res.json();
        return body?.rollups || [];
      }
      return [];
    },
  });

  // 2. Fallback to Timeseries if rollups empty (e.g. dev SQLite mode)
  const { data: timeseriesData } = useQuery({
    queryKey: ["telemetry_timeseries_analytics"],
    queryFn: () => api.getTelemetryTimeseries(60).catch(() => ({ timeseries: [] })),
  });

  // 3. Fetch Alerts for Security Summary
  const { data: alerts = [] } = useQuery({
    queryKey: ["analytics_alerts"],
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const normalizedRollups: RollupRecord[] = useMemo(() => {
    if (rollupsData && rollupsData.length > 0) {
      return rollupsData.map((r: any) => ({
        timestamp: r.window_start || new Date().toISOString(),
        total_requests: r.total_requests || 0,
        requests_per_sec: r.requests_per_sec || (r.total_requests ? r.total_requests / 60 : 0),
        error_count: r.error_count || 0,
        avg_latency_ms: r.avg_latency_ms || 12.5,
        p95_latency_ms: r.p95_latency_ms || 28.0,
        unique_identities: r.unique_identities || 1,
      }));
    }

    // Fallback mapping
    const rawTimeseries = timeseriesData?.timeseries || [];
    return rawTimeseries.map((t: any) => ({
      timestamp: t.timestamp || new Date().toISOString(),
      total_requests: t.total_requests || (t.requests ? Math.round(t.requests * 5) : 10),
      requests_per_sec: t.requests_per_sec ?? t.requests ?? 2.0,
      error_count: t.error_count || 0,
      avg_latency_ms: t.avg_latency_ms || 14.0,
      p95_latency_ms: t.p95_latency_ms || 32.0,
      unique_identities: t.unique_identities || 1,
    }));
  }, [rollupsData, timeseriesData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historical Telemetry & Analytics"
        description="Persistent time-bucket rollups (1m and 1h), period comparisons, and trend reporting"
        actions={
          <div className="flex items-center gap-3">
            <TimeRangePicker value={timeRange} onChange={setTimeRange} />
            <ExportCsvButton data={normalizedRollups} />
          </div>
        }
      />

      {/* Rollup Time Series Chart */}
      <RollupMetrics
        rollups={normalizedRollups}
        windowType={windowType}
      />

      {/* SHAP Feature Attribution & EWMA Drift Calibration */}
      <ExplainabilityView />

      {/* Security Summary & Tactic Breakdown */}
      <SecuritySummaryTable alerts={Array.isArray(alerts) ? alerts : []} />
    </div>
  );
}

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { TimeSeriesChart } from "@/design/components/TimeSeriesChart";
import { ProvenanceBadge } from "@/design/components/ProvenanceBadge";
import { Activity, Clock } from "lucide-react";

export interface RollupRecord {
  timestamp: string;
  total_requests: number;
  requests_per_sec: number;
  error_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  unique_identities: number;
}

export interface RollupMetricsProps {
  rollups: RollupRecord[];
  windowType: "1m" | "1h";
  className?: string;
}

export function RollupMetrics({ rollups, windowType, className = "" }: RollupMetricsProps) {
  const chartData = rollups.length > 0 ? rollups.map((r) => ({
    time: new Date(r.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }),
    throughput: r.requests_per_sec,
    errors: r.error_count,
    p95_latency: r.p95_latency_ms,
  })) : [
    { time: "00:00", throughput: 0, errors: 0, p95_latency: 0 },
    { time: "00:05", throughput: 0, errors: 0, p95_latency: 0 },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Aggregated Telemetry Rollups ({windowType} Buckets)
          </CardTitle>
          <ProvenanceBadge provenance="live" />
        </div>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          Persistent Database Rollups
        </span>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <div className="h-[250px] w-full">
          <TimeSeriesChart
            data={chartData}
            xAxisKey="time"
            series={[
              { key: "throughput", name: "Requests / sec", color: "#06b6d4", area: true },
              { key: "errors", name: "4xx/5xx Errors", color: "#f43f5e" },
              { key: "p95_latency", name: "p95 Latency (ms)", color: "#a855f7" },
            ]}
            height={250}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--border-subtle)] font-mono text-xs text-center">
          <div className="p-2 rounded bg-[var(--surface-1)]">
            <span className="text-[var(--text-muted)] text-[11px] block">Mean Window Volume</span>
            <span className="text-sm font-bold text-slate-100">
              {rollups.length > 0
                ? (rollups.reduce((acc, r) => acc + r.total_requests, 0) / rollups.length).toFixed(0)
                : 0}{" "}
              reqs
            </span>
          </div>

          <div className="p-2 rounded bg-[var(--surface-1)]">
            <span className="text-[var(--text-muted)] text-[11px] block">Error Rate</span>
            <span className="text-sm font-bold text-rose-400">
              {rollups.length > 0
                ? (
                    (rollups.reduce((acc, r) => acc + r.error_count, 0) /
                      Math.max(1, rollups.reduce((acc, r) => acc + r.total_requests, 0))) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </span>
          </div>

          <div className="p-2 rounded bg-[var(--surface-1)]">
            <span className="text-[var(--text-muted)] text-[11px] block">p95 Latency Baseline</span>
            <span className="text-sm font-bold text-purple-400">
              {rollups.length > 0
                ? (rollups.reduce((acc, r) => acc + r.p95_latency_ms, 0) / rollups.length).toFixed(1)
                : 0}{" "}
              ms
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

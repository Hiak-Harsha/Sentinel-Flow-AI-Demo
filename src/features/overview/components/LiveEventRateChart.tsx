import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { TimeSeriesChart } from "@/design/components/TimeSeriesChart";
import { ProvenanceBadge, ProvenanceType } from "@/design/components/ProvenanceBadge";
import { ShieldAlert, Zap } from "lucide-react";

export interface DataPoint {
  time: string;
  requests: number;
  threat_level?: string;
  attack_scenario?: string | null;
}

export interface LiveEventRateChartProps {
  data: DataPoint[];
  provenance?: ProvenanceType;
  activeAttack?: {
    scenario: string;
    target_origin: string;
  } | null;
  className?: string;
}

export function LiveEventRateChart({
  data,
  provenance = "live",
  activeAttack = null,
  className = "",
}: LiveEventRateChartProps) {
  // Ensure we always have non-empty time series data for render
  const chartData = data.length > 0 ? data : [
    { time: "00:00", requests: 0 },
    { time: "00:05", requests: 0 },
  ];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-[var(--text-secondary)]">
            Network Event Throughput & Attack Overlays
          </CardTitle>
          <ProvenanceBadge provenance={provenance} />
        </div>

        {activeAttack && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono animate-pulse">
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            <span>Active Scenario: {activeAttack.scenario}</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-4">
        <div className="h-[260px] w-full">
          <TimeSeriesChart
            data={chartData}
            xAxisKey="time"
            series={[
              {
                key: "requests",
                name: "Requests / sec",
                color: activeAttack ? "#f43f5e" : "#06b6d4",
                area: true,
              },
            ]}
            height={260}
          />
        </div>

        <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
            5-second sliding window telemetry
          </span>
          <span>Sampled at 1 Hz via WebSocket</span>
        </div>
      </CardContent>
    </Card>
  );
}

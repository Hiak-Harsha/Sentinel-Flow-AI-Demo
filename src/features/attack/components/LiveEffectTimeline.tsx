import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { Zap, Activity, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface EffectItem {
  id?: string;
  timestamp?: string;
  status_code?: number;
  method?: string;
  path?: string;
  latency_ms?: number;
  anomaly_flag?: boolean;
}

export interface LiveEffectTimelineProps {
  runStatus?: {
    run_id?: string;
    scenario?: string;
    status?: string;
    requests_sent?: number;
    error_count?: number;
    duration_seconds?: number;
    elapsed_seconds?: number;
  } | null;
  effects: EffectItem[];
  className?: string;
}

export function LiveEffectTimeline({
  runStatus,
  effects,
  className = "",
}: LiveEffectTimelineProps) {
  const isRunning = runStatus?.status === "RUNNING";
  const progressPct = runStatus && runStatus.duration_seconds
    ? Math.min(100, Math.round(((runStatus.elapsed_seconds || 0) / runStatus.duration_seconds) * 100))
    : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Live Scenario Progress & Traffic Effects
          </CardTitle>
        </div>
        {runStatus && (
          <Badge variant={isRunning ? "danger" : "subtle"} size="sm">
            {runStatus.status || "IDLE"}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Progress Bar */}
        {runStatus && (
          <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2 text-xs">
            <div className="flex justify-between items-center font-mono">
              <span className="text-[var(--text-muted)]">
                Scenario: <strong className="text-[var(--text-primary)]">{runStatus.scenario}</strong>
              </span>
              <span className="text-cyan-400 font-semibold">{progressPct}%</span>
            </div>

            <div className="w-full bg-[var(--surface-3)] h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isRunning ? "bg-rose-500" : "bg-cyan-500"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono pt-1">
              <span>Sent: {runStatus.requests_sent || 0} reqs</span>
              <span>Errors (4xx/5xx): {runStatus.error_count || 0}</span>
              <span>Elapsed: {runStatus.elapsed_seconds || 0}s</span>
            </div>
          </div>
        )}

        {/* Realtime Event Stream / Timeline */}
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto font-mono text-xs pr-1">
          {effects.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)] font-sans">
              No live effects recorded yet. Launch an attack scenario to observe traffic impact.
            </div>
          ) : (
            effects.slice(0, 30).map((eff, idx) => {
              const isError = (eff.status_code || 200) >= 400;
              return (
                <div
                  key={eff.id || idx}
                  className="p-2 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                        isError ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {eff.status_code || 200}
                    </span>
                    <span className="text-[var(--text-muted)]">{eff.method || "POST"}</span>
                    <span className="text-[var(--text-primary)] truncate">{eff.path || "/api/v1/login"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[var(--text-muted)] shrink-0">
                    <span>{eff.latency_ms?.toFixed(1) || 12.0}ms</span>
                    {eff.anomaly_flag && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Flagged Anomalous" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

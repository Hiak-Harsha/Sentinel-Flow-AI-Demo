import React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { TimeSeriesChart } from "@/design/components/TimeSeriesChart";
import { Button } from "@/design/components/Button";
import {
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
  Activity,
  Layers,
  Target,
  ExternalLink,
  Laptop,
} from "lucide-react";

export interface IdentityDetailProps {
  identityId: string;
  alias?: string;
  isControlledTarget?: boolean;
  onToggleControlledTarget?: (id: string) => void;
  features?: Record<string, any>;
  baselineStats?: {
    ewma_rate_mean?: number;
    ewma_rate_std?: number;
    baseline_maturity?: number;
    maturity_state?: string;
  };
  assessment?: {
    fused_score?: number;
    threat_level?: string;
    supervised_prob?: number;
    unsupervised_score?: number;
    conformal_status?: string;
    explanation?: Array<{ feature: string; impact: string; description: string }>;
  };
  linkedAlerts?: Array<{
    alert_id?: string;
    id?: string;
    title?: string;
    severity?: string;
    status?: string;
    timestamp?: string;
  }>;
  className?: string;
}

export function IdentityDetailView({
  identityId,
  alias,
  isControlledTarget = false,
  onToggleControlledTarget,
  features = {},
  baselineStats = {},
  assessment = {},
  linkedAlerts = [],
  className = "",
}: IdentityDetailProps) {
  const maturity = baselineStats.baseline_maturity ?? 0.85;
  const maturityPct = Math.round(maturity * 100);
  const meanRate = baselineStats.ewma_rate_mean ?? 0.45;
  const stdRate = baselineStats.ewma_rate_std ?? 0.12;

  // Mock / Synthetic time series demonstrating baseline normal band vs observed
  const timeSeriesData = [
    { time: "10:00", observed: meanRate * 0.9, baseline_mean: meanRate, upper_band: meanRate + 2 * stdRate },
    { time: "10:05", observed: meanRate * 1.1, baseline_mean: meanRate, upper_band: meanRate + 2 * stdRate },
    { time: "10:10", observed: meanRate * 0.95, baseline_mean: meanRate, upper_band: meanRate + 2 * stdRate },
    { time: "10:15", observed: isControlledTarget ? 7.8 : meanRate * 1.05, baseline_mean: meanRate, upper_band: meanRate + 2 * stdRate },
    { time: "10:20", observed: isControlledTarget ? 8.4 : meanRate * 0.88, baseline_mean: meanRate, upper_band: meanRate + 2 * stdRate },
  ];

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Identity Top Bar */}
      <Card className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--surface-2)] text-[var(--accent)] border border-[var(--border)]">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {alias || identityId}
              </h2>
              {isControlledTarget && (
                <Badge variant="danger" size="sm">
                  Active Attack Target
                </Badge>
              )}
            </div>
            <div className="text-xs font-mono text-[var(--text-muted)] mt-0.5">
              Device Identifier: {identityId}
            </div>
          </div>
        </div>

        {onToggleControlledTarget && (
          <Button
            variant={isControlledTarget ? "danger" : "secondary"}
            size="sm"
            onClick={() => onToggleControlledTarget(isControlledTarget ? "" : identityId)}
          >
            <Target className="w-3.5 h-3.5 mr-1.5" />
            {isControlledTarget ? "Clear As Attack Target" : "Set As Controlled Target"}
          </Button>
        )}
      </Card>

      {/* Feature Time Series vs Baseline Band */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div>
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-[var(--text-secondary)]">
              Observed Traffic vs Adaptive EWMA Baseline Band
            </CardTitle>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Tolerance envelope: Mean ({meanRate.toFixed(2)} req/s) ± 2σ ({stdRate.toFixed(2)})
            </p>
          </div>
          <Badge variant={maturity >= 0.8 ? "success" : "warning"} size="sm">
            {baselineStats.maturity_state || "MATURE"} ({maturityPct}%)
          </Badge>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="h-[220px] w-full">
            <TimeSeriesChart
              data={timeSeriesData}
              xAxisKey="time"
              series={[
                { key: "observed", name: "Observed Request Rate", color: isControlledTarget ? "#f43f5e" : "#fe9a00" },
                { key: "upper_band", name: "Upper Normal Threshold (+2σ)", color: "#94a3b8" },
                { key: "baseline_mean", name: "Learned Mean Baseline", color: "#64748b" },
              ]}
              height={220}
            />
          </div>
        </CardContent>
      </Card>

      {/* Assessment History & Fingerprint */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Multilayer Assessment */}
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Detection Fusion Assessment
              </CardTitle>
            </div>
            <SeverityBadge
              severity={(assessment.threat_level || (isControlledTarget ? "HIGH" : "LOW")) as IncidentSeverity}
              size="sm"
            />
          </CardHeader>

          <CardContent className="pt-3 space-y-3 font-mono text-xs">
            <div className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">Fused Threat Score</span>
              <span className="font-bold text-[var(--text-primary)]">
                {(assessment.fused_score ?? (isControlledTarget ? 0.88 : 0.04)).toFixed(2)} / 1.00
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">Supervised LightGBM Probability</span>
              <span className="text-[var(--text-primary)]">
                {(assessment.supervised_prob ?? (isControlledTarget ? 0.94 : 0.02)).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">Unsupervised Anomaly Distance</span>
              <span className="text-[var(--text-primary)]">
                {(assessment.unsupervised_score ?? (isControlledTarget ? 0.82 : 0.05)).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between py-1.5">
              <span className="text-[var(--text-muted)]">Conformal Classification</span>
              <Badge variant={isControlledTarget ? "danger" : "success"} size="sm">
                {assessment.conformal_status || (isControlledTarget ? "ATTACK" : "NORMAL")}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Client Fingerprint & Metadata */}
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Device Fingerprint
              </CardTitle>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">Authenticated</span>
          </CardHeader>

          <CardContent className="pt-3 space-y-2.5 text-xs font-mono">
            <div>
              <span className="text-[var(--text-muted)] text-[11px]">User-Agent:</span>
              <div className="p-1.5 rounded bg-[var(--surface-2)] text-[11px] text-slate-300 truncate mt-0.5">
                Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0
              </div>
            </div>

            <div>
              <span className="text-[var(--text-muted)] text-[11px]">Hardware Canvas Token:</span>
              <div className="p-1.5 rounded bg-[var(--surface-2)] text-[11px] text-slate-300 font-mono mt-0.5 truncate">
                fp_9b2e88a104c93f001188d
              </div>
            </div>

            <div className="flex justify-between text-xs pt-1">
              <span className="text-[var(--text-muted)]">Network Gateway:</span>
              <span className="text-[var(--text-primary)]">127.0.0.1 (Loopback/LAN)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linked Incidents */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Linked Security Incidents ({linkedAlerts.length})
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {linkedAlerts.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--text-muted)]">
              No security alerts currently linked to this identity.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {linkedAlerts.map((a) => {
                const aId = a.alert_id || a.id || "";
                return (
                  <div
                    key={aId}
                    className="p-3 hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={(a.severity || "HIGH") as IncidentSeverity} size="sm" />
                      <span className="font-sans font-semibold text-[var(--text-primary)]">
                        {a.title || `Incident ${aId.slice(0, 8)}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[var(--text-muted)]">{a.timestamp || "Recent"}</span>
                      <Link
                        to={`/alerts/${encodeURIComponent(aId)}`}
                        className="text-[var(--accent)] hover:underline inline-flex items-center gap-1 font-sans font-medium"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

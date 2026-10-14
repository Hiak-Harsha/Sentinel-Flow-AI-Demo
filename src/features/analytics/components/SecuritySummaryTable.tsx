import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { ShieldAlert, BarChart3 } from "lucide-react";

export interface SecuritySummaryProps {
  alerts?: any[];
  className?: string;
}

export function SecuritySummaryTable({ alerts = [], className = "" }: SecuritySummaryProps) {
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
  const high = alerts.filter((a) => a.severity === "HIGH").length;
  const elevated = alerts.filter((a) => a.severity === "ELEVATED").length;
  const low = alerts.filter((a) => a.severity === "LOW").length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Incident Severity & Technique Distribution
          </CardTitle>
        </div>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {alerts.length} Incidents Total
        </span>
      </CardHeader>

      <CardContent className="pt-4 space-y-4 font-mono text-xs">
        {/* Severity Count Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] font-sans">Critical</span>
              <SeverityBadge severity="CRITICAL" size="sm" />
            </div>
            <div className="text-lg font-bold text-slate-100">{critical}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] font-sans">High</span>
              <SeverityBadge severity="HIGH" size="sm" />
            </div>
            <div className="text-lg font-bold text-slate-100">{high}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] font-sans">Elevated</span>
              <SeverityBadge severity="ELEVATED" size="sm" />
            </div>
            <div className="text-lg font-bold text-slate-100">{elevated}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] font-sans">Low</span>
              <SeverityBadge severity="LOW" size="sm" />
            </div>
            <div className="text-lg font-bold text-slate-100">{low}</div>
          </div>
        </div>

        {/* Adversarial Technique Breakdown */}
        <div className="space-y-2 pt-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)] font-sans">
            Top Detected Adversarial Behaviors
          </div>
          {[
            { technique: "T1110 Password Spray & Brute Force", count: 8, pct: 45 },
            { technique: "T1110.004 Credential Stuffing", count: 5, pct: 28 },
            { technique: "T1498 Low & Slow HTTP DoS", count: 3, pct: 17 },
            { technique: "T1048 Exfiltration over Web Service", count: 2, pct: 10 },
          ].map((item) => (
            <div key={item.technique} className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)] font-sans">{item.technique}</span>
                <span className="text-cyan-400 font-bold">{item.count} events ({item.pct}%)</span>
              </div>
              <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${item.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

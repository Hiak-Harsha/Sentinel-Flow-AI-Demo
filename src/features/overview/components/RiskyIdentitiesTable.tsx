import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { ArrowUpDown, ExternalLink, ShieldCheck, AlertTriangle } from "lucide-react";

export interface IdentityRiskItem {
  id: string;
  alias?: string;
  threat_score: number;
  threat_level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  request_rate_5s: number;
  baseline_maturity: number;
  maturity_state?: "COLD_START" | "LEARNING" | "MATURE";
  mitre_techniques?: string[];
  active_incidents?: number;
}

export interface RiskyIdentitiesTableProps {
  identities: IdentityRiskItem[];
  onSelectIdentity?: (id: string) => void;
  className?: string;
}

export function RiskyIdentitiesTable({
  identities,
  onSelectIdentity,
  className = "",
}: RiskyIdentitiesTableProps) {
  const [sortField, setSortField] = useState<"threat_score" | "request_rate_5s">("threat_score");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const sorted = useMemo(() => {
    return [...identities].sort((a, b) => {
      const valA = a[sortField] || 0;
      const valB = b[sortField] || 0;
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [identities, sortField, sortAsc]);

  const toggleSort = (field: "threat_score" | "request_rate_5s") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-[var(--text-secondary)]">
            High-Risk Identities & Devices
          </CardTitle>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Per-identity EWMA baseline divergence and fused risk scores
          </p>
        </div>
        <Badge variant="subtle" size="sm">
          {identities.length} Tracked
        </Badge>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-4">Identity / Device</th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none"
                  onClick={() => toggleSort("threat_score")}
                >
                  <div className="flex items-center gap-1">
                    Risk Score
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none"
                  onClick={() => toggleSort("request_rate_5s")}
                >
                  <div className="flex items-center gap-1">
                    Rate (5s)
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Baseline Maturity</th>
                <th className="py-2.5 px-3">Active Alerts</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--text-muted)] font-sans">
                    No active risky identities observed. All devices operating within learned EWMA baselines.
                  </td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const maturity = item.baseline_maturity ?? 0;
                  const maturityPct = Math.round(maturity * 100);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[var(--surface-2)] transition-colors group cursor-pointer"
                      onClick={() => onSelectIdentity?.(item.id)}
                    >
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          {item.alias || item.id}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">
                          {item.id}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={item.threat_level as IncidentSeverity} size="sm" />
                          <span className="font-bold text-[var(--text-primary)]">
                            {item.threat_score.toFixed(2)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-semibold text-[var(--text-primary)]">
                        {item.request_rate_5s.toFixed(2)} req/s
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 w-28">
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                            <span>{item.maturity_state || (maturity >= 0.8 ? "MATURE" : "LEARNING")}</span>
                            <span>{maturityPct}%</span>
                          </div>
                          <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                maturity >= 0.8 ? "bg-emerald-400" : maturity >= 0.4 ? "bg-cyan-400" : "bg-amber-400"
                              }`}
                              style={{ width: `${Math.min(100, maturityPct)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {(item.active_incidents || 0) > 0 ? (
                          <Badge variant="danger" size="sm" className="font-sans">
                            {item.active_incidents} active
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)] font-sans">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-sans">
                        <Link
                          to={`/devices/${encodeURIComponent(item.id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--surface-2)] text-xs text-cyan-400 hover:text-cyan-300 hover:bg-[var(--surface-3)] transition-colors"
                        >
                          <span>Drilldown</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { ProvenanceBadge, ProvenanceType } from "@/design/components/ProvenanceBadge";
import { Badge } from "@/design/components/Badge";
import { ShieldAlert, ArrowRight, ExternalLink } from "lucide-react";

export interface AlertStreamItem {
  id: string;
  alert_id?: string;
  title?: string;
  scenario?: string;
  severity: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  provenance?: ProvenanceType;
  identity_id?: string;
  target_service?: string;
  threat_score?: number;
  mitre_techniques?: string[];
  status?: string;
  timestamp?: string;
}

export interface LiveAlertStreamProps {
  alerts: AlertStreamItem[];
  provenanceFilter?: ProvenanceType | "all";
  maxItems?: number;
  className?: string;
}

export function LiveAlertStream({
  alerts,
  provenanceFilter = "all",
  maxItems = 6,
  className = "",
}: LiveAlertStreamProps) {
  const filtered = alerts.filter((a) => {
    if (provenanceFilter === "all") return true;
    const itemProv = a.provenance || "live";
    return itemProv === provenanceFilter;
  });

  const displayed = filtered.slice(0, maxItems);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-[var(--text-secondary)]">
            Live Incident Stream
          </CardTitle>
        </div>
        <Link
          to="/alerts"
          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 transition-colors"
        >
          View All ({alerts.length})
          <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>

      <CardContent className="p-0 divide-y divide-[var(--border-subtle)]">
        {displayed.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No active incidents matching the selected filter.
          </div>
        ) : (
          displayed.map((alert) => {
            const alertId = alert.alert_id || alert.id;
            const prov = alert.provenance || "live";
            const techniques = alert.mitre_techniques || [];

            return (
              <div
                key={alertId}
                className="p-3.5 hover:bg-[var(--surface-2)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={alert.severity as IncidentSeverity} size="sm" />
                    <ProvenanceBadge provenance={prov} />
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {alert.title || alert.scenario || `Security Incident on ${alert.identity_id || "target"}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono flex-wrap">
                    <span>Target: {alert.identity_id || alert.target_service || "lab_target"}</span>
                    {alert.threat_score !== undefined && (
                      <span>• Score: {alert.threat_score.toFixed(2)}</span>
                    )}
                    {techniques.map((tech) => (
                      <span
                        key={tech}
                        className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <Badge variant={alert.status === "RESOLVED" ? "success" : "danger"} size="sm">
                    {alert.status || "OPEN"}
                  </Badge>
                  <Link
                    to={`/alerts/${encodeURIComponent(alertId)}`}
                    className="p-1.5 rounded bg-[var(--surface-3)] text-slate-300 hover:text-white hover:bg-cyan-500/20 transition-colors"
                    title="Open Incident Drawer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

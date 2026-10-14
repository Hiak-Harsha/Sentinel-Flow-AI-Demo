import React from "react";
import { Link } from "react-router-dom";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { ProvenanceBadge, ProvenanceType } from "@/design/components/ProvenanceBadge";
import { Badge } from "@/design/components/Badge";
import { ExternalLink, CheckSquare, Square } from "lucide-react";

export interface AlertRecord {
  id: string;
  alert_id?: string;
  title?: string;
  scenario?: string;
  severity: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "FALSE_POSITIVE";
  provenance?: ProvenanceType;
  identity_id?: string;
  target_service?: string;
  threat_score?: number;
  mitre_techniques?: string[];
  evidence_count?: number;
  created_at?: string;
  timestamp?: string;
  disposition?: string;
}

export interface AlertsTableProps {
  alerts: AlertRecord[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onOpenDrawer: (alertId: string) => void;
  activeDrawerAlertId?: string | null;
  className?: string;
}

export function AlertsTable({
  alerts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onOpenDrawer,
  activeDrawerAlertId,
  className = "",
}: AlertsTableProps) {
  const allSelected = alerts.length > 0 && alerts.every((a) => selectedIds.includes(a.alert_id || a.id));

  return (
    <div className={`overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] ${className}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
            <th className="py-2.5 px-3 w-10 text-center">
              <button
                type="button"
                onClick={onSelectAll}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer focus:outline-none"
                title={allSelected ? "Deselect All" : "Select All"}
              >
                {allSelected ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            </th>
            <th className="py-2.5 px-3">Severity</th>
            <th className="py-2.5 px-3">Incident / Title</th>
            <th className="py-2.5 px-3">Target / Identity</th>
            <th className="py-2.5 px-3">Score & Techniques</th>
            <th className="py-2.5 px-3">Status</th>
            <th className="py-2.5 px-3">Time</th>
            <th className="py-2.5 px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
          {alerts.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-[var(--text-muted)] font-sans">
                No incidents match the selected filter criteria.
              </td>
            </tr>
          ) : (
            alerts.map((alert) => {
              const alertId = alert.alert_id || alert.id;
              const isSelected = selectedIds.includes(alertId);
              const isDrawerActive = activeDrawerAlertId === alertId;
              const prov = alert.provenance || "live";
              const timeString = alert.created_at || alert.timestamp
                ? new Date(alert.created_at || alert.timestamp!).toLocaleTimeString([], { hour12: false })
                : "--";

              const statusVariant =
                alert.status === "RESOLVED"
                  ? "success"
                  : alert.status === "FALSE_POSITIVE"
                  ? "subtle"
                  : alert.status === "INVESTIGATING"
                  ? "warning"
                  : "danger";

              return (
                <tr
                  key={alertId}
                  onClick={() => onOpenDrawer(alertId)}
                  className={`hover:bg-[var(--surface-2)] transition-colors cursor-pointer group ${
                    isDrawerActive ? "bg-[var(--surface-2)] ring-1 ring-cyan-500/50" : ""
                  }`}
                >
                  <td
                    className="py-3 px-3 text-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(alertId);
                    }}
                  >
                    <button type="button" className="text-[var(--text-secondary)] hover:text-cyan-400 focus:outline-none">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </button>
                  </td>

                  <td className="py-3 px-3">
                    <SeverityBadge severity={alert.severity as IncidentSeverity} size="sm" />
                  </td>

                  <td className="py-3 px-3 font-sans">
                    <div className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-cyan-300 transition-colors">
                      {alert.title || alert.scenario || `Alert ${alertId.slice(0, 8)}`}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <ProvenanceBadge provenance={prov} />
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        ID: {alertId.slice(0, 12)}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <Link
                      to={`/devices/${encodeURIComponent(alert.identity_id || "")}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
                    >
                      {alert.identity_id || alert.target_service || "lab_target"}
                    </Link>
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[var(--text-primary)]">
                        {(alert.threat_score ?? 0.85).toFixed(2)}
                      </span>
                      {(alert.mitre_techniques || []).map((tech) => (
                        <span
                          key={tech}
                          className="px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[10px] text-cyan-300 border border-cyan-500/20"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="py-3 px-3 font-sans">
                    <Badge variant={statusVariant} size="sm">
                      {alert.status || "OPEN"}
                    </Badge>
                  </td>

                  <td className="py-3 px-3 text-[var(--text-muted)]">
                    {timeString}
                  </td>

                  <td className="py-3 px-3 text-right font-sans">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDrawer(alertId);
                      }}
                      className="px-2.5 py-1 rounded bg-[var(--surface-2)] text-xs text-cyan-400 hover:text-cyan-300 hover:bg-[var(--surface-3)] transition-colors inline-flex items-center gap-1"
                    >
                      <span>Investigate</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

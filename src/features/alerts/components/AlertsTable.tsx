import React from "react";
import { Link } from "react-router-dom";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { ProvenanceBadge, ProvenanceType } from "@/design/components/ProvenanceBadge";
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
    <div className={`overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0f1013] ${className}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[#090c10] text-[#5f6368] uppercase font-mono tracking-wider font-semibold">
            <th className="py-2.5 px-3 w-10 text-center">
              <button
                type="button"
                onClick={onSelectAll}
                className="text-[#9aa0a6] hover:text-[#f0f2f5] cursor-pointer focus:outline-none"
                title={allSelected ? "Deselect All" : "Select All"}
              >
                {allSelected ? (
                  <CheckSquare className="w-4 h-4 text-[#fe9a00]" />
                ) : (
                  <Square className="w-4 h-4 text-[#5f6368]" />
                )}
              </button>
            </th>
            <th className="py-2.5 px-3">INCIDENT ID</th>
            <th className="py-2.5 px-3">TECHNIQUE / RULE</th>
            <th className="py-2.5 px-3">TARGET IDENTITY</th>
            <th className="py-2.5 px-3">SEVERITY</th>
            <th className="py-2.5 px-3">SCORE</th>
            <th className="py-2.5 px-3">PROVENANCE</th>
            <th className="py-2.5 px-3">DISPOSITION</th>
            <th className="py-2.5 px-3 text-right">ACTION</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
          {alerts.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-12 text-center text-[#5f6368] font-mono">
                No matching security incidents found.
              </td>
            </tr>
          ) : (
            alerts.map((alert) => {
              const alertId = alert.alert_id || alert.id;
              const isSelected = selectedIds.includes(alertId);
              const isActive = activeDrawerAlertId === alertId;
              const score = alert.threat_score ?? 0.85;

              return (
                <tr
                  key={alertId}
                  onClick={() => onOpenDrawer(alertId)}
                  className={`cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#2d1f0b]/35 border-l-2 border-l-[#fe9a00]"
                      : isSelected
                      ? "bg-[#16181c]"
                      : "hover:bg-[#111417]"
                  }`}
                >
                  {/* Select Checkbox */}
                  <td
                    className="py-2.5 px-3 text-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(alertId);
                    }}
                  >
                    <button
                      type="button"
                      className="text-[#5f6368] hover:text-[#f0f2f5] focus:outline-none"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#fe9a00]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#5f6368]" />
                      )}
                    </button>
                  </td>

                  {/* Incident ID */}
                  <td className="py-2.5 px-3 font-mono font-medium text-[#f0f2f5] whitespace-nowrap">
                    {alertId.slice(0, 14)}
                  </td>

                  {/* Rule / Title */}
                  <td className="py-2.5 px-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-[#f0f2f5]">
                        {alert.title || alert.scenario || "MITRE ATT&CK Alert"}
                      </span>
                      {alert.mitre_techniques && alert.mitre_techniques.length > 0 && (
                        <span className="text-[10px] font-mono text-[#9aa0a6]">
                          {alert.mitre_techniques.join(", ")}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Target Identity */}
                  <td className="py-2.5 px-3 font-mono text-[#f0f2f5]">
                    {alert.identity_id || "lab_target_node"}
                  </td>

                  {/* Severity Badge */}
                  <td className="py-2.5 px-3">
                    <SeverityBadge severity={alert.severity as IncidentSeverity} size="sm" />
                  </td>

                  {/* Calibrated Threat Score */}
                  <td className="py-2.5 px-3 font-mono font-bold text-[#ffb454] sf-tabular">
                    {(score * 100).toFixed(0)}%
                  </td>

                  {/* Provenance */}
                  <td className="py-2.5 px-3">
                    <ProvenanceBadge provenance={alert.provenance || "live"} size="sm" />
                  </td>

                  {/* Disposition */}
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        (alert.status || alert.disposition || "OPEN") === "OPEN"
                          ? "bg-[#2b1218] text-[#f4526b] border border-[#f4526b]/30"
                          : (alert.status || alert.disposition) === "INVESTIGATING"
                          ? "bg-[#2b2513] text-[#e9c46a] border border-[#e9c46a]/30"
                          : (alert.status || alert.disposition) === "RESOLVED"
                          ? "bg-[#0d281e] text-[#3ddc97] border border-[#3ddc97]/30"
                          : "bg-[#16181c] text-[#9aa0a6]"
                      }`}
                    >
                      {alert.status || alert.disposition || "OPEN"}
                    </span>
                  </td>

                  {/* Open Drilldown */}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDrawer(alertId);
                      }}
                      className="p-1 rounded text-[#5f6368] hover:text-[#ffb454] hover:bg-[#16181c] transition-colors"
                      title="Drilldown details"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
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

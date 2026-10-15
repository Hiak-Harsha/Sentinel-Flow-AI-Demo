import React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { Laptop, Smartphone, Target, User, ShieldCheck } from "lucide-react";

export interface ParticipantItem {
  device_id: string;
  alias?: string;
  role?: string;
  ip?: string;
  user_agent?: string;
  is_controlled_target?: boolean;
  baseline_maturity?: number;
  threat_score?: number;
  joined_at?: string;
}

export interface IdentitiesListProps {
  participants: ParticipantItem[];
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onToggleControlledTarget?: (id: string) => void;
  className?: string;
}

export function IdentitiesList({
  participants,
  selectedId,
  onSelectId,
  onToggleControlledTarget,
  className = "",
}: IdentitiesListProps) {
  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-[var(--text-secondary)]">
            Enrolled Identities
          </CardTitle>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {participants.length} Devices Registered
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-y-auto divide-y divide-[var(--border-subtle)] flex-1 max-h-[680px]">
        {participants.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--text-muted)] font-sans">
            No participant identities joined yet. Direct users to the Participant App (/join) to enroll.
          </div>
        ) : (
          participants.map((p) => {
            const isSelected = selectedId === p.device_id;
            const isTarget = Boolean(p.is_controlled_target);
            const isMobile = (p.user_agent || "").toLowerCase().includes("mobile");

            return (
              <div
                key={p.device_id}
                onClick={() => onSelectId(p.device_id)}
                className={`p-3.5 hover:bg-[var(--surface-2)] transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected ? "bg-[var(--surface-2)] border-l-2 border-[var(--accent)]" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg ${isTarget ? "bg-rose-500/20 text-rose-400" : "bg-[var(--surface-3)] text-[var(--accent)]"}`}>
                    {isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {p.alias || p.device_id}
                      </span>
                      {isTarget && (
                        <Badge variant="danger" size="sm">
                          Target
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                      {p.device_id}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onToggleControlledTarget && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleControlledTarget(isTarget ? "" : p.device_id);
                      }}
                      className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                        isTarget
                          ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                          : "bg-[var(--surface-3)] text-slate-400 hover:text-white"
                      }`}
                      title={isTarget ? "Clear Controlled Target" : "Designate as Attack Target"}
                    >
                      <Target className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

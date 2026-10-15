import React from "react";
import {
  Menu,
  Search,
  PowerOff,
  Copy,
  Shield,
  Layers,
  ChevronRight,
} from "lucide-react";
import { SeverityBadge } from "@/design/components/SeverityBadge";
import { ConnectionIndicator } from "@/design/components/ConnectionIndicator";
import { Tag } from "@/design/components/Tag";
import { Kbd } from "@/design/components/Kbd";
import { Pill } from "@/design/components/Pill";
import { StatusDot } from "@/design/components/StatusDot";
import { useRealtimeConnection } from "@/realtime/useRealtime";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";

export interface TopBarProps {
  onToggleSidebar?: () => void;
  onOpenCommandPalette: () => void;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  onOpenCommandPalette,
  timeRange,
  onTimeRangeChange,
}) => {
  const { status, lastSeq, latencyMs } = useRealtimeConnection();

  // Query telemetry for threat level
  const { data: telemetry } = useQuery({
    queryKey: queryKeys.telemetry,
    queryFn: async () => {
      const overview = await api.getOverview().catch(() => null);
      return overview?.telemetry || { threat_level: "LOW" };
    },
  });

  // Query session for join code and active phase
  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const role = typeof sessionStorage !== "undefined"
    ? (sessionStorage.getItem("sf_role") || "operator")
    : "operator";
  const user = typeof sessionStorage !== "undefined"
    ? (sessionStorage.getItem("sf_user") || (role === "operator" ? "operator-01" : "red-team-alpha"))
    : "operator-01";

  const isOperator = role === "operator";
  const joinCode = sessionData?.session?.join_code;
  const sessionId = sessionData?.session?.session_id || "SESSION-01";
  const activePhase = sessionData?.session?.current_phase || "PHASE-02";
  const threatLevel = telemetry?.threat_level || "LOW";

  const handleEmergencyStop = async () => {
    try {
      await api.orchestrator.emergencyStop();
      showToast.error("Emergency Stop Engaged", "All active scenarios halted immediately.");
    } catch (err: any) {
      showToast.error("Emergency Stop Failed", err?.message);
    }
  };

  return (
    <header className="h-14 border-b border-[rgba(255,255,255,0.07)] bg-[#090c10] px-3 md:px-5 flex items-center justify-between gap-3 sticky top-0 z-30 select-none">
      {/* Left: Mobile hamburger, Brand title, Role tag, and Quick Search */}
      <div className="flex items-center gap-3 flex-1 min-w-0 max-w-xl">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-1.5 rounded-lg text-[#9aa0a6] hover:text-[#f0f2f5] hover:bg-[#111417] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fe9a00]"
          aria-label="Toggle mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand logo & title on mobile / when collapsed */}
        <div className="flex items-center gap-2 shrink-0 md:hidden">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#ffb454] to-[#fe9a00] flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-[#1a1203]" />
          </div>
          <span className="font-display font-bold text-sm tracking-tight text-[#f0f2f5]">
            SENTINEL
          </span>
          <Tag variant={isOperator ? "amber" : "neutral"} size="sm">
            {isOperator ? "OPERATOR" : "RED TEAM"}
          </Tag>
        </div>

        {/* Command Search Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden sm:flex flex-1 items-center justify-between px-3 py-1.5 rounded-lg bg-[#0f1013] border border-[rgba(255,255,255,0.08)] text-xs text-[#5f6368] hover:border-[rgba(255,255,255,0.18)] hover:text-[#9aa0a6] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fe9a00] cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-[#5f6368]" />
            <span className="truncate">Search commands, alerts, scenarios...</span>
          </span>
          <Kbd>Ctrl+K</Kbd>
        </button>
      </div>

      {/* Center: Role-aware context chip */}
      <div className="hidden xl:flex items-center">
        {isOperator ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#0f1013] border border-[rgba(255,255,255,0.08)] text-xs font-mono">
            <Layers className="w-3.5 h-3.5 text-[#ffb454]" />
            <span className="text-[#9aa0a6]">SESSION</span>
            <span className="text-[#f0f2f5] font-semibold">{sessionId}</span>
            <span className="text-[#5f6368]">·</span>
            <span className="text-[#9aa0a6]">PHASE</span>
            <span className="text-[#ffb454] font-semibold">{activePhase}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#0f1013] border border-[rgba(255,255,255,0.08)] text-xs font-mono">
            <Shield className="w-3.5 h-3.5 text-[#ff7a45]" />
            <span className="text-[#9aa0a6]">TARGET</span>
            <span className="text-[#f0f2f5] font-semibold">prod-api-cluster</span>
            <span className="text-[#5f6368]">·</span>
            <span className="text-[#9aa0a6]">QUOTA</span>
            <span className="text-[#3ddc97] font-semibold">14/20</span>
          </div>
        )}
      </div>

      {/* Right: Threat Level, Join Code, Status Indicator, Emergency Stop, Identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Active Classroom Join Code */}
        {joinCode && (
          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(joinCode);
                showToast.info("Join Code Copied", `Share ${joinCode} with students.`);
              }
            }}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2d1f0b] border border-[#fe9a00]/30 text-[#ffb454] hover:border-[#fe9a00]/60 text-xs font-mono font-medium transition-colors cursor-pointer"
            title="Click to copy participant join code"
          >
            <span className="text-[10px] text-[#9aa0a6] uppercase">ROOM:</span>
            <span className="font-bold">{joinCode}</span>
            <Copy className="w-3 h-3 text-[#fe9a00]" />
          </button>
        )}

        {/* Global Threat Level */}
        <SeverityBadge severity={threatLevel} size="sm" />

        {/* Realtime WebSocket Connection Status */}
        <ConnectionIndicator
          status={status}
          lastSeq={lastSeq}
          latencyMs={latencyMs}
        />

        {/* Emergency Stop Button (Operator only) */}
        {isOperator && (
          <button
            type="button"
            onClick={handleEmergencyStop}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2b1218] border border-[#f4526b]/40 text-[#f4526b] hover:bg-[#3d1620] hover:border-[#f4526b]/70 text-xs font-semibold font-mono tracking-tight transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f4526b] cursor-pointer"
            title="Emergency Stop: Halt all attacks and active simulations"
          >
            <PowerOff className="w-3.5 h-3.5 text-[#f4526b]" />
            <span className="hidden sm:inline">STOP</span>
          </button>
        )}

        {/* Identity Pill */}
        <div className="hidden lg:flex items-center">
          <Pill
            size="sm"
            variant="default"
            label="ID"
            value={user}
            className="text-[11px]"
          />
        </div>
      </div>
    </header>
  );
};

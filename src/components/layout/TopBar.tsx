import React from "react";
import {
  Menu,
  Search,
  PowerOff,
  Clock,
  Copy,
} from "lucide-react";
import { SeverityBadge } from "@/design/components/SeverityBadge";
import { ConnectionIndicator } from "@/design/components/ConnectionIndicator";
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

  // Query session for join code
  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const joinCode = sessionData?.session?.join_code;
  const threatLevel = telemetry?.threat_level || "LOW";

  const handleEmergencyStop = async () => {
    try {
      await api.orchestrator.emergencyStop();
      showToast.error("Emergency Stop Engaged", "All active scenarios halted.");
    } catch (err: any) {
      showToast.error("Emergency Stop Failed", err?.message);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Left: Mobile hamburger & Search bar */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          aria-label="Toggle mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer shadow-inner"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Search commands, alerts, identities...</span>
            <span className="sm:hidden">Search...</span>
          </span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Threat Level, Join Code, Time Range, Connection Status, Emergency Stop */}
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
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-800/70 text-cyan-300 hover:bg-cyan-900/60 text-xs font-mono font-bold transition-colors cursor-pointer"
            title="Click to copy participant join code"
          >
            <span className="text-[10px] text-cyan-400 font-sans font-normal uppercase">Room:</span>
            <span>{joinCode}</span>
            <Copy className="w-3 h-3 text-cyan-400" />
          </button>
        )}

        {/* Threat Level */}
        <SeverityBadge severity={threatLevel} size="md" />

        {/* Time-Range Selector */}
        <div className="hidden lg:flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium">
          <Clock className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
          {["Live", "15m", "1h", "24h"].map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onTimeRangeChange(range)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                timeRange === range
                  ? "bg-slate-800 text-cyan-300 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Realtime WebSocket Connection Indicator */}
        <ConnectionIndicator
          status={status}
          lastSeq={lastSeq}
          latencyMs={latencyMs}
        />

        {/* Emergency Stop Button */}
        <button
          type="button"
          onClick={handleEmergencyStop}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 hover:bg-rose-900/60 hover:text-rose-100 text-xs font-semibold font-mono tracking-tight transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer shadow-sm shadow-rose-950/50"
          title="Emergency Stop: Halt all attacks and active simulations"
        >
          <PowerOff className="w-3.5 h-3.5 text-rose-500" />
          <span className="hidden sm:inline">STOP</span>
        </button>
      </div>
    </header>
  );
};

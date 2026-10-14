import React from "react";
import { Tooltip } from "./Tooltip";
import { Wifi, WifiOff } from "lucide-react";

export type WsConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected" | "error" | "stale";

export interface ConnectionIndicatorProps {
  status: WsConnectionStatus;
  lastSeq?: number | null;
  latencyMs?: number | null;
  className?: string;
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  status,
  lastSeq,
  latencyMs,
  className = "",
}) => {
  let color = "bg-emerald-400";
  let pulse = true;
  let label = "Connected (Realtime)";
  let pingBg = "bg-emerald-400";

  if (status === "connecting" || status === "reconnecting") {
    color = "bg-amber-400";
    pingBg = "bg-amber-400";
    label = status === "reconnecting" ? "Reconnecting (WS Protocol v1)..." : "Connecting...";
  } else if (status === "stale") {
    color = "bg-amber-500";
    pingBg = "bg-amber-500";
    label = "Stale (Falling back to HTTP polling)";
  } else if (status === "disconnected" || status === "error") {
    color = "bg-rose-500";
    pulse = false;
    label = "Disconnected (Offline)";
  }

  const tooltipContent = (
    <div className="space-y-1 font-mono sf-tabular text-left">
      <div className="font-semibold text-slate-100">{label}</div>
      {lastSeq !== undefined && lastSeq !== null && (
        <div className="text-slate-400 text-[10px]">Sequence: #{lastSeq}</div>
      )}
      {latencyMs !== undefined && latencyMs !== null && (
        <div className="text-slate-400 text-[10px]">p95 Latency: {latencyMs.toFixed(1)} ms</div>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-mono sf-tabular cursor-pointer select-none hover:border-slate-700 transition-colors ${className}`}
      >
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingBg}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
        </span>
        <span className="text-[11px] font-medium hidden sm:inline">
          {status === "connected" ? "LIVE" : status.toUpperCase()}
        </span>
      </div>
    </Tooltip>
  );
};

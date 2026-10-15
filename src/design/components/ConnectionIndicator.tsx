import React from "react";
import { Tooltip } from "./Tooltip";

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
  let color = "bg-[#3ddc97]"; // sev-low mint
  let pulse = true;
  let label = "Connected (Realtime)";
  let pingBg = "bg-[#3ddc97]";

  if (status === "connecting" || status === "reconnecting") {
    color = "bg-[#fe9a00]"; // brand amber indicator
    pingBg = "bg-[#fe9a00]";
    label = status === "reconnecting" ? "Reconnecting (WS Protocol v1)..." : "Connecting...";
  } else if (status === "stale") {
    color = "bg-[#e9c46a]"; // sev-elevated
    pingBg = "bg-[#e9c46a]";
    label = "Stale (Falling back to HTTP polling)";
  } else if (status === "disconnected" || status === "error") {
    color = "bg-[#f4526b]"; // sev-critical
    pulse = false;
    label = "Disconnected (Offline)";
  }

  const tooltipContent = (
    <div className="space-y-1 font-mono sf-tabular text-left text-xs">
      <div className="font-semibold text-[#f0f2f5]">{label}</div>
      {lastSeq !== undefined && lastSeq !== null && (
        <div className="text-[#9aa0a6] text-[10px]">Sequence: #{lastSeq}</div>
      )}
      {latencyMs !== undefined && latencyMs !== null && (
        <div className="text-[#9aa0a6] text-[10px]">p95 Latency: {latencyMs.toFixed(1)} ms</div>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#111417] border border-[rgba(255,255,255,0.07)] text-xs text-[#9aa0a6] font-mono sf-tabular cursor-pointer select-none hover:border-[rgba(255,255,255,0.15)] transition-colors ${className}`}
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

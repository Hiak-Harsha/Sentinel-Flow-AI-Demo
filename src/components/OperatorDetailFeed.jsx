import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TerminalLog } from "./TerminalLog";

export function OperatorDetailFeed({
  selectedDevice,
  onClearSelection,
  liveEvents = [],
  trafficLogs = [],
}) {
  const [deviceLogs, setDeviceLogs] = useState([]);
  const [deviceAssessment, setDeviceAssessment] = useState(null);
  const [deviceFeatures, setDeviceFeatures] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDevice) {
      setDeviceLogs([]);
      setDeviceAssessment(null);
      setDeviceFeatures(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    async function fetchDeviceDetails() {
      try {
        const id = selectedDevice.device_id || selectedDevice.identity_id;
        const [assess, logs, feats] = await Promise.all([
          api.getDeviceAssessment(id).catch(() => null),
          api.getProxyLogs(30, id).catch(() => []),
          api.getIdentityFeatures(id).catch(() => null),
        ]);

        if (isMounted) {
          setDeviceAssessment(assess || selectedDevice);
          setDeviceLogs(Array.isArray(logs) ? logs : []);
          setDeviceFeatures(feats?.features || feats || null);
        }
      } catch (err) {
        console.error("Failed to load device details:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDeviceDetails();
    const interval = setInterval(fetchDeviceDetails, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedDevice]);

  // If a device tile is clicked, display deep-dive card with its specific logs and feature vector
  if (selectedDevice) {
    const threatLevel = deviceAssessment?.threat_level || selectedDevice.threat_level || "LOW";
    const threatScore = deviceAssessment?.threat_score || selectedDevice.threat_score || 0.05;
    const matchedRules = deviceAssessment?.matched_rules || [];

    return (
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md space-y-4">
        {/* Device Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <h3 className="text-lg font-bold text-slate-100">{selectedDevice.alias}</h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                {selectedDevice.device_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active Inspector · Live telemetry & matched detection signatures
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                threatLevel === "CRITICAL"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse"
                  : threatLevel === "HIGH"
                  ? "bg-orange-500/20 text-orange-300 border-orange-500/50"
                  : threatLevel === "ELEVATED"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
              }`}
            >
              {threatLevel} ({(threatScore * 100).toFixed(0)}%)
            </span>
            <button
              onClick={onClearSelection}
              className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 border border-slate-700 transition"
              title="Return to Global Feed"
            >
              Back to Global Feed ✕
            </button>
          </div>
        </div>

        {/* Threat & Rule Details */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
          <div>
            <span className="text-slate-500 block mb-0.5">Summary:</span>
            <span className="text-slate-200 block truncate">
              {deviceAssessment?.human_summary || selectedDevice.last_action || "Normal activity"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Matched Rule Signatures:</span>
            {matchedRules.length === 0 ? (
              <span className="text-emerald-400">0 rules triggered (Clean)</span>
            ) : (
              <span className="text-rose-400 font-bold truncate block">
                {matchedRules.map((r) => r.rule_id || r).join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Feature snapshot if available */}
        {deviceFeatures && (
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-slate-950/50 p-2.5 rounded-xl border border-slate-800 text-slate-400">
            <div>
              <span className="text-slate-500 block text-[10px]">Req Rate (5s):</span>
              <span className="text-cyan-300 font-bold">
                {(deviceFeatures.request_rate_5s || 0).toFixed(1)} req/s
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Error Ratio:</span>
              <span className="text-amber-300 font-bold">
                {((deviceFeatures.error_ratio_60s || 0) * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Endpoint Entropy:</span>
              <span className="text-indigo-300 font-bold">
                {(deviceFeatures.endpoint_entropy_60s || 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Device specific traffic stream */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
            <span>Recent Requests from {selectedDevice.device_id}</span>
            <span>{deviceLogs.length} proxied records</span>
          </div>
          <TerminalLog logs={deviceLogs} title={`${selectedDevice.device_id} PROXIED TRAFFIC`} />
        </div>
      </div>
    );
  }

  // When no device is selected: show live-scrolling global terminal
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
              Live Global Traffic & Security Feed
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Streaming events across all 60 capacity devices. Click any tile to isolate.
          </p>
        </div>
      </div>

      <TerminalLog logs={trafficLogs} title="GLOBAL PROXY & IDS EVENT STREAM" />
    </div>
  );
}

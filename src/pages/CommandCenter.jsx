import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { DeviceHeatmap } from "../components/DeviceHeatmap";
import { OperatorDetailFeed } from "../components/OperatorDetailFeed";
import { LiveTargetPanel } from "../components/LiveTargetPanel";

export function CommandCenter({
  session,
  participants = [],
  trafficLogs = [],
  activeAlerts = [],
  threatLevel = "LOW",
}) {
  const [gridDevices, setGridDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [showTargetPanel, setShowTargetPanel] = useState(false);
  const [targetOrigin, setTargetOrigin] = useState("http://127.0.0.1:8000/lab-target");
  const [allowedOrigins, setAllowedOrigins] = useState([]);
  const [attackRuns, setAttackRuns] = useState([]);
  const [haltingId, setHaltingId] = useState(null);

  // Load grid, proxy status, and orchestrator runs
  useEffect(() => {
    async function fetchData() {
      try {
        const [grid, status, runs] = await Promise.all([
          api.getDetectionGrid().catch(() => []),
          api.getProxyStatus().catch(() => null),
          api.orchestrator.listRuns().catch(() => []),
        ]);

        if (Array.isArray(grid)) setGridDevices(grid);
        if (status?.allowed_origins && status.allowed_origins.length > 0) setAllowedOrigins(status.allowed_origins);
        if (status?.default_target) setTargetOrigin(status.default_target);
        if (Array.isArray(runs)) setAttackRuns(runs);
      } catch (err) {
        console.error("Failed to fetch command center data:", err);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleHaltRun = async (runId) => {
    try {
      setHaltingId(runId);
      await api.orchestrator.stopRun(runId);
      const runs = await api.orchestrator.listRuns().catch(() => []);
      if (Array.isArray(runs)) setAttackRuns(runs);
    } catch (err) {
      console.error("Failed to halt run:", err);
    } finally {
      setHaltingId(null);
    }
  };

  // Find active running attacks
  const activeRuns = attackRuns.filter((r) => r.status === "RUNNING");
  const recentCompletedRuns = attackRuns.filter((r) => r.status !== "RUNNING").slice(-3).reverse();

  // Update selected device object
  const selectedDevice = gridDevices.find((d) => d.device_id === selectedDeviceId) || null;

  return (
    <div className="space-y-6">
      {/* Top Command Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-4 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              OPERATOR COMMAND CENTER · ROLE=OPERATOR
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mt-1">Live Intrusion Defense Hub</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Simultaneous monitoring of up to 60 audience participant devices and active attack orchestrations.
          </p>
        </div>

        <div className="flex items-center space-x-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300">
            Session Code: <span className="text-cyan-400 font-bold">{session?.join_code || "SF-XXXX"}</span>
          </div>
          <button
            onClick={() => setShowTargetPanel((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center space-x-1.5 ${
              showTargetPanel
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                : "bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
          >
            <span>{showTargetPanel ? "Hide Target Preview" : "Show Target Preview"}</span>
            <span>{showTargetPanel ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {/* Optional Collapsible Target Live Panel */}
      {showTargetPanel && (
        <LiveTargetPanel
          targetUrl={targetOrigin}
          onSelectTargetUrl={setTargetOrigin}
          allowedOrigins={allowedOrigins}
          recentRequests={trafficLogs}
        />
      )}

      {/* Active Attack Runs / Adversary Simulation Panel (Operator Defense View) */}
      {activeRuns.length > 0 ? (
        <div className="space-y-4">
          {activeRuns.map((run) => (
            <div
              key={run.run_id}
              className="p-5 rounded-2xl bg-gradient-to-r from-rose-950/80 via-slate-900/90 to-rose-950/60 border-2 border-rose-500/60 shadow-2xl shadow-rose-950/50 backdrop-blur-xl relative overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-rose-500/20">
                <div className="flex items-center space-x-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">
                        ATTACK SCENARIO IN FLIGHT
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                        {run.scenario}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-white mt-0.5 flex items-center space-x-2">
                      <span>Launched by:</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-xs border border-cyan-500/30">
                        {run.launched_by || "Audience Participant"}
                      </span>
                      <span className="text-slate-400 text-xs">→ Target: {run.target_origin}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right font-mono">
                    <span className="text-[10px] text-slate-400 block uppercase">Progress</span>
                    <span className="text-sm font-bold text-rose-300">{run.progress_percent}%</span>
                  </div>
                  <button
                    onClick={() => handleHaltRun(run.run_id)}
                    disabled={haltingId === run.run_id}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-mono text-xs font-bold transition shadow-lg shadow-rose-600/30 flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    <span>{haltingId === run.run_id ? "Halting..." : "■ HALT ATTACK RUN"}</span>
                  </button>
                </div>
              </div>

              {/* Progress Bar & Telemetry Stats */}
              <div className="mt-3 space-y-2">
                <div className="w-full bg-slate-950/80 rounded-full h-2 overflow-hidden border border-rose-500/20">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-amber-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(2, run.progress_percent)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                  <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 text-[10px] block">REQUESTS SENT</span>
                    <span className="font-bold text-white">
                      {run.details?.sent ?? run.details?.requests_sent ?? run.details?.attempts ?? 0}
                    </span>
                  </div>
                  <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 text-[10px] block">ERRORS / 4xx / 5xx</span>
                    <span className="font-bold text-rose-400">
                      {run.details?.errors ?? 0}
                    </span>
                  </div>
                  <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 text-[10px] block">LAST MEASURED LATENCY</span>
                    <span className="font-bold text-cyan-300">
                      {run.details?.last_response?.latency_ms ? `${run.details.last_response.latency_ms.toFixed(1)}ms` : "—"}
                    </span>
                  </div>
                  <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 text-[10px] block">DETECTION EFFECT</span>
                    <span className="font-bold text-amber-300">
                      Routed to AI Pipeline
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>NO ACTIVE RED-TEAM SCENARIOS IN FLIGHT</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-500">
              Participants can trigger consented tests from the Launch Scenario tab
            </span>
          </div>
          {recentCompletedRuns.length > 0 && (
            <div className="text-slate-400">
              Last Run: <span className="text-slate-200">{recentCompletedRuns[0].scenario}</span> by{" "}
              <span className="text-cyan-400">{recentCompletedRuns[0].launched_by || "Anonymous"}</span> (
              {recentCompletedRuns[0].status})
            </div>
          )}
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Device Heatmap (~60% / 7 cols) */}
        <div className="lg:col-span-7">
          <DeviceHeatmap
            devices={gridDevices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={(id) => setSelectedDeviceId((curr) => (curr === id ? null : id))}
          />
        </div>

        {/* Right Column: Operator Detail Feed (~40% / 5 cols) */}
        <div className="lg:col-span-5">
          <OperatorDetailFeed
            selectedDevice={selectedDevice}
            onClearSelection={() => setSelectedDeviceId(null)}
            trafficLogs={trafficLogs}
          />
        </div>
      </div>
    </div>
  );
}

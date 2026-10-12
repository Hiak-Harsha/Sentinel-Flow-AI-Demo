import { useState, useEffect, useMemo } from "react";
import { Panel, ThreatBadge, StateBadge, StatCard, formatTime, formatNumber, EmptyState } from "../components/shared";

export function LiveMonitor({
  session,
  participants = [],
  threatLevel = "LOW",
  activeAlerts = [],
  telemetryTimeseries = [],
  telemetrySnap = {},
  baselineStats = {},
  recentActivity = [],
  onCalibrateBaseline,
  onSetControlledTarget,
  onSelectDevice,
  isBusy,
}) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [activeAlertDetail, setActiveAlertDetail] = useState(null);

  // Set default selected device if none
  useEffect(() => {
    if (!selectedDevice && participants.length > 0) {
      setSelectedDevice(participants[0].device_id);
    }
  }, [participants, selectedDevice]);

  // Sync latest alert to alert detail
  useEffect(() => {
    if (activeAlerts.length > 0) {
      setActiveAlertDetail(activeAlerts[0]);
    } else {
      setActiveAlertDetail(null);
    }
  }, [activeAlerts]);

  // Selected device data
  const currentDevice = participants.find((p) => p.device_id === selectedDevice) || null;
  const deviceAlert = activeAlerts.find((a) => a.device_id === selectedDevice) || null;

  // Chart points from timeseries
  const chartPoints = useMemo(() => {
    if (!telemetryTimeseries || telemetryTimeseries.length === 0) return [];
    return telemetryTimeseries.slice(-25).map((point, idx) => ({
      x: idx,
      rate: point.requests_per_sec || 0,
      active: point.active_devices || 0,
      time: point.timestamp ? formatTime(point.timestamp) : "",
    }));
  }, [telemetryTimeseries]);

  const maxRate = Math.max(12, ...chartPoints.map((p) => p.rate));

  return (
    <div className="space-y-6">
      {/* Top Banner: Real-Time Monitoring State */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-lg font-bold">
            📡
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-white tracking-tight">Active Live Monitoring</h2>
              <ThreatBadge level={threatLevel} />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Observing real HTTP telemetry streams from {participants.length} connected devices.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onCalibrateBaseline}
            disabled={isBusy}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-mono font-medium text-slate-300 transition hover:bg-white/10"
          >
            ⚖ Recalibrate Baseline
          </button>
          {session?.controlled_target ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-xs font-mono font-bold text-amber-300">
              TARGET: {session.controlled_target}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (participants.length > 0) {
                  onSetControlledTarget(participants[0].device_id);
                }
              }}
              disabled={participants.length === 0}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-xs font-mono font-bold text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-50"
            >
              🎯 Arm Controlled Test
            </button>
          )}
        </div>
      </div>

      {/* AI Anomaly Alert Banner (Section 19: Animated Reasoning Screen) */}
      {activeAlertDetail && (
        <div className="rounded-2xl border border-rose-500/50 bg-gradient-to-r from-rose-950/80 via-slate-900/90 to-rose-950/80 p-5 shadow-2xl shadow-rose-950/40 backdrop-blur-xl animate-fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-rose-500/20">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-lg animate-pulse">
                ⚠
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    Anomalous Behaviour Detected
                  </span>
                  <StateBadge state={activeAlertDetail.state} />
                </div>
                <p className="text-xs text-rose-200/90 mt-0.5">
                  Device <strong className="font-mono text-white">{activeAlertDetail.device_id}</strong> crossed anomaly threshold ({activeAlertDetail.anomaly_score} ≥ {activeAlertDetail.threshold}).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">ANOMALY SCORE:</span>
              <span className="rounded-lg bg-rose-500/20 px-3 py-1 font-bold text-rose-300 border border-rose-500/30 text-sm">
                {activeAlertDetail.anomaly_score}
              </span>
            </div>
          </div>

          {/* AI Reasoning Pipeline Steps (Section 19) */}
          <div className="mt-4 pt-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2.5">
              Live AI Reasoning Pipeline
            </p>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center text-xs font-mono">
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
                <span className="text-slate-400 block text-[10px]">STEP 1</span>
                <span className="font-bold text-white">Live Telemetry</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
                <span className="text-slate-400 block text-[10px]">STEP 2</span>
                <span className="font-bold text-white">Feature Extraction</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
                <span className="text-slate-400 block text-[10px]">STEP 3</span>
                <span className="font-bold text-cyan-300">Baseline Delta</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
                <span className="text-slate-400 block text-[10px]">STEP 4</span>
                <span className="font-bold text-indigo-300">Isolation Forest</span>
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-amber-200">
                <span className="text-[10px] block">STEP 5</span>
                <span className="font-bold">Score: {activeAlertDetail.anomaly_score}</span>
              </div>
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/20 p-2 text-rose-200 font-bold animate-pulse">
                <span className="text-[10px] block">RESULT</span>
                <span>{activeAlertDetail.state}</span>
              </div>
            </div>
          </div>

          {/* Explainable Detection Measurements (Section 20 & 21) */}
          {activeAlertDetail.explanations && activeAlertDetail.explanations.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <h4 className="text-xs font-mono font-bold text-white mb-2 uppercase tracking-wider">
                Why was this device flagged? (Observed vs Baseline)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {activeAlertDetail.explanations.map((item, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-2.5 text-xs font-mono ${
                      item.is_anomalous
                        ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                        : "border-white/10 bg-white/5 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">{item.feature}</span>
                      <span className={`text-[10px] font-bold ${item.is_anomalous ? "text-rose-400" : "text-emerald-400"}`}>
                        {item.deviation}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Observed: <strong className="text-white">{item.observed}</strong></span>
                      <span>Baseline: <strong>{item.baseline}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Live Telemetry Chart (2 cols) & Device Inspector (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Telemetry Stream Chart & Network Topology */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live Telemetry Chart (Section 18) */}
          <Panel
            title="Real-Time Network Telemetry Stream"
            kicker="Requests / Second Over Time"
            headerAction={
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Live Rate
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-3 bg-rose-400/60" />
                  Anomaly Zone (&gt;15/s)
                </span>
              </div>
            }
          >
            {/* SVG Real-Time Graph */}
            <div className="relative h-56 w-full rounded-xl border border-white/5 bg-slate-950/60 p-3 flex flex-col justify-between">
              {/* Y-axis indicator */}
              <div className="absolute left-3 top-3 text-[10px] font-mono text-slate-500">
                MAX: {maxRate.toFixed(1)} req/s
              </div>
              <div className="absolute left-3 bottom-3 text-[10px] font-mono text-slate-500">
                0 req/s
              </div>

              {/* Threshold line */}
              <div
                className="absolute left-12 right-4 border-b border-dashed border-rose-500/40 pointer-events-none"
                style={{ top: `${Math.max(10, 100 - (15 / maxRate) * 100)}%` }}
              >
                <span className="absolute -top-3.5 right-0 text-[9px] font-mono text-rose-400 font-bold">
                  THRESHOLD LEVEL (15 req/s)
                </span>
              </div>

              {/* Baseline reference line */}
              <div
                className="absolute left-12 right-4 border-b border-dotted border-emerald-400/30 pointer-events-none"
                style={{ top: `${Math.max(10, 100 - (3.5 / maxRate) * 100)}%` }}
              >
                <span className="absolute -top-3.5 left-0 text-[9px] font-mono text-emerald-400">
                  NORMAL BASELINE (~3.5 req/s)
                </span>
              </div>

              {/* SVG Stream Plot */}
              <div className="h-44 w-full pl-10 pr-2 pt-4">
                <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {/* Grid lines */}
                  <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                  <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                  <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

                  {/* Polyline */}
                  {chartPoints.length > 1 && (
                    <>
                      <defs>
                        <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Area fill */}
                      <polygon
                        points={`0,100 ${chartPoints
                          .map((p, i) => `${(i / (chartPoints.length - 1)) * 100},${100 - (p.rate / maxRate) * 100}`)
                          .join(" ")} 100,100`}
                        fill="url(#streamGrad)"
                      />
                      {/* Stroke line */}
                      <polyline
                        points={chartPoints
                          .map((p, i) => `${(i / (chartPoints.length - 1)) * 100},${100 - (p.rate / maxRate) * 100}`)
                          .join(" ")}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </div>

              {/* Bottom Time Axis */}
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-4">
                <span>{chartPoints[0]?.time || "—"}</span>
                <span>Time (Rolling 2s Windows)</span>
                <span>{chartPoints[chartPoints.length - 1]?.time || "Live"}</span>
              </div>
            </div>
          </Panel>

          {/* Live Causal Behaviour Timeline (Section 14) */}
          <Panel title="Device Behaviour Timeline" kicker="Causal Chain">
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Audience can trace the exact sequence: <strong>Normal Action → Controlled Burst → Rate Spike → AI Anomaly Detection → Recovery</strong>.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {recentActivity.length === 0 ? (
                <EmptyState
                  title="No Activity Recorded"
                  description="Connect an audience participant device to begin streaming causal behavioral events."
                  icon="⏱️"
                  className="py-6"
                />
              ) : (
                recentActivity.slice(0, 12).map((item, idx) => {
                  const isAnomaly = item.detection?.is_anomaly;
                  const isBurst = item.is_burst;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-mono transition-all ${
                        isAnomaly
                          ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                          : isBurst
                          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                          : "border-white/[0.05] bg-white/[0.02] text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-500">{formatTime(item.timestamp)}</span>
                        <strong className="text-white">{item.device_id}</strong>
                        <span className="text-[11px] text-slate-300">{item.action}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.detection && <StateBadge state={item.detection.state} />}
                        {item.metrics?.request_rate && (
                          <span className="text-[10px] text-cyan-300">
                            {item.metrics.request_rate} req/s
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Right Col: Device Behaviour Panel (Section 15) */}
        <div className="space-y-6">
          <Panel
            title="Device Behaviour Inspector"
            kicker={selectedDevice ? `Target: ${selectedDevice}` : "Select Device"}
          >
            {/* Device Switcher Pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {participants.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">No devices joined.</p>
              ) : (
                participants.map((p) => (
                  <button
                    key={p.device_id}
                    type="button"
                    onClick={() => setSelectedDevice(p.device_id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold transition ${
                      selectedDevice === p.device_id
                        ? "bg-cyan-400 text-slate-950 font-bold"
                        : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {p.alias} ({p.device_id})
                  </button>
                ))
              )}
            </div>

            {currentDevice ? (
              <div className="space-y-4 text-xs font-mono">
                {/* Status card */}
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-[11px]">DEVICE STATUS:</span>
                    <StateBadge state={currentDevice.state || "NORMAL"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">ANOMALY SCORE:</span>
                    <span className="font-bold text-white text-sm">
                      {deviceAlert ? deviceAlert.anomaly_score : "0.35"} / 0.65
                    </span>
                  </div>
                </div>

                {/* Measurements vs Baseline (Section 15 & 16) */}
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5 space-y-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    Telemetry Deviation
                  </p>

                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Request Rate:</span>
                    <span className="font-bold text-white">
                      {deviceAlert ? deviceAlert.metrics?.request_rate : "3.0"} req/s
                      <span className="text-[10px] text-slate-500 block text-right font-normal">
                        baseline: ~3.2 req/s
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Inter-Arrival Time:</span>
                    <span className="font-bold text-white">
                      {deviceAlert ? `${deviceAlert.metrics?.inter_arrival_ms} ms` : "280 ms"}
                      <span className="text-[10px] text-slate-500 block text-right font-normal">
                        baseline: ~270 ms
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total Requests Sent:</span>
                    <span className="font-bold text-cyan-300">
                      {currentDevice.request_count || 1} requests
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onSetControlledTarget(currentDevice.device_id)}
                    className="w-full rounded-xl bg-amber-400/10 border border-amber-400/30 px-4 py-2.5 text-xs font-mono font-bold text-amber-300 hover:bg-amber-400/20 transition text-center block"
                  >
                    🎯 Target For Controlled Test
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No Device Selected"
                description="Select a participant device above to inspect its baseline telemetry deviations."
                icon="📱"
                className="py-6"
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

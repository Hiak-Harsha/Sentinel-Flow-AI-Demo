import { useState } from "react";
import { Panel, StateBadge, StatCard, formatTime, formatNumber, EmptyState } from "../components/shared";

export function Devices({
  participants = [],
  activeAlerts = [],
  onSetControlledTarget,
  session,
}) {
  const [selectedDevice, setSelectedDevice] = useState(null);

  const device = participants.find((p) => p.device_id === selectedDevice) || null;
  const alert = activeAlerts.find((a) => a.device_id === selectedDevice) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 backdrop-blur-xl">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Connected Client Devices</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {participants.length} active devices transmitting real telemetry to Sentinel Flow.
          </p>
        </div>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {participants.length === 0 ? (
          <EmptyState
            title="No Audience Devices Connected"
            description="Audience members can join by opening Sentinel Flow and selecting 'Join as Participant' on any smartphone, tablet, or browser tab."
            icon="📱"
          />
        ) : (
          participants.map((p) => {
            const isAlert = activeAlerts.some((a) => a.device_id === p.device_id);
            const isTarget = session?.controlled_target === p.device_id;
            return (
              <div
                key={p.device_id}
                onClick={() => setSelectedDevice(p.device_id)}
                className={`cursor-pointer rounded-2xl border p-5 transition-all hover:border-cyan-400/50 hover:bg-[#0c1626] ${
                  isAlert
                    ? "border-rose-500/50 bg-rose-950/20 shadow-lg shadow-rose-950/30"
                    : selectedDevice === p.device_id
                    ? "border-cyan-400/60 bg-cyan-950/20"
                    : "border-white/10 bg-[#0c1626]/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider block">
                      {p.device_id}
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">{p.alias}</h3>
                  </div>
                  <StateBadge state={p.state || (isAlert ? "ANOMALOUS" : "NORMAL")} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono my-3 border-y border-white/5 py-2.5">
                  <div>
                    <span className="text-slate-500 text-[10px] block">TOTAL REQUESTS</span>
                    <span className="font-bold text-white">{p.request_count || 1}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">LAST ACTION</span>
                    <span className="font-bold text-slate-300 truncate block">{p.last_action || "Joined"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono mt-3">
                  <span className="text-[10px] text-slate-500">Joined: {formatTime(p.joined_at)}</span>
                  {isTarget && (
                    <span className="rounded bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-300 border border-amber-400/20">
                      TARGET DEVICE
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Device Detail Inspector Modal / Drawer (Section 32) */}
      {device && (
        <div className="rounded-2xl border border-white/10 bg-[#0c1626] p-6 shadow-2xl space-y-5">
          <div className="flex items-start justify-between border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-cyan-400">{device.device_id}</span>
                <span className="text-lg font-bold text-white">— {device.alias}</span>
                <StateBadge state={device.state || "NORMAL"} />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Detailed behavioural telemetry audit and AI assessment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDevice(null)}
              className="text-xs font-mono text-slate-400 hover:text-white"
            >
              ✕ Close Detail
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="Total Activity" value={device.request_count || 1} sub="HTTP Requests" icon="📊" />
            <StatCard label="Device Status" value={device.state || "NORMAL"} sub="State Machine" icon="🛡️" />
            <StatCard
              label="Anomaly Score"
              value={alert ? alert.anomaly_score : "0.35"}
              sub="Threshold: 0.65"
              icon="🧠"
            />
            <StatCard
              label="Target Status"
              value={session?.controlled_target === device.device_id ? "ARMED" : "STANDBY"}
              sub="Controlled Event"
              icon="🎯"
            />
          </div>

          {alert && alert.explanations && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
              <h4 className="text-xs font-mono font-bold text-rose-300 mb-2 uppercase">
                Observed Anomaly Deviations
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {alert.explanations.map((exp, idx) => (
                  <div key={idx} className="rounded-lg bg-black/40 p-2.5 text-xs font-mono border border-rose-500/20">
                    <div className="flex justify-between font-bold text-white mb-1">
                      <span>{exp.feature}</span>
                      <span className="text-rose-400">{exp.deviation}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex justify-between">
                      <span>Observed: {exp.observed}</span>
                      <span>Baseline: {exp.baseline}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onSetControlledTarget(device.device_id)}
              className="rounded-xl bg-amber-400/10 border border-amber-400/30 px-4 py-2 text-xs font-mono font-bold text-amber-300 hover:bg-amber-400/20 transition"
            >
              🎯 Arm Controlled Stress Test for {device.alias}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

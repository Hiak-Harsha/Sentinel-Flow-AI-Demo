import { Panel, ThreatBadge, StateBadge, StatCard, formatTime, EmptyState } from "../components/shared";

export function Overview({
  session,
  threatLevel,
  activeDevicesCount,
  requestsPerSec,
  activeAlerts,
  recentActivity = [],
  academicModelReady,
  onNavigate,
}) {
  const joinCode = session?.join_code || "SF-DEMO";
  const anomaliesCount = activeAlerts?.length || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner: Product Onboarding & Mission (Section 60) */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 p-6 backdrop-blur-xl shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300 border border-cyan-400/20">
                CYBERSECURITY AI MONITORING
              </span>
              <ThreatBadge level={threatLevel} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Sentinel Flow Command Center
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Real-time behavioural telemetry observation and dual-layer AI anomaly detection.
              Monitors actual network activity from connected devices, learns empirical baselines,
              and detects anomalies using Isolation Forest and supervised classifiers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate("live")}
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-2.5 text-xs font-mono font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:opacity-95"
            >
              ⚡ Open Live Monitor
            </button>
            <button
              type="button"
              onClick={() => onNavigate("participant")}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs font-mono font-bold text-cyan-300 transition-all hover:bg-cyan-400/20"
            >
              📱 Join As Device ({joinCode})
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="System Status"
          value="MONITORING"
          sub="Telemetry Engine Active"
          icon="🛡️"
        />
        <StatCard
          label="Active Devices"
          value={activeDevicesCount}
          sub="Connected Endpoints"
          icon="💻"
        />
        <StatCard
          label="Live Throughput"
          value={`${requestsPerSec} req/s`}
          sub="Observed Rate"
          icon="⚡"
        />
        <StatCard
          label="Active Anomalies"
          value={anomaliesCount}
          sub={anomaliesCount > 0 ? "Requires Attention" : "All Clear"}
          icon="⚠"
          trend={anomaliesCount > 0 ? 100 : null}
        />
        <StatCard
          label="AI Model State"
          value={academicModelReady ? "ONLINE" : "READY"}
          sub="RF + Isolation Forest"
          icon="🧠"
        />
      </div>

      {/* Main Grid: Causal Workflow & Real-Time Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Architectural Pipeline & Live Threat Context */}
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Real-Time Detection Architecture" kicker="Two-Layer AI System">
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Sentinel Flow does not falsely represent synthetic UNSW-NB15 seeds as participant traffic.
              Instead, it implements a scientifically honest two-layer architecture:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-wider">Layer A: Academic ML</span>
                  <span className="text-[10px] font-mono text-cyan-400">UNSW-NB15</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Supervised Intrusion Classifier</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Trained and benchmarked on official UNSW-NB15 dataset. Compares Random Forest (Champion: 93.47% acc, 98.68% recall), HistGradientBoosting, and Decision Trees.
                </p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span>Validated offline with zero test leakage</span>
                </div>
              </div>

              <div className="rounded-xl border border-indigo-400/20 bg-indigo-950/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-wider">Layer B: Live AI</span>
                  <span className="text-[10px] font-mono text-indigo-400">Telemetry</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Behavioral Anomaly Detector</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Learns empirical normal baseline distributions from connected devices. Detects rate spikes, arrival bursts, and volume deviations using Isolation Forest (100 Trees).
                </p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  <span>Real HTTP traffic from connected devices</span>
                </div>
              </div>
            </div>

            {/* Step-by-Step Flow Pipeline */}
            <div className="mt-5 rounded-xl border border-white/5 bg-slate-950/50 p-4">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-3">Core Demonstration Flow</p>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-200">1. Real User Joins</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-200">2. Normal Activity</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-200">3. Baseline Profile</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-1">4. Controlled Burst</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2.5 py-1">5. AI Detects Anomaly</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2.5 py-1">6. Explanation & Recovery</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Col: Live Causal Activity Stream */}
        <div className="space-y-6">
          <Panel title="Live Activity Stream" kicker="Real-Time Telemetry">
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {recentActivity.length === 0 ? (
                <EmptyState
                  title="Awaiting Telemetry Stream"
                  description="Open the Participant App or connect a device to see real-time requests and anomaly scores."
                  icon="📡"
                  className="py-8"
                />
              ) : (
                recentActivity.slice(0, 15).map((evt, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 text-xs transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 font-mono text-[10px] text-cyan-400">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-white truncate">{evt.device_id || "Device"}</span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">{formatTime(evt.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5 truncate">{evt.action || "Observed request"}</p>
                      {evt.detection && (
                        <div className="mt-1 flex items-center gap-2">
                          <StateBadge state={evt.detection.state} />
                          <span className="text-[10px] font-mono text-slate-400">
                            Score: {evt.detection.anomaly_score}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

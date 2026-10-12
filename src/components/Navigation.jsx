import { ThreatBadge } from "./shared";

export function Navigation({
  activeTab,
  setActiveTab,
  session,
  threatLevel,
  wsStatus,
  devicesCount,
  activeAlertsCount,
  onNewSession,
  isBusy,
  role = "operator",
  onLogout,
}) {
  const joinCode = session?.join_code || (session?.id ? `SF-${session.id.slice(0, 4).toUpperCase()}` : "SF-DEMO");

  const operatorTabs = [
    { id: "command", label: "Command Center", icon: "⚡", highlight: true },
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "live", label: "Live Monitor", icon: "📡", badge: activeAlertsCount > 0 ? activeAlertsCount : null },
    { id: "topology", label: "Topology Radar", icon: "🌐" },
    { id: "targets", label: "Target Config", icon: "⚙️" },
    { id: "devices", label: "Devices & Identity", icon: "💻", count: devicesCount },
    { id: "analytics", label: "Analytics", icon: "📈" },
    { id: "history", label: "History", icon: "🕒" },
    { id: "model", label: "AI Model", icon: "🧠" },
  ];

  const participantTabs = [
    { id: "participant", label: "Participant Device App", icon: "📱" },
    { id: "attack", label: "Launch Scenario", icon: "🎯", highlight: true },
  ];

  const visibleTabs = role === "operator" ? operatorTabs : participantTabs;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#060d19]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {/* Top Command Bar */}
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 font-mono text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20">
              SF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white font-mono">SENTINEL FLOW</span>
                <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                  v2.0
                </span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                  role === "operator"
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                    : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                }`}>
                  ROLE: {role}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">AI-Based Network Intrusion & Anomaly Detection</p>
            </div>
          </div>

          {/* Center: Session & Threat Status */}
          <div className="hidden md:flex items-center gap-3">
            {/* Join Code Pill */}
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs">
              <span className="text-slate-400 text-[11px]">SESSION CODE:</span>
              <span className="font-bold text-cyan-300 tracking-wider">{joinCode}</span>
            </div>

            {/* Threat Badge */}
            <ThreatBadge level={threatLevel} />

            {/* WebSocket Status */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  wsStatus === "connected"
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                    : wsStatus === "reconnecting"
                    ? "bg-amber-400 animate-ping"
                    : "bg-rose-400"
                }`}
              />
              <span className="hidden lg:inline">{wsStatus === "connected" ? "LIVE WS" : "RECONNECTING"}</span>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5">
            {role === "operator" && (
              <button
                type="button"
                onClick={onNewSession}
                disabled={isBusy}
                className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-mono font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                ↻ New Session
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white hover:border-slate-500 transition-all"
              >
                Switch Role ↩
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 overflow-x-auto py-2.5 scrollbar-none" aria-label="Main Navigation">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20"
                    : tab.highlight
                    ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-mono font-black text-white animate-pulse">
                    {tab.badge}
                  </span>
                )}
                {typeof tab.count === "number" && (
                  <span className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${isActive ? "bg-slate-900/30 text-slate-950" : "bg-white/10 text-slate-400"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

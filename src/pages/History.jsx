import { useState } from "react";
import { Panel, StatCard, formatTime, EmptyState } from "../components/shared";

export function History({ history = [], session }) {
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Combine current active session with archived history
  const allSessions = [
    ...(session ? [{ ...session, is_current: true }] : []),
    ...history.filter((h) => h.id !== session?.id),
  ];

  const activeDetail = allSessions.find((s) => s.id === selectedSessionId) || allSessions[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 backdrop-blur-xl">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Demonstration Sessions History</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Archived demonstration timelines, participant counts, and anomaly detection logs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <div className="space-y-3">
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold px-1">
            Recorded Sessions ({allSessions.length})
          </p>
          {allSessions.length === 0 ? (
            <EmptyState
              title="No Archived Sessions"
              description="Demonstration sessions will be recorded here automatically once started."
              icon="📜"
            />
          ) : (
            allSessions.map((s) => {
              const isSelected = activeDetail?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? "border-cyan-400/60 bg-cyan-950/20"
                      : "border-white/10 bg-[#0c1626]/80 hover:bg-[#0c1626]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-white">
                      {s.join_code || s.id?.slice(0, 8)}
                    </span>
                    {s.is_current ? (
                      <span className="rounded bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-300 border border-emerald-400/20">
                        ACTIVE SESSION
                      </span>
                    ) : (
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[9px] font-mono text-slate-400">
                        ARCHIVED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Started: {formatTime(s.started_at || s.created_at)}</span>
                    <span>Status: {s.status || "COMPLETED"}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Session Inspector */}
        <div className="lg:col-span-2">
          {activeDetail ? (
            <Panel
              title={`Session Audit: ${activeDetail.join_code || activeDetail.id?.slice(0, 8)}`}
              kicker={activeDetail.is_current ? "Active Live Demonstration" : "Archived Session"}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard label="Session Code" value={activeDetail.join_code || "SF-DEMO"} sub="Access Token" icon="🔑" />
                <StatCard label="Phase" value={activeDetail.phase || "LIVE"} sub="Demonstration State" icon="⚡" />
                <StatCard label="Controlled Target" value={activeDetail.controlled_target || "None"} sub="Target Device" icon="🎯" />
                <StatCard label="Status" value={activeDetail.status || "ACTIVE"} sub="Lifecycle" icon="🛡️" />
              </div>

              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-4 font-mono text-xs space-y-2">
                <div className="flex justify-between border-b border-white/5 pb-2 text-slate-300">
                  <span className="text-slate-500">Session ID:</span>
                  <span className="text-white">{activeDetail.id}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2 text-slate-300">
                  <span className="text-slate-500">Created Timestamp:</span>
                  <span className="text-white">{formatTime(activeDetail.created_at)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Target Endpoint:</span>
                  <span className="text-cyan-300">Sentinel Flow Telemetry Engine (Port 8000)</span>
                </div>
              </div>
            </Panel>
          ) : (
            <EmptyState
              title="No Session Selected"
              description="Select an active or archived demonstration session from the list on the left to inspect its detailed telemetry audit and phase history."
              icon="🔍"
            />
          )}
        </div>
      </div>
    </div>
  );
}

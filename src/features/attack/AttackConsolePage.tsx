import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/design/components/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/design/components/Card";
import { Tag } from "@/design/components/Tag";
import { StatusDot } from "@/design/components/StatusDot";
import { showToast } from "@/design/components/Toast";
import {
  Swords,
  PowerOff,
  RotateCcw,
  Users,
  ShieldAlert,
  Terminal,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
  PauseCircle,
  PlayCircle,
  Sliders,
} from "lucide-react";
import { useRealtimeEvent } from "@/realtime/useRealtime";

export default function AttackConsolePage() {
  const queryClient = useQueryClient();
  const [effectLogs, setEffectLogs] = useState<string[]>([]);

  // 1. Fetch Session & Operator Authorization
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["session", "operator"],
    queryFn: () => api.getSession().catch(() => null),
    refetchInterval: 3000,
  });

  // 2. Fetch Active Runs
  const { data: runsData = [], refetch: refetchRuns } = useQuery({
    queryKey: ["operator_runs"],
    queryFn: () => api.operator.listRuns().catch(() => []),
    refetchInterval: 2000,
  });

  // 3. WebSocket Realtime Events
  useRealtimeEvent("attack.progress", (env) => {
    if (env.data) {
      setEffectLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] ATTACK PROGRESS: ${env.data.scenario} (${env.data.participant_identity_id || "participant"}) - ${env.data.progress_percent || 0}%`,
        ...prev.slice(0, 49),
      ]);
    }
  });

  useRealtimeEvent("attack.finished", (env) => {
    refetchRuns();
    setEffectLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ATTACK HALTED: ${env.data?.scenario} (status: ${env.data?.status || "COMPLETED"})`,
      ...prev.slice(0, 49),
    ]);
  });

  useRealtimeEvent("emergency_stop.engaged", () => {
    refetchSession();
    refetchRuns();
    showToast.error("Emergency Stop Active", "Operator engaged kill switch across all runs.");
  });

  // Circuit Breaker Actions
  const handleTripEmergencyStop = async () => {
    try {
      await api.operator.tripCircuitBreaker();
      showToast.error("Emergency Stop Engaged", "All active participant scenarios halted.");
      refetchSession();
      refetchRuns();
    } catch (err: any) {
      showToast.error("Emergency Stop Error", err?.message);
    }
  };

  const handleResetEmergencyStop = async () => {
    try {
      await api.operator.resetCircuitBreaker();
      showToast.success("Circuit Breaker Reset", "Normal exercise execution resumed.");
      refetchSession();
      refetchRuns();
    } catch (err: any) {
      showToast.error("Reset Error", err?.message);
    }
  };

  const handleSetPhase = async (phase: string) => {
    try {
      await api.operator.setPhase(phase);
      showToast.success("Phase Changed", `Exercise transitioned to ${phase}`);
      refetchSession();
    } catch (err: any) {
      showToast.error("Phase Transition Failed", err?.message);
    }
  };

  const handleSuspendParticipant = async (participantId: string) => {
    try {
      await api.operator.suspendParticipant(participantId);
      showToast.warning("Participant Suspended", `Identity ${participantId} has been revoked.`);
      refetchSession();
    } catch (err: any) {
      showToast.error("Suspend Error", err?.message);
    }
  };

  const session = sessionData?.session;
  const currentPhase = session?.current_phase || "EXERCISE_OPEN";
  const participants = sessionData?.participants || [];
  const isCircuitBreakerTripped = Boolean(sessionData?.circuit_breaker?.tripped);
  const activeRuns = Array.isArray(runsData) ? runsData : [];

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Red Team Activity Monitor"
        description="Defensive participant supervision, real-time exercise control, and emergency circuit breaker."
        badge={<Tag variant="amber" size="sm">DEFENSIVE CONSOLE</Tag>}
        actions={
          <div className="flex items-center gap-2">
            {isCircuitBreakerTripped ? (
              <Button
                variant="primary"
                size="sm"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={handleResetEmergencyStop}
              >
                Reset Emergency Stop
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                icon={<PowerOff className="w-4 h-4" />}
                onClick={handleTripEmergencyStop}
              >
                Emergency Kill Switch
              </Button>
            )}
          </div>
        }
      />

      {/* 1. Circuit Breaker & Exercise FSM Status Card */}
      <Card className={isCircuitBreakerTripped ? "border-[#f4526b]/50 bg-[#2b1218]/20" : ""}>
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase text-[#9aa0a6]">CIRCUIT BREAKER:</span>
              {isCircuitBreakerTripped ? (
                <span className="text-xs font-mono font-bold text-[#f4526b] flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> STOP ENGAGED (ALL ATTACKS BLOCKED)
                </span>
              ) : (
                <span className="text-xs font-mono font-bold text-[#3ddc97] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> NOMINAL (ATTACKS AUTHORIZED IN EXERCISE_OPEN)
                </span>
              )}
            </div>
            <p className="text-xs text-[#9aa0a6]">
              Target: <span className="text-[#f0f2f5] font-mono">http://127.0.0.1:8000/lab-target</span> · Room Code: <strong className="text-[#ffb454] font-mono">{session?.join_code || "HAK-4921"}</strong>
            </p>
          </div>

          {/* Phase Control Buttons */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090c10] border border-[rgba(255,255,255,0.08)]">
            {["LOBBY", "WARMUP", "EXERCISE_OPEN", "DEBRIEF"].map((phase) => (
              <button
                key={phase}
                type="button"
                onClick={() => handleSetPhase(phase)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                  currentPhase === phase
                    ? "bg-[#2d1f0b] text-[#ffb454] font-bold border border-[#fe9a00]/40"
                    : "text-[#9aa0a6] hover:text-[#f0f2f5]"
                }`}
              >
                {phase}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Active Participant Attack Runs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-[#ff7a45]" />
              <span>Active Participant Attacks</span>
            </CardTitle>
            <Tag variant="neutral" size="sm">{activeRuns.length} TOTAL RUNS</Tag>
          </div>
          <CardDescription>
            Live intrusion scenarios initiated by authenticated red team participants
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeRuns.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[#5f6368]">
              No active participant scenarios currently running.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.07)] text-[#5f6368] uppercase">
                    <th className="py-2.5 px-3">RUN ID</th>
                    <th className="py-2.5 px-3">PARTICIPANT</th>
                    <th className="py-2.5 px-3">SCENARIO</th>
                    <th className="py-2.5 px-3">TARGET</th>
                    <th className="py-2.5 px-3">STATUS</th>
                    <th className="py-2.5 px-3">PROGRESS</th>
                    <th className="py-2.5 px-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {activeRuns.map((r: any) => (
                    <tr key={r.run_id} className="hover:bg-[#111417]">
                      <td className="py-2.5 px-3 text-[#ffb454] font-semibold">{r.run_id}</td>
                      <td className="py-2.5 px-3 text-[#f0f2f5]">{r.participant_identity_id || "participant"}</td>
                      <td className="py-2.5 px-3 text-[#f0f2f5]">{r.scenario}</td>
                      <td className="py-2.5 px-3 text-[#9aa0a6]">{r.target_origin}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === "RUNNING"
                              ? "bg-[#2d1f0b] text-[#ffb454] border border-[#fe9a00]/40"
                              : r.status === "COMPLETED"
                              ? "bg-[#0d281e] text-[#3ddc97]"
                              : "bg-[#2b1218] text-[#f4526b]"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 w-36">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#16181c] h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#fe9a00]"
                              style={{ width: `${r.progress_percent || 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#9aa0a6]">{r.progress_percent || 0}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.status === "RUNNING" && (
                          <button
                            type="button"
                            onClick={() => api.red.stopRun(r.run_id).then(() => refetchRuns())}
                            className="text-xs text-[#f4526b] hover:underline"
                          >
                            Halt Run
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Connected Participant Roster & Quota Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#fe9a00]" />
                <span>Participant Roster & Quota Limits</span>
              </CardTitle>
              <Tag variant="neutral" size="sm">{participants.length} CONNECTED</Tag>
            </div>
            <CardDescription>
              Supervise individual participant activity, quotas, and suspension status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-[#5f6368]">
                No participants joined room {session?.join_code || "HAK-4921"} yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono text-left">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.07)] text-[#5f6368] uppercase">
                      <th className="py-2 px-3">ALIAS</th>
                      <th className="py-2 px-3">DEVICE ID</th>
                      <th className="py-2 px-3">THREAT SCORE</th>
                      <th className="py-2 px-3">STATUS</th>
                      <th className="py-2 px-3 text-right">CONTROL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                    {participants.map((p: any) => (
                      <tr key={p.device_id || p.id} className="hover:bg-[#111417]">
                        <td className="py-2.5 px-3 font-semibold text-[#f0f2f5]">{p.alias || "Participant"}</td>
                        <td className="py-2.5 px-3 text-[#9aa0a6]">{p.device_id || p.id}</td>
                        <td className="py-2.5 px-3 text-[#ffb454] font-bold">
                          {p.threat_score ? `${(p.threat_score * 100).toFixed(0)}%` : "4%"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.status === "SUSPENDED"
                                ? "bg-[#2b1218] text-[#f4526b]"
                                : "bg-[#0d281e] text-[#3ddc97]"
                            }`}
                          >
                            {p.status || "ACTIVE"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleSuspendParticipant(p.device_id || p.id)}
                            className="text-xs text-[#f4526b] hover:underline"
                          >
                            {p.status === "SUSPENDED" ? "Re-activate" : "Suspend"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Live Telemetry Event Stream */}
        <Card className="lg:col-span-2 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#fe9a00]" />
                <span>Execution Activity Log</span>
              </CardTitle>
              <StatusDot status="live" label="STREAM" />
            </div>
            <CardDescription className="text-xs">
              Live progression emitted from active participant load drivers
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-3 bg-[#06080b] font-mono text-[11px] text-[#9aa0a6] overflow-y-auto space-y-1 h-64 sf-tabular rounded-b-xl border-t border-[rgba(255,255,255,0.06)]">
            {effectLogs.length === 0 ? (
              <div className="text-center py-10 text-[#5f6368] italic">
                Awaiting participant activity events...
              </div>
            ) : (
              effectLogs.map((log, idx) => (
                <div key={idx} className="leading-tight">
                  {log}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

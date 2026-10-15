import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";
import { useChannel, useRealtimeEvent } from "@/realtime/useRealtime";
import {
  ArrowLeft,
  LogOut,
  Swords,
  Play,
  Square,
  Shield,
  Layers,
  Terminal,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Button } from "@/design/components/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design/components/Card";
import { Tag } from "@/design/components/Tag";
import { Pill } from "@/design/components/Pill";
import { StatusDot } from "@/design/components/StatusDot";
import { SeverityBadge } from "@/design/components/SeverityBadge";
import { KpiCard } from "@/design/components/KpiCard";
import { Input } from "@/design/components/Input";
import { Select } from "@/design/components/Select";

const SCENARIOS = [
  {
    id: "credential_stuffing",
    name: "Brute Force / Credential Stuffing",
    mitre: "T1110",
    description: "Rapid multi-account authentication attempts against login endpoints, generating auth.failure anomalies.",
    defaultRate: 8,
    defaultDuration: 10,
  },
  {
    id: "port_scan",
    name: "Port Discovery Scan",
    mitre: "T1046",
    description: "Multi-port service discovery scan across common web & database ports (21, 22, 80, 443, 3306, 5432).",
    defaultRate: 15,
    defaultDuration: 8,
  },
  {
    id: "burst_dos",
    name: "Volumetric Rate Burst / DoS",
    mitre: "T1499",
    description: "High-frequency HTTP load burst designed to push endpoint response latencies past normal baseline SLA.",
    defaultRate: 20,
    defaultDuration: 10,
  },
  {
    id: "canary_probe",
    name: "Canary Exploit Traps",
    mitre: "T1190",
    description: "Safe non-destructive canary traps (SQL syntax tests, traversal probes) to verify instant rule detection.",
    defaultRate: 5,
    defaultDuration: 5,
  },
];

export default function ParticipantPage() {
  const [enrolled, setEnrolled] = useState<{
    joinCode: string;
    alias: string;
    deviceId: string;
    token: string;
  } | null>(null);

  // Form states
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [aliasInput, setAliasInput] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("credential_stuffing");
  const [requestsPerSec, setRequestsPerSec] = useState(10);
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [isLaunching, setIsLaunching] = useState(false);
  const [activeRun, setActiveRun] = useState<any>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  // Query classroom session info
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["session", "participant"],
    queryFn: () => api.getSession().catch(() => null),
    refetchInterval: 3000,
  });

  // Query my runs
  const { data: myRuns = [], refetch: refetchMyRuns } = useQuery({
    queryKey: ["myRuns", enrolled?.alias],
    queryFn: () => api.red.listRuns().catch(() => []),
    enabled: Boolean(enrolled),
    refetchInterval: 2000,
  });

  // Restore stored session
  useEffect(() => {
    const token = sessionStorage.getItem("sf_session_token");
    const deviceId = sessionStorage.getItem("sf_device_fingerprint");
    const alias = sessionStorage.getItem("sf_participant_alias") || "Red-Operator";
    const role = sessionStorage.getItem("sf_role");
    const savedCode = sessionStorage.getItem("sf_join_code");
    if (savedCode) setJoinCodeInput(savedCode);

    if (token && deviceId && role === "participant") {
      setEnrolled({ joinCode: savedCode || "ACTIVE", alias, deviceId, token });
    }
  }, []);

  // Listen to WebSocket events for run progress and effects
  useRealtimeEvent("run.progress", (envelope) => {
    const data = envelope.data;
    if (data && (!data.participant_identity_id || data.participant_identity_id === enrolled?.deviceId)) {
      if (activeRun && activeRun.run_id === data.run_id) {
        setActiveRun((prev: any) => ({ ...prev, ...data }));
      }
      setTerminalLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] PROG ${data.progress_percent || 0}% — ${data.message || "Executing load burst..."}`,
        ...prev.slice(0, 49),
      ]);
    }
  });

  useRealtimeEvent("run.completed", (envelope) => {
    const data = envelope.data;
    if (activeRun && (activeRun.run_id === data?.run_id || !data?.run_id)) {
      setActiveRun(null);
      setTerminalLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] COMPLETE Scenario execution halted. Results compiled.`,
        ...prev.slice(0, 49),
      ]);
      refetchMyRuns();
      showToast.success("Scenario Completed", "Attack run execution finished.");
    }
  });

  useRealtimeEvent("circuit_breaker.tripped", () => {
    setActiveRun(null);
    setTerminalLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] EMERGENCY STOP TRIPPED BY OPERATOR. All runs killed.`,
      ...prev.slice(0, 49),
    ]);
  });

  const session = sessionData?.session;
  const currentPhase = session?.current_phase || "EXERCISE_OPEN";
  const quotaLimit = sessionData?.authorization?.quota_per_participant || 10;
  const myUsedRuns = myRuns.length;
  const quotaRemaining = Math.max(0, quotaLimit - myUsedRuns);
  const isPhaseOpen = currentPhase === "EXERCISE_OPEN";
  const isEmergencyStop = Boolean(sessionData?.circuit_breaker?.tripped);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) {
      showToast.error("Missing Code", "Please enter classroom join code.");
      return;
    }
    const resolvedAlias = aliasInput.trim() || `Attacker-${Math.floor(100 + Math.random() * 900)}`;

    try {
      const res = await api.joinSession(joinCodeInput.trim().toUpperCase(), resolvedAlias);
      const enrolledData = {
        joinCode: joinCodeInput.trim().toUpperCase(),
        alias: res.alias || resolvedAlias,
        deviceId: res.device_id || `pt_${Date.now().toString().slice(-6)}`,
        token: res.token || res.session_token || "tok_participant",
      };
      sessionStorage.setItem("sf_role", "participant");
      sessionStorage.setItem("sf_user", enrolledData.alias);
      sessionStorage.setItem("sf_session_token", enrolledData.token);
      sessionStorage.setItem("sf_device_fingerprint", enrolledData.deviceId);
      sessionStorage.setItem("sf_participant_alias", enrolledData.alias);
      setEnrolled(enrolledData);
      showToast.success("Enrolled in Arena", `Welcome ${enrolledData.alias}!`);
    } catch (err: any) {
      showToast.error("Join Denied", err?.message || "Invalid room code or session expired.");
    }
  };

  const handleLeave = () => {
    sessionStorage.removeItem("sf_session_token");
    sessionStorage.removeItem("sf_device_fingerprint");
    sessionStorage.removeItem("sf_participant_alias");
    setEnrolled(null);
    setActiveRun(null);
    setTerminalLogs([]);
    showToast.info("Left Session", "Exited red team room.");
  };

  const handleLaunch = async () => {
    if (!enrolled) return;
    if (!isPhaseOpen) {
      showToast.error("Phase Locked", `Attacks are only permitted in EXERCISE_OPEN (current: ${currentPhase}).`);
      return;
    }
    if (quotaRemaining <= 0) {
      showToast.error("Quota Exceeded", `You have used all ${quotaLimit} allowed scenario runs.`);
      return;
    }
    if (isEmergencyStop) {
      showToast.error("Circuit Breaker Active", "The operator has engaged Emergency Stop.");
      return;
    }

    setIsLaunching(true);
    setTerminalLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] INITIATING ${selectedScenario.toUpperCase()} target=http://127.0.0.1:8000`,
      ...prev,
    ]);

    try {
      const res = await api.red.startRun(selectedScenario, null, requestsPerSec * durationSeconds);
      setActiveRun(res);
      showToast.success("Attack Launched", `Scenario ${selectedScenario} running under identity ${enrolled.alias}`);
      refetchMyRuns();
    } catch (err: any) {
      showToast.error("Launch Rejected", err?.message || "Failed to start attack scenario.");
      setTerminalLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] ERROR ${err?.message || "Launch rejected by defense gate."}`,
        ...prev,
      ]);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStopRun = async (runId: string) => {
    try {
      await api.red.stopRun(runId);
      setActiveRun(null);
      showToast.info("Scenario Stopped", `Run ${runId} halted.`);
      refetchMyRuns();
    } catch (err: any) {
      showToast.error("Stop Error", err?.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#090c10] text-[#f0f2f5] p-3 sm:p-5 flex flex-col justify-between selection:bg-[#fe9a00]/30 selection:text-white">
      {/* Top Navbar */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.07)] mb-4">
        <Link
          to="/"
          className="text-xs font-mono text-[#9aa0a6] hover:text-[#f0f2f5] flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Main Portal</span>
        </Link>

        {enrolled && (
          <div className="flex items-center gap-3">
            <Pill size="sm" variant="brand" label="RED TEAM" value={enrolled.alias} />
            <button
              type="button"
              onClick={handleLeave}
              className="text-xs font-mono text-[#f4526b] hover:text-[#ff7a45] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Screen Container */}
      <main className="max-w-5xl mx-auto w-full flex-1 flex flex-col justify-center py-2">
        {!enrolled ? (
          /* Join Room Screen */
          <div className="max-w-md mx-auto w-full space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-[#2d1f0b] border border-[#fe9a00]/30 flex items-center justify-center mx-auto text-[#fe9a00]">
                <Swords className="w-6 h-6" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#f0f2f5]">
                Join Red Team Arena
              </h1>
              <p className="text-xs text-[#9aa0a6] leading-relaxed">
                Connect your device to the active classroom cyber exercise using the operator's room code.
              </p>
            </div>

            <Card>
              <CardContent className="p-6">
                <form onSubmit={handleJoin} className="space-y-4">
                  <Input
                    label="Classroom Room Code"
                    placeholder="e.g. HAK-4921"
                    mono
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    helperText={session?.join_code ? `Current active room: ${session.join_code}` : "Provided by lab instructor"}
                  />

                  <Input
                    label="Participant Alias"
                    placeholder="e.g. ShadowHunter"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    helperText="Your pseudonym on the operator's detection board"
                  />

                  <div className="p-3 rounded-lg bg-[#090c10] border border-[rgba(255,255,255,0.06)] space-y-1.5 text-xs font-mono">
                    <div className="text-[10px] text-[#9aa0a6] uppercase tracking-wider">Target Authorization</div>
                    <div className="text-[#f0f2f5] font-semibold truncate">http://127.0.0.1:8000/lab-target</div>
                    <div className="text-[10px] text-[#3ddc97] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Private RFC 1918 loopback boundary verified
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-full justify-center"
                  >
                    <span>Enter Arena</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Active Participant Console */
          <div className="space-y-6">
            {/* Top Status & Quota Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="text-[10px] font-mono text-[#9aa0a6] uppercase">ROOM CODE</div>
                <div className="font-mono text-sm font-bold text-[#ffb454] mt-1">{enrolled.joinCode}</div>
              </Card>

              <Card className="p-3">
                <div className="text-[10px] font-mono text-[#9aa0a6] uppercase">EXERCISE PHASE</div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusDot status={isPhaseOpen ? "live" : "standby"} />
                  <span className={`text-xs font-mono font-bold ${isPhaseOpen ? "text-[#3ddc97]" : "text-[#e9c46a]"}`}>
                    {currentPhase}
                  </span>
                </div>
              </Card>

              <Card className="p-3">
                <div className="text-[10px] font-mono text-[#9aa0a6] uppercase">ATTACK QUOTA</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-sm font-bold text-[#f0f2f5]">
                    {quotaRemaining} / {quotaLimit}
                  </span>
                  <span className="text-[10px] font-mono text-[#9aa0a6]">runs left</span>
                </div>
                <div className="w-full bg-[#16181c] h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-[#fe9a00] transition-all duration-300"
                    style={{ width: `${(myUsedRuns / quotaLimit) * 100}%` }}
                  />
                </div>
              </Card>

              <Card className="p-3">
                <div className="text-[10px] font-mono text-[#9aa0a6] uppercase">CIRCUIT BREAKER</div>
                <div className="flex items-center gap-1.5 mt-1">
                  {isEmergencyStop ? (
                    <span className="text-xs font-mono text-[#f4526b] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> STOP ENGAGED
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-[#3ddc97] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> CLEAR TO PROCEED
                    </span>
                  )}
                </div>
              </Card>
            </div>

            {/* Attack Launcher & Active Run Row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left Column: Scenario Launcher (3 cols) */}
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Swords className="w-4 h-4 text-[#fe9a00]" />
                    <span>Attack Vector Selector</span>
                  </CardTitle>
                  <CardDescription>
                    Select a bounded scenario to execute under identity <span className="font-mono text-[#ffb454]">{enrolled.alias}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Scenario Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SCENARIOS.map((sc) => {
                      const isSelected = selectedScenario === sc.id;
                      return (
                        <div
                          key={sc.id}
                          onClick={() => {
                            setSelectedScenario(sc.id);
                            setRequestsPerSec(sc.defaultRate);
                            setDurationSeconds(sc.defaultDuration);
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? "bg-[#2d1f0b] border-[#fe9a00] shadow-sm"
                              : "bg-[#090c10] border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.18)]"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-[#f0f2f5]">{sc.name}</span>
                              <Tag variant={isSelected ? "amber" : "neutral"} size="sm">{sc.mitre}</Tag>
                            </div>
                            <p className="text-[11px] text-[#9aa0a6] leading-tight line-clamp-2">
                              {sc.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Parameter Controls */}
                  <div className="p-3.5 rounded-xl bg-[#090c10] border border-[rgba(255,255,255,0.06)] space-y-3">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-[#9aa0a6]">RATE LIMIT:</span>
                      <span className="text-[#f0f2f5] font-bold">{requestsPerSec} requests / sec</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={20}
                      value={requestsPerSec}
                      onChange={(e) => setRequestsPerSec(Number(e.target.value))}
                      className="w-full accent-[#fe9a00] cursor-pointer"
                    />

                    <div className="flex justify-between items-center text-xs font-mono pt-1">
                      <span className="text-[#9aa0a6]">DURATION CAP:</span>
                      <span className="text-[#f0f2f5] font-bold">{durationSeconds} seconds</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={15}
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(Number(e.target.value))}
                      className="w-full accent-[#fe9a00] cursor-pointer"
                    />
                  </div>

                  {/* Launch Button */}
                  <div className="pt-2">
                    <Button
                      variant="primary"
                      size="lg"
                      disabled={isLaunching || !isPhaseOpen || quotaRemaining <= 0 || isEmergencyStop || Boolean(activeRun)}
                      onClick={handleLaunch}
                      className="w-full justify-center text-xs font-bold font-mono uppercase tracking-wider py-3"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {!isPhaseOpen
                        ? `LOCKED (${currentPhase})`
                        : quotaRemaining <= 0
                        ? "QUOTA EXHAUSTED"
                        : isEmergencyStop
                        ? "EMERGENCY STOP ACTIVE"
                        : activeRun
                        ? "SCENARIO IN PROGRESS"
                        : "LAUNCH BOUNDED ATTACK"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Right Column: Execution Monitor & Terminal (2 cols) */}
              <div className="lg:col-span-2 space-y-4">
                {/* Active Run Card */}
                {activeRun && (
                  <Card className="border-[#fe9a00]/40">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Tag variant="amber" size="sm">ACTIVE SCENARIO</Tag>
                        <Button
                          variant="destructive"
                          size="sm"
                          icon={<Square className="w-3.5 h-3.5" />}
                          onClick={() => handleStopRun(activeRun.run_id)}
                        >
                          Stop
                        </Button>
                      </div>
                      <CardTitle className="text-sm mt-1">{activeRun.scenario}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-xs font-mono text-[#9aa0a6]">
                        <span>Progress:</span>
                        <span className="text-[#fe9a00] font-bold">{activeRun.progress_percent || 0}%</span>
                      </div>
                      <div className="w-full bg-[#16181c] h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#ffb454] to-[#fe9a00] transition-all duration-200"
                          style={{ width: `${activeRun.progress_percent || 10}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Real-time Terminal Log */}
                <Card className="h-80 flex flex-col">
                  <div className="p-3 border-b border-[rgba(255,255,255,0.07)] bg-[#090c10] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#9aa0a6]">
                      <Terminal className="w-3.5 h-3.5 text-[#fe9a00]" />
                      <span>TERMINAL STREAM</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#5f6368]">LIVE</span>
                  </div>
                  <div className="flex-1 p-3 bg-[#06080b] font-mono text-[11px] text-[#9aa0a6] overflow-y-auto space-y-1 sf-tabular">
                    {terminalLogs.length === 0 ? (
                      <div className="text-[#5f6368] italic py-8 text-center">
                        Awaiting attack execution...
                      </div>
                    ) : (
                      terminalLogs.map((log, idx) => (
                        <div key={idx} className="leading-tight">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>

            {/* Attack History (Caller-Isolated) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>My Attack Run History (Isolated to {enrolled.alias})</span>
                  <Tag variant="neutral" size="sm">{myRuns.length} RUNS</Tag>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {myRuns.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[#5f6368] font-mono">
                    No runs executed in this session yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left">
                      <thead>
                        <tr className="border-b border-[rgba(255,255,255,0.07)] text-[#5f6368]">
                          <th className="py-2">RUN ID</th>
                          <th className="py-2">SCENARIO</th>
                          <th className="py-2">TARGET</th>
                          <th className="py-2">STATUS</th>
                          <th className="py-2 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myRuns.map((r: any) => (
                          <tr key={r.run_id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#111417]">
                            <td className="py-2.5 text-[#ffb454] font-semibold">{r.run_id}</td>
                            <td className="py-2.5 text-[#f0f2f5]">{r.scenario}</td>
                            <td className="py-2.5 text-[#9aa0a6]">{r.target_origin}</td>
                            <td className="py-2.5">
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
                            <td className="py-2.5 text-right">
                              {r.status === "RUNNING" && (
                                <button
                                  type="button"
                                  onClick={() => handleStopRun(r.run_id)}
                                  className="text-xs text-[#f4526b] hover:underline"
                                >
                                  Halt
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
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-[#5f6368] font-mono py-3 border-t border-[rgba(255,255,255,0.07)] max-w-5xl mx-auto w-full">
        Sentinel Flow v2.0 • Participant Attack Engine • Bounded Exercise Sandbox
      </footer>
    </div>
  );
}

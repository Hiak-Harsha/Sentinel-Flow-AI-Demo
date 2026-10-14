import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TerminalLog } from "../components/TerminalLog";
import { LiveTargetPanel } from "../components/LiveTargetPanel";
import { Panel } from "../components/shared";

/**
 * Red Team Scenario Launcher (Participant / Student Facing).
 * Gives participants the ability to trigger safe, controlled, allowlisted attack simulations
 * against the operator-approved target application while the Blue Team (Operator) detects it.
 */
export function AttackConsole({ trafficLogs = [], activeAlerts = [], participant = null }) {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState("credential_stuffing");
  const [targetOrigin, setTargetOrigin] = useState("http://127.0.0.1:8000/lab-target");
  const [approvedTargets, setApprovedTargets] = useState([]);
  const [consentedOrigins, setConsentedOrigins] = useState(new Set());
  const [studentAgreement, setStudentAgreement] = useState(true);
  const [activeRun, setActiveRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [effectTimeline, setEffectTimeline] = useState([]);

  // Tunable scenario parameters with safe ceilings
  const [requestsPerSecond, setRequestsPerSecond] = useState(15);
  const [durationSeconds, setDurationSeconds] = useState(20);
  const [accountCount, setAccountCount] = useState(25);
  const [scrapingIterations, setScrapingIterations] = useState(3);

  // Load scenarios and operator-consented targets
  const loadData = async () => {
    try {
      const scens = await api.orchestrator.listScenarios();
      setScenarios(scens);

      const proxyStat = await api.getProxyStatus();
      const audit = await api.orchestrator.getConsentAudit();

      const consented = new Set((audit || []).map((a) => a.target_origin.toLowerCase()));
      setConsentedOrigins(consented);

      const allowed = proxyStat.allowed_origins || [];
      // Prioritize consented targets
      const preApproved = allowed.filter((orig) => consented.has(orig.toLowerCase()));
      setApprovedTargets(preApproved.length > 0 ? preApproved : allowed);

      if (proxyStat.default_target && (!targetOrigin || targetOrigin.includes("localhost:3000"))) {
        setTargetOrigin(proxyStat.default_target);
      }
    } catch (err) {
      console.error("Failed to load scenario launcher metadata:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Poll active run effect timeline if running
  useEffect(() => {
    if (!activeRun) return;
    const interval = setInterval(async () => {
      try {
        const tl = await api.orchestrator.getEffectTimeline(activeRun.run_id);
        if (Array.isArray(tl)) {
          setEffectTimeline(tl);
        }
        const runStatus = await api.orchestrator.getRunStatus(activeRun.run_id);
        if (runStatus) {
          setActiveRun(runStatus);
          if (runStatus.status === "COMPLETED" || runStatus.status === "STOPPED" || runStatus.status === "FAILED") {
            setStatusMsg(`Run ${runStatus.run_id} finished (${runStatus.status}).`);
          }
        }
      } catch (e) {
        // ignore poll error
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [activeRun]);

  const handleLaunch = async () => {
    setErrorMsg("");
    setStatusMsg("");

    if (!studentAgreement) {
      setErrorMsg("Please acknowledge the classroom safety notice before launching.");
      return;
    }

    setLoading(true);
    try {
      const launcherName = participant?.alias || participant?.device_id || "Student Participant";
      const res = await api.orchestrator.startRun({
        scenario: selectedScenario,
        target_origin: targetOrigin,
        requests_per_second: requestsPerSecond,
        duration_seconds: durationSeconds,
        account_count: accountCount,
        scraping_iterations: scrapingIterations,
        launched_by: launcherName,
      });

      setActiveRun(res.run);
      setStatusMsg(`Scenario '${selectedScenario}' launched! Run ID: ${res.run.run_id}`);
    } catch (err) {
      setErrorMsg(typeof err?.message === "string" ? err.message : String(err || "Failed to launch attack run"));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeRun) return;
    try {
      await api.orchestrator.stopRun(activeRun.run_id);
      setStatusMsg(`Run ${activeRun.run_id} stopped.`);
      setActiveRun(null);
    } catch (err) {
      setErrorMsg(err.message || "Failed to stop run");
    }
  };

  const handleEmergencyStop = async () => {
    try {
      setLoading(true);
      await api.orchestrator.emergencyStop();
      setStatusMsg("EMERGENCY KILL SWITCH TRIPPED: All active attack runs terminated immediately.");
      setActiveRun(null);
    } catch (err) {
      setErrorMsg(`Emergency stop failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const attackLogs = trafficLogs.filter(
    (l) => l.attack_run_id || (l.identity_id && (l.identity_id.includes("bot") || l.identity_id.includes("agent") || l.identity_id.includes("scanner") || l.identity_id.includes("attacker")))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-indigo-950/40 border border-rose-500/30 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping"></span>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">
              RED TEAM SIMULATION LAB · PARTICIPANT LAUNCHPAD
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mt-1">Attack Scenario Orchestrator</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Trigger safe, pre-consented attack patterns to test the Sentinel Flow AI detection engine.
            All traffic is server-measured and attributed to your participant identity.
          </p>
        </div>

        {participant && (
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-mono text-slate-300">
            Attributed As: <span className="text-cyan-400 font-bold">{participant.alias || participant.device_id}</span>
          </div>
        )}
      </div>

      {/* Target Selector & Agreement */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center space-x-3">
          <span className="text-slate-400">Pre-Approved Target:</span>
          <select
            value={targetOrigin}
            onChange={(e) => setTargetOrigin(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-cyan-300 focus:outline-none focus:border-cyan-400"
          >
            {approvedTargets.map((orig) => (
              <option key={orig} value={orig}>
                {orig}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={studentAgreement}
            onChange={(e) => setStudentAgreement(e.target.checked)}
            className="rounded border-slate-700 text-cyan-500 focus:ring-0"
          />
          <span className="text-[11px]">I confirm this traffic is directed at our authorized lab demo target</span>
        </label>
      </div>

      {/* Scenario Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {scenarios.map((scen) => {
          const isSelected = selectedScenario === scen.id;
          return (
            <div
              key={scen.id}
              onClick={() => setSelectedScenario(scen.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? "bg-rose-950/30 border-rose-500/70 shadow-lg shadow-rose-950/50"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400">
                    {scen.category}
                  </span>
                  <span className="text-xs">{isSelected ? "🔘" : "⚪"}</span>
                </div>
                <h4 className="text-sm font-bold text-white mb-1.5">{scen.name}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{scen.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500">Safety Cap:</span>
                <span className="text-cyan-400">{scen.risk_level || "Controlled"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real Parameter Controls Section */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-mono font-bold uppercase text-slate-200">
              Scenario Configuration Parameters
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tune volumetric and algorithmic parameters within safe, enforced demo bounds.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleEmergencyStop}
              className="px-3.5 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-mono font-bold text-xs border border-red-500 shadow-lg shadow-red-700/30 flex items-center gap-1.5"
            >
              <span>🛑</span>
              <span>EMERGENCY STOP</span>
            </button>
            {activeRun && (
              <button
                type="button"
                onClick={handleStop}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs transition"
              >
                ■ HALT ACTIVE RUN
              </button>
            )}
            <button
              type="button"
              onClick={handleLaunch}
              disabled={loading || activeRun?.status === "RUNNING"}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 font-mono font-bold text-xs transition hover:opacity-90 disabled:opacity-50 shadow-lg shadow-rose-500/20"
            >
              {loading ? "INITIALIZING..." : activeRun?.status === "RUNNING" ? "ATTACK IN PROGRESS..." : "▶ LAUNCH SCENARIO"}
            </button>
          </div>
        </div>

        {/* Dynamic Sliders depending on chosen scenario */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2 font-mono text-xs">
          {selectedScenario === "burst_dos" && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-slate-300">
                  <span>Burst Rate (req/sec):</span>
                  <span className="text-cyan-400 font-bold">{requestsPerSecond} req/s</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={requestsPerSecond}
                  onChange={(e) => setRequestsPerSecond(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <span className="text-[10px] text-slate-500 block">Threshold: &gt;12 req/s triggers CRITICAL alert</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-slate-300">
                  <span>Burst Duration (seconds):</span>
                  <span className="text-cyan-400 font-bold">{durationSeconds}s</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <span className="text-[10px] text-slate-500 block">Total planned requests: {requestsPerSecond * durationSeconds}</span>
              </div>
            </>
          )}

          {selectedScenario === "credential_stuffing" && (
            <div className="space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Synthetic Account Count:</span>
                <span className="text-cyan-400 font-bold">{accountCount} accounts</span>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={accountCount}
                onChange={(e) => setAccountCount(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <span className="text-[10px] text-slate-500 block">Safety limit: Capped at 50 accounts</span>
            </div>
          )}

          {selectedScenario === "scraping" && (
            <div className="space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Crawl Iterations (15 paths each):</span>
                <span className="text-cyan-400 font-bold">{scrapingIterations} cycles ({scrapingIterations * 15} hits)</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={scrapingIterations}
                onChange={(e) => setScrapingIterations(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <span className="text-[10px] text-slate-500 block">Robotic interval: 150ms steady cadence</span>
            </div>
          )}

          {selectedScenario === "zap_scan" && (
            <div className="col-span-full p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400 text-xs">
              Runs 8 non-destructive security vulnerability probes (SQL injection syntax checks, reflected XSS probes, sensitive file discovery).
            </div>
          )}
        </div>

        {statusMsg && (
          <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Live Target Application Reflection Panel */}
      <LiveTargetPanel
        targetUrl={targetOrigin}
        onSelectTargetUrl={setTargetOrigin}
        allowedOrigins={approvedTargets}
        recentRequests={attackLogs.length > 0 ? attackLogs : trafficLogs}
        activeAttack={activeRun}
      />

      {/* Target Effect Timeline & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TerminalLog logs={attackLogs.length > 0 ? attackLogs : trafficLogs} title="REAL SERVER-MEASURED ATTACK PROXY STREAM" />

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-mono font-bold uppercase text-slate-300 tracking-wider">
                Live Target Effect Readout
              </h3>
              <span className="text-xs font-mono text-cyan-400">
                {effectTimeline.length} Effect Records
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Real-time measurement of status codes, latency, and bytes returned by the target application
              during simulation, fed directly into the 3-layer detection engine.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-slate-800 text-xs font-mono space-y-2 max-h-[220px] overflow-y-auto">
            {effectTimeline.length === 0 ? (
              <div className="text-slate-500 text-center py-4">
                Launch a scenario to observe live target responses here.
              </div>
            ) : (
              effectTimeline.slice(-6).reverse().map((eff, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] border-b border-slate-900 pb-1">
                  <span className="text-slate-300 truncate max-w-[140px]">{eff.target_path_hit}</span>
                  <span className={eff.status_code >= 400 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                    {eff.status_code}
                  </span>
                  <span className="text-slate-400">{eff.latency_ms}ms</span>
                  <span className={eff.current_threat_score > 0.4 ? "text-rose-400 font-bold" : "text-slate-500"}>
                    Threat: {(eff.current_threat_score * 100).toFixed(0)}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

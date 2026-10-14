import { useState, useEffect } from "react";
import { Panel, StatCard, formatTime } from "../components/shared";
import { api, API_BASE } from "../lib/api";
import { getClientFingerprint } from "../lib/fingerprint";

export function ParticipantApp({
  session,
}) {
  const [joinCode, setJoinCode] = useState(session?.join_code || "");
  const [alias, setAlias] = useState("");
  const [deviceInfo, setDeviceInfo] = useState(() => {
    try {
      const saved = sessionStorage.getItem("sf_participant");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [requestCount, setRequestCount] = useState(0);
  const [recentActions, setRecentActions] = useState([]);
  const [isBursting, setIsBursting] = useState(false);
  const [burstProgress, setBurstProgress] = useState(0);
  const [testComplete, setTestComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [myAssessment, setMyAssessment] = useState(null);

  // Sync session join code if available
  useEffect(() => {
    if (session?.join_code && !joinCode) {
      setJoinCode(session.join_code);
    }
  }, [session, joinCode]);

  const [myFeatures, setMyFeatures] = useState(null);

  // Periodically refresh own assessment & behavioral features
  useEffect(() => {
    if (!deviceInfo) return;

    let isMounted = true;
    async function loadOwnAssessment() {
      try {
        const [assess, featRes] = await Promise.all([
          api.getDeviceAssessment(deviceInfo.device_id).catch(() => null),
          api.getIdentityFeatures(deviceInfo.device_id).catch(() => null),
        ]);
        if (isMounted) {
          if (assess) setMyAssessment(assess);
          if (featRes?.features) setMyFeatures(featRes.features);
        }
      } catch (err) {
        console.error("Failed to load participant assessment:", err);
      }
    }

    loadOwnAssessment();
    const interval = setInterval(loadOwnAssessment, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [deviceInfo]);

  // Handle Join with Hardware Fingerprint Binding
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!alias.trim() || !joinCode.trim()) return;
    setIsJoining(true);
    setErrorMsg(null);

    try {
      // 1. Compute client-side hardware fingerprint
      const fp = await getClientFingerprint();

      // 2. Join classroom session
      const res = await api.joinSession(joinCode, alias);

      // 3. Register cryptographic identity and bind fingerprint
      const reg = await api.registerIdentity(alias, fp, res.device_id, "participant");
      sessionStorage.setItem("sf_session_token", reg.token);
      sessionStorage.setItem("sf_device_fingerprint", fp);

      const combined = { ...res, ...reg, fingerprint_hash: fp };
      setDeviceInfo(combined);
      sessionStorage.setItem("sf_participant", JSON.stringify(combined));
      setRequestCount(1);
      setRecentActions([{ action: `Joined session (FP: ${fp.slice(0, 10)}...)`, time: new Date().toISOString() }]);

      const initialAssess = await api.getDeviceAssessment(res.device_id).catch(() => null);
      if (initialAssess) setMyAssessment(initialAssess);
    } catch (err) {
      setErrorMsg(err.message || "Failed to join session. Verify join code.");
    } finally {
      setIsJoining(false);
    }
  };

  // Handle Real Proxied Normal Activity
  const performAction = async (actionName, path = "/") => {
    if (!deviceInfo) return;
    try {
      // Execute REAL HTTP round-trip through reverse proxy tagged with device identity
      await fetch(`${API_BASE}/proxy${path}`, {
        method: "GET",
        headers: {
          "X-Sentinel-Identity": deviceInfo.device_id,
          "X-Participant-Device": deviceInfo.device_id,
          "X-Device-Fingerprint": deviceInfo.fingerprint_hash || "",
          "X-Identity-Token": deviceInfo.token || "",
        },
      }).catch(() => null);

      // Session presence bookkeeping
      api.recordActivity(deviceInfo.device_id, actionName).catch(() => null);

      setRequestCount((prev) => prev + 1);
      setRecentActions((prev) => [
        { action: `${actionName} (GET ${path})`, time: new Date().toISOString() },
        ...prev.slice(0, 7),
      ]);

      // Refresh own assessment
      const updated = await api.getDeviceAssessment(deviceInfo.device_id).catch(() => null);
      if (updated) setMyAssessment(updated);
    } catch (err) {
      console.error("Action error:", err);
    }
  };

  // Handle Real Proxied Controlled Stress Test Burst
  const handleControlledTest = async () => {
    if (!deviceInfo || isBursting) return;
    setIsBursting(true);
    setBurstProgress(0);
    setTestComplete(false);

    const totalRequests = 25;
    for (let i = 1; i <= totalRequests; i++) {
      try {
        await fetch(`${API_BASE}/proxy/`, {
          method: "GET",
          headers: {
            "X-Sentinel-Identity": deviceInfo.device_id,
            "X-Participant-Device": deviceInfo.device_id,
            "X-Device-Fingerprint": deviceInfo.fingerprint_hash || "",
            "X-Identity-Token": deviceInfo.token || "",
          },
        }).catch(() => null);
      } catch (err) {
        console.error("Stress burst fetch error:", err);
      }

      setRequestCount((prev) => prev + 1);
      setBurstProgress(Math.round((i / totalRequests) * 100));
      // 30ms interval = real volumetric rate burst against target
      await new Promise((r) => setTimeout(r, 30));
    }

    // Bookkeeping presence
    api.recordActivity(deviceInfo.device_id, "Stress burst completed").catch(() => null);

    // Refresh own assessment after burst
    const assessAfter = await api.getDeviceAssessment(deviceInfo.device_id).catch(() => null);
    if (assessAfter) setMyAssessment(assessAfter);

    setIsBursting(false);
    setTestComplete(true);
    setRecentActions((prev) => [
      { action: "Controlled Stress Test Burst Executed (25 real requests)", time: new Date().toISOString() },
      ...prev.slice(0, 7),
    ]);
  };

  // Join Screen
  if (!deviceInfo) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl border border-white/10 bg-[#0c1626]/95 backdrop-blur-xl shadow-2xl">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 font-mono text-xl font-bold">
            📱
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Join Sentinel Flow</h2>
          <p className="text-xs text-slate-400 mt-1">
            Connect your device to the active cybersecurity demonstration session.
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="text-xs font-mono font-bold text-slate-300 block mb-1.5 uppercase">
              Session Code
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. SF-7K42"
              required
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 font-mono text-sm text-cyan-300 outline-none uppercase placeholder:text-slate-600 focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-xs font-mono font-bold text-slate-300 block mb-1.5 uppercase">
              Your Display Name / Alias
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. Harsha or Maya"
              required
              maxLength={32}
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
            />
          </div>

          {errorMsg && (
            <p className="text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isJoining}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 py-3 text-xs font-mono font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:opacity-90 disabled:opacity-50"
          >
            {isJoining ? "CONNECTING..." : "ENTER DEMO SESSION"}
          </button>
        </form>
      </div>
    );
  }

  const myThreatLevel = myAssessment?.threat_level || "LOW";
  const myThreatScore = myAssessment?.threat_score || 0.05;
  const isElevated = myThreatLevel !== "LOW";

  // Connected Participant Mini-App
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Device Header */}
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-sm font-bold">
            ✓
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">{deviceInfo.alias}</h2>
              <span className="rounded bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-400/20">
                {deviceInfo.device_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Session: <span className="font-mono text-cyan-300">{deviceInfo.session_code || joinCode}</span> • Live Proxied Telemetry
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem("sf_participant");
            sessionStorage.removeItem("sf_session_token");
            setDeviceInfo(null);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-white"
        >
          Disconnect
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Requests Sent" value={requestCount} sub="Live Proxied Calls" icon="⚡" />
        <StatCard label="My Device Identity" value={deviceInfo.device_id} sub="Classroom Node" icon="💻" />
        <StatCard
          label="My Threat Status"
          value={myThreatLevel}
          sub={`Score: ${(myThreatScore * 100).toFixed(0)}%`}
          icon={isElevated ? "⚠" : "🛡️"}
        />
      </div>

      {/* Participant Personal Assessment View (Own Status Only) */}
      <div
        className={`p-4 rounded-xl border font-mono text-xs transition-all ${
          myThreatLevel === "CRITICAL"
            ? "bg-rose-950/40 border-rose-500/60 text-rose-300"
            : myThreatLevel === "HIGH"
            ? "bg-orange-950/40 border-orange-500/50 text-orange-300"
            : myThreatLevel === "ELEVATED"
            ? "bg-amber-950/30 border-amber-500/40 text-amber-300"
            : "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isElevated ? "bg-amber-400 animate-ping" : "bg-emerald-400"
              }`}
            ></span>
            <span className="font-bold">YOUR AI BEHAVIORAL STATUS: {myThreatLevel}</span>
          </div>
          <span>Score: {(myThreatScore * 100).toFixed(0)}%</span>
        </div>
        <p className="text-[11px] opacity-80 mt-1">
          {myAssessment?.human_summary || "Normal browsing baseline established."}
        </p>
      </div>

      {/* "Why was I flagged?" Evidence Explanation Panel */}
      <div className="rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 shadow-xl font-mono text-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center space-x-2">
            <span className="text-base">{isElevated ? "🔍" : "📊"}</span>
            <span className="font-bold text-slate-200 uppercase tracking-wide">
              {isElevated ? "Why Was I Flagged? (Evidence Breakdown)" : "Behavioral Telemetry Snapshot"}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isElevated
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {isElevated
              ? `${(myAssessment?.rule_details || []).length || 1} DETECTED SIGNAL(S)`
              : "CLEAN BEHAVIOR"}
          </span>
        </div>

        {/* Observed Signals Table / Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">5s Rate</span>
            <span className="text-slate-200 font-bold text-sm">
              {myFeatures ? `${(myFeatures.request_rate_5s || 0).toFixed(1)} req/s` : "0.0 req/s"}
            </span>
            <span className="text-[9px] text-slate-500 block">Baseline: &lt;6.0 req/s</span>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">30s 4xx Error Ratio</span>
            <span
              className={`font-bold text-sm ${
                (myFeatures?.error_ratio_30s || 0) >= 0.3 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {myFeatures ? `${Math.round((myFeatures.error_ratio_30s || 0) * 100)}%` : "0%"}
            </span>
            <span className="text-[9px] text-slate-500 block">Threshold: &gt;30% fails</span>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Cadence Interval</span>
            <span className="text-slate-200 font-bold text-sm">
              {myFeatures ? `${Math.round(myFeatures.inter_request_interval_mean_30s || 0)}ms` : "0ms"}
            </span>
            <span className="text-[9px] text-slate-500 block">Human: variable</span>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Hardware Cohort</span>
            <span className="text-cyan-400 font-bold text-sm">
              {myFeatures?.cohort_size_5m || 1} peer(s)
            </span>
            <span className="text-[9px] text-slate-500 block">Shared fingerprint</span>
          </div>
        </div>

        {/* Detailed Reasons / Rules */}
        {isElevated && myAssessment?.rule_details && myAssessment.rule_details.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-rose-300 block">Active Correlated Rules:</span>
            {myAssessment.rule_details.map((rule, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-200 text-xs">
                <div className="font-bold flex items-center justify-between">
                  <span>🚨 {rule.name}</span>
                  <span className="text-[10px] uppercase font-bold text-rose-400">{rule.severity}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">{rule.summary}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pedagogical Explanation Strip */}
        <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] text-cyan-200 leading-relaxed">
          <span className="font-bold">💡 How Detection Works:</span> Sentinel Flow tracks behavioral velocity,
          error distributions, and endpoint entropy — not device identity or IP alone. Sharing hardware or a lab Wi-Fi
          with peers does not flag you unless your session exhibits rapid repeated failures or rate spikes.
        </div>
      </div>

      {/* Real Proxied Normal Actions Panel */}
      <Panel title="Interactive Application Actions" kicker="Real Proxied Traffic">
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Perform standard actions below. Each button sends a real HTTP request through the Sentinel Flow reverse proxy
          to the target application, allowing the AI model to observe and establish your normal behavioral profile.
        </p>

        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => performAction("Fetch Storefront Home", "/")}
            className="rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 hover:border-cyan-400/30"
          >
            <span className="text-cyan-400 block font-bold mb-1">▶ Fetch Storefront Home</span>
            <span className="text-slate-400 text-[10px]">GET /</span>
          </button>

          <button
            type="button"
            onClick={() => performAction("Browse Product Catalog", "/products")}
            className="rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 hover:border-cyan-400/30"
          >
            <span className="text-cyan-400 block font-bold mb-1">▶ Browse Product Catalog</span>
            <span className="text-slate-400 text-[10px]">GET /products</span>
          </button>

          <button
            type="button"
            onClick={() => performAction("View Account Profile", "/account")}
            className="rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 hover:border-cyan-400/30"
          >
            <span className="text-cyan-400 block font-bold mb-1">▶ View Account Profile</span>
            <span className="text-slate-400 text-[10px]">GET /account</span>
          </button>

          <button
            type="button"
            onClick={() => performAction("Refresh Cart Status", "/cart")}
            className="rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 hover:border-cyan-400/30"
          >
            <span className="text-cyan-400 block font-bold mb-1">▶ Refresh Cart Status</span>
            <span className="text-slate-400 text-[10px]">GET /cart</span>
          </button>
        </div>
      </Panel>

      {/* Controlled Stress Test Section */}
      <Panel
        title="Controlled Abnormal Stress Test"
        kicker="REAL BURST TRAFFIC"
        className={isElevated ? "border-amber-400/40 bg-amber-950/10" : ""}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Generates a strictly bounded, safe burst of 25 rapid requests through the Sentinel Flow reverse proxy.
            This demonstrates how the AI detects behavioral volumetric shifts without payload alterations.
          </p>

          {isBursting ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 space-y-2">
              <div className="flex justify-between text-xs font-mono font-bold text-rose-300">
                <span>TRANSMITTING REAL 25-REQUEST BURST...</span>
                <span>{burstProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-75"
                  style={{ width: `${burstProgress}%` }}
                />
              </div>
            </div>
          ) : testComplete ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 font-mono text-xs space-y-2">
              <span className="font-bold text-emerald-300 block">✓ CONTROLLED BURST TRANSMITTED</span>
              <p className="text-slate-300 text-[11px]">
                Your 25 rapid requests were captured by the reverse proxy. The AI intrusion detector has flagged this behavioral deviation on the operator console.
              </p>
              <button
                type="button"
                onClick={() => performAction("Recover to Normal Browsing", "/")}
                className="mt-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-200"
              >
                Return to Normal Activity (Test AI Recovery)
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleControlledTest}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-3 text-xs font-mono font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:opacity-90"
            >
              ⚠ START CONTROLLED STRESS BURST (25 REAL REQUESTS)
            </button>
          )}
        </div>
      </Panel>

      {/* Recent Activity Log */}
      <Panel title="Recent Transmissions" kicker="Device Audit Log">
        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {recentActions.map((act, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs font-mono text-slate-300"
            >
              <span>{act.action}</span>
              <span className="text-[10px] text-slate-500">{formatTime(act.time)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

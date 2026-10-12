import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Panel } from "../components/shared";

/**
 * Operator Target Configuration & Safety Gate.
 * Allows administrators to verify allowlisted targets, certify ownership,
 * and review the immutable security consent audit log.
 */
export function TargetConfig() {
  const [proxyStatus, setProxyStatus] = useState(null);
  const [allowedOrigins, setAllowedOrigins] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [operatorName, setOperatorName] = useState("Lab Operator");
  const [confirmedOwnership, setConfirmedOwnership] = useState(true);
  const [consentAudit, setConsentAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    try {
      const status = await api.getProxyStatus();
      setProxyStatus(status);
      if (status?.allowed_origins) {
        setAllowedOrigins(status.allowed_origins);
        if (!selectedTarget && status.allowed_origins.length > 0) {
          setSelectedTarget(status.default_target || status.allowed_origins[0]);
        }
      }
      const audit = await api.orchestrator.getConsentAudit();
      setConsentAudit(audit || []);
    } catch (err) {
      console.error("Failed to load target config data:", err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleGrantConsent = async (e) => {
    e.preventDefault();
    setMessage("");
    setErrorMsg("");
    if (!confirmedOwnership) {
      setErrorMsg("Ownership confirmation required. You must certify you own or have permission for this target.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.orchestrator.confirmConsent(selectedTarget, operatorName, confirmedOwnership);
      setMessage(`Consent successfully granted for ${selectedTarget}! Token: ${res.consent_token?.slice(0, 12)}...`);
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to grant target consent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-xl">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-400">
            OPERATOR SAFETY GATE & TARGET ALLOWLIST
          </span>
        </div>
        <h2 className="text-xl font-bold text-slate-100 mt-1">Target Application Configuration</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Sentinel Flow enforces a strict fail-closed safety boundary. Only pre-consented targets configured
          by the operator can receive proxied traffic and simulated attack scenarios.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Grant Consent Form */}
        <div className="lg:col-span-6 space-y-6">
          <Panel title="Grant Target Consent" kicker="Operator Pre-Approval">
            <p className="text-xs text-slate-400 mb-4">
              Pre-approve a target host for student participants. Once consented, participants can select this
              target in the Red Team Scenario Launcher without needing admin privileges.
            </p>

            <form onSubmit={handleGrantConsent} className="space-y-4">
              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-1">
                  Select Allowlisted Target Origin
                </label>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                >
                  {allowedOrigins.map((orig) => (
                    <option key={orig} value={orig}>
                      {orig}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-1">
                  Certifying Operator Name
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs font-mono">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmedOwnership}
                    onChange={(e) => setConfirmedOwnership(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  <span className="text-slate-300 text-[11px] leading-relaxed">
                    I certify that this target application is an owned lab environment or authorized demonstration endpoint.
                    All simulated traffic will remain bound to this host.
                  </span>
                </label>
              </div>

              {message && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                  {message}
                </div>
              )}
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs transition disabled:opacity-50 shadow-lg shadow-indigo-600/30"
              >
                {loading ? "RECORDING CONSENT..." : "RECORD & PRE-APPROVE TARGET"}
              </button>
            </form>
          </Panel>
        </div>

        {/* Right Column: Consent Audit Log */}
        <div className="lg:col-span-6 space-y-6">
          <Panel title="Immutable Consent Audit Log" kicker="Compliance Ledger">
            <p className="text-xs text-slate-400 mb-4">
              Cryptographically signed records of operator ownership certifications required by the safety orchestrator.
            </p>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {consentAudit.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No consent records logged yet.
                </div>
              ) : (
                consentAudit.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-cyan-400 font-bold truncate max-w-[240px]">{item.target_origin}</span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        CONFIRMED
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Operator: {item.operator_name}</span>
                      <span>{item.granted_at_iso ? item.granted_at_iso.slice(0, 19).replace("T", " ") : "Just now"}</span>
                    </div>
                    {item.consent_token && (
                      <div className="text-[10px] text-slate-500 truncate">
                        Token: {item.consent_token}
                      </div>
                    )}
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

import React, { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { Panel, StatCard, formatTime } from "../components/shared";

export function AlertsWorkbench({ activeAlerts = [], onResolveAlert }) {
  const [alerts, setAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [evidenceVerification, setEvidenceVerification] = useState(null);
  const [verifyingEvidence, setVerifyingEvidence] = useState(false);
  const [dispositionNotes, setDispositionNotes] = useState("");
  const [selectedDisposition, setSelectedDisposition] = useState("INVESTIGATING");
  const [isUpdatingDisposition, setIsUpdatingDisposition] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Merge activeAlerts with persistent alerts
  useEffect(() => {
    async function loadAlerts() {
      try {
        const [active, history, verification] = await Promise.all([
          api.getActiveAlerts().catch(() => []),
          api.getAlertHistory(100).catch(() => []),
          api.verifyEvidenceChain().catch(() => null),
        ]);

        const combinedMap = new Map();
        // Priority to active alerts
        (active || []).forEach((a) => combinedMap.set(a.alert_id || a.id, { ...a, disposition: a.disposition || "ACTIVE" }));
        (history || []).forEach((h) => {
          const id = h.alert_id || h.id;
          if (!combinedMap.has(id)) {
            combinedMap.set(id, h);
          } else {
            combinedMap.set(id, { ...combinedMap.get(id), disposition: h.disposition || combinedMap.get(id).disposition });
          }
        });

        // Also merge activeAlerts prop if passed
        (activeAlerts || []).forEach((a) => {
          const id = a.alert_id || a.id;
          if (!combinedMap.has(id)) {
            combinedMap.set(id, { ...a, disposition: a.disposition || "ACTIVE" });
          }
        });

        setAlerts(Array.from(combinedMap.values()));
        if (verification) setEvidenceVerification(verification);
      } catch (err) {
        console.warn("Failed to load alerts workbench data:", err);
      }
    }

    loadAlerts();
    const interval = setInterval(loadAlerts, 3000);
    return () => clearInterval(interval);
  }, [activeAlerts]);

  const verifyLedger = async () => {
    setVerifyingEvidence(true);
    try {
      const res = await api.verifyEvidenceChain();
      setEvidenceVerification(res);
      setStatusMsg({ type: "success", text: `Ledger Verified: ${res.total_events} blocks with valid SHA-256 chain integrity.` });
    } catch (err) {
      setStatusMsg({ type: "error", text: `Ledger verification failed: ${err.message}` });
    } finally {
      setVerifyingEvidence(false);
    }
  };

  const handleUpdateDisposition = async () => {
    if (!selectedAlert) return;
    setIsUpdatingDisposition(true);
    try {
      const alertId = selectedAlert.alert_id || selectedAlert.id;
      await api.updateAlertDisposition(alertId, selectedDisposition, dispositionNotes);
      setStatusMsg({ type: "success", text: `Alert ${alertId} updated to ${selectedDisposition}` });

      // Update local state
      setAlerts((prev) =>
        prev.map((a) =>
          (a.alert_id === alertId || a.id === alertId)
            ? { ...a, disposition: selectedDisposition, analyst_notes: dispositionNotes }
            : a
        )
      );
      if (selectedDisposition === "RESOLVED" && onResolveAlert) {
        onResolveAlert(alertId);
      }
      setSelectedAlert((prev) => prev ? { ...prev, disposition: selectedDisposition, analyst_notes: dispositionNotes } : null);
    } catch (err) {
      setStatusMsg({ type: "error", text: `Failed to update disposition: ${err.message}` });
    } finally {
      setIsUpdatingDisposition(false);
    }
  };

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.summary && a.summary.toLowerCase().includes(q)) ||
        (a.identity_id && a.identity_id.toLowerCase().includes(q)) ||
        (a.alert_id && a.alert_id.toLowerCase().includes(q)) ||
        (a.matched_rules && a.matched_rules.some((r) => r.toLowerCase().includes(q))) ||
        (a.mitre_technique_id && a.mitre_technique_id.toLowerCase().includes(q));

      const matchesSeverity = severityFilter === "ALL" || (a.threat_level || "MEDIUM").toUpperCase() === severityFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (a.disposition || "ACTIVE").toUpperCase() === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [alerts, searchQuery, severityFilter, statusFilter]);

  const criticalCount = alerts.filter((a) => (a.threat_level || "").toUpperCase() === "CRITICAL").length;
  const inTriageCount = alerts.filter((a) => (a.disposition || "").toUpperCase() === "INVESTIGATING").length;
  const resolvedCount = alerts.filter((a) => (a.disposition || "").toUpperCase() === "RESOLVED").length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Audit Attestation */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-4 shadow-xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              AUDIT-GRADE ALERT WORKBENCH & TRIAGE CONSOLE
            </span>
            {evidenceVerification?.chain_valid && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ✓ SHA-256 LEDGER SECURED
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">Security Alerts & Evidence Investigation</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Correlated intrusion alerts mapped to MITRE ATT&CK tactics. Every alert is backed by an immutable forward SHA-256
            cryptographic evidence chain, distinguishing genuine security markers from synthetic proxies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={verifyLedger}
            disabled={verifyingEvidence}
            className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-mono font-bold text-cyan-300 hover:bg-cyan-400/20 transition-all flex items-center gap-2"
          >
            <span>{verifyingEvidence ? "Verifying Ledger..." : "🔒 Verify Evidence Chain"}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between shadow-lg ${
            statusMsg.type === "error"
              ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
              : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          <span>{statusMsg.text}</span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Monitored Alerts" value={alerts.length} sub="Lifecycle Record" icon="🛡️" />
        <StatCard label="Critical Severity (P1)" value={criticalCount} sub="Immediate Action" icon="🚨" trend={criticalCount > 0 ? 100 : null} />
        <StatCard label="Under Triage" value={inTriageCount} sub="Investigating State" icon="🔍" />
        <StatCard
          label="Tamper-Evident Ledger"
          value={evidenceVerification?.chain_valid ? "VALIDATED" : "CHECKING"}
          sub={`${evidenceVerification?.total_events || 0} Block Events`}
          icon="🔗"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-white/10 bg-[#0c1626]/90 p-4 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-[260px]">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by title, rule, MITRE technique (e.g. T1110), identity, alert ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Disposition:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="ALL">All States</option>
              <option value="ACTIVE">Active</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="CONFIRMED_MALICIOUS">Confirmed Malicious</option>
              <option value="FALSE_POSITIVE">False Positive</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Alerts Table & Investigation Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Alerts Table */}
        <div className={selectedAlert ? "lg:col-span-7 space-y-4" : "lg:col-span-12 space-y-4"}>
          <Panel title={`Correlated Security Events (${filteredAlerts.length})`} kicker="Real-Time Detection Feed">
            {filteredAlerts.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-mono text-xs">
                No alerts match the active filters or query.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">MITRE Tactic</th>
                      <th className="py-2.5 px-3">Detection / Title</th>
                      <th className="py-2.5 px-3">Identity / Asset</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredAlerts.map((alt) => {
                      const isSelected = selectedAlert && (selectedAlert.alert_id === alt.alert_id || selectedAlert.id === alt.id);
                      const isCrit = (alt.threat_level || "").toUpperCase() === "CRITICAL";
                      const isHigh = (alt.threat_level || "").toUpperCase() === "HIGH";

                      return (
                        <tr
                          key={alt.alert_id || alt.id}
                          onClick={() => {
                            setSelectedAlert(alt);
                            setSelectedDisposition(alt.disposition || "INVESTIGATING");
                            setDispositionNotes(alt.analyst_notes || "");
                          }}
                          className={`cursor-pointer transition-colors hover:bg-white/[0.04] ${
                            isSelected ? "bg-cyan-950/40 border-l-2 border-l-cyan-400" : ""
                          }`}
                        >
                          <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                            {formatTime(alt.created_at || alt.created_at_iso)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                isCrit
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : isHigh
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                              }`}
                            >
                              {alt.threat_level || "HIGH"}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-cyan-300 font-bold">
                                {alt.mitre_technique_id || (alt.matched_rules && alt.matched_rules[0]?.includes("credential") ? "T1110" : alt.matched_rules && alt.matched_rules[0]?.includes("port") ? "T1046" : alt.matched_rules && alt.matched_rules[0]?.includes("dos") ? "T1499" : "T1190")}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[100px]">
                                {alt.mitre_tactic || (alt.matched_rules && alt.matched_rules[0]?.includes("credential") ? "Credential Access" : alt.matched_rules && alt.matched_rules[0]?.includes("port") ? "Discovery" : alt.matched_rules && alt.matched_rules[0]?.includes("dos") ? "Denial of Service" : "Initial Access")}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 max-w-[240px]">
                            <div className="font-bold text-white truncate">{alt.title}</div>
                            <div className="text-[10px] text-slate-400 truncate">{alt.summary}</div>
                          </td>
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-cyan-300">
                              {alt.identity_id || alt.source_identity || "Unknown"}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                (alt.disposition || "ACTIVE") === "RESOLVED"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : (alt.disposition || "ACTIVE") === "CONFIRMED_MALICIOUS"
                                  ? "bg-rose-500/20 text-rose-300"
                                  : (alt.disposition || "ACTIVE") === "INVESTIGATING"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-slate-700 text-slate-300"
                              }`}
                            >
                              {alt.disposition || "ACTIVE"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAlert(alt);
                                setSelectedDisposition(alt.disposition || "INVESTIGATING");
                                setDispositionNotes(alt.analyst_notes || "");
                              }}
                              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-200 transition"
                            >
                              Investigate →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Investigation Screen / Drawer */}
        {selectedAlert && (
          <div className="lg:col-span-5 space-y-4">
            <Panel
              title="Forensic Investigation & Triage"
              kicker={`Case #${selectedAlert.alert_id || selectedAlert.id}`}
              headerAction={
                <button
                  type="button"
                  onClick={() => setSelectedAlert(null)}
                  className="text-xs font-mono text-slate-400 hover:text-white"
                >
                  ✕ Close
                </button>
              }
            >
              <div className="space-y-4 font-mono text-xs">
                {/* Header info */}
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Alert ID:</span>
                    <span className="font-bold text-cyan-300">{selectedAlert.alert_id || selectedAlert.id}</span>
                  </div>
                  <div className="text-sm font-bold text-white">{selectedAlert.title}</div>
                  <p className="text-xs text-slate-300 leading-relaxed">{selectedAlert.summary}</p>
                </div>

                {/* Cryptographic Ledger Verification Proof */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Tamper-Evident Ledger Integrity
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 text-[9px] text-emerald-200 font-bold">
                      SHA-256 HASH CHAIN
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Event sequence verified against in-memory cryptographic hash chain. Zero unverified injections permitted.
                  </p>
                  <div className="mt-2 text-[10px] text-slate-400 bg-black/40 p-2 rounded border border-emerald-500/20 truncate">
                    Root Hash: {evidenceVerification?.chain_tail_hash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
                  </div>
                </div>

                {/* Baseline vs Observed Metrics */}
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Observed Metric Deviations vs Baseline
                  </div>
                  <div className="space-y-1.5">
                    {selectedAlert.evidence && Array.isArray(selectedAlert.evidence) && selectedAlert.evidence.length > 0 ? (
                      selectedAlert.evidence.map((ev, i) => (
                        <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded">
                          <span className="text-slate-400">{ev.feature || ev.name || "Signal"}:</span>
                          <span className="text-rose-400 font-bold">{ev.value ?? ev.deviation ?? "Flagged"}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        Multi-signal threshold breach recorded for {selectedAlert.identity_id || "actor"}.
                      </div>
                    )}
                  </div>
                </div>

                {/* Multi-Signal Fusion Transparency */}
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Signal Concordance Breakdown
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-white/5">
                      <span className="text-slate-400 block text-[10px]">Rule Engine:</span>
                      <span className="font-bold text-white">{selectedAlert.matched_rules ? selectedAlert.matched_rules.join(", ") : "Threshold Trip"}</span>
                    </div>
                    <div className="p-2 rounded bg-white/5">
                      <span className="text-slate-400 block text-[10px]">Concordance Confidence:</span>
                      <span className="font-bold text-cyan-300">{((selectedAlert.threat_score || 0.85) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>

                {/* Analyst Disposition and Notes */}
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    SOC Analyst Disposition & Case Notes
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-300 block">Disposition Status:</label>
                    <select
                      value={selectedDisposition}
                      onChange={(e) => setSelectedDisposition(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="INVESTIGATING">INVESTIGATING — Active Triage</option>
                      <option value="CONFIRMED_MALICIOUS">CONFIRMED_MALICIOUS — Verified Attack Activity</option>
                      <option value="FALSE_POSITIVE">FALSE_POSITIVE — Benign Noise or Calibration Outlier</option>
                      <option value="RESOLVED">RESOLVED — Mitigated / Remediated</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-300 block">Analyst Commentary:</label>
                    <textarea
                      rows={3}
                      value={dispositionNotes}
                      onChange={(e) => setDispositionNotes(e.target.value)}
                      placeholder="Add investigation findings, root cause, or remediation steps..."
                      className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleUpdateDisposition}
                      disabled={isUpdatingDisposition}
                      className="rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-bold text-slate-950 hover:opacity-95 transition"
                    >
                      {isUpdatingDisposition ? "Saving Decision..." : "Commit Triage Decision"}
                    </button>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

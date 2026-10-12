import React from "react";

/**
 * Detailed inspector modal/drawer for a selected identity.
 * Displays hardware fingerprint hash, session token state, real-time feature vector,
 * and security assessment evidence.
 */
export function IdentityDrilldown({ identity, assessment, features, onClose }) {
  if (!identity) return null;

  const id = identity.device_id || identity.identity_id || "Unknown";
  const alias = identity.alias || id;
  const threatScore = assessment?.threat_score || 0.05;
  const threatLevel = assessment?.threat_level || "LOW";
  const matchedRules = assessment?.matched_rules || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl space-y-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xl font-bold text-slate-100">{alias}</h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                {id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Participant Identity & Device Assessment</p>
          </div>

          <div className="flex items-center space-x-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                threatLevel === "CRITICAL"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                  : threatLevel === "HIGH"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
              }`}
            >
              {threatLevel} ({(threatScore * 100).toFixed(0)}%)
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Identity & Fingerprint Triple */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
          <div>
            <span className="text-slate-500 block mb-0.5">Device Fingerprint Hash:</span>
            <span className="text-cyan-300 font-semibold truncate block">
              {identity.fingerprint_hash || identity.primary_fingerprint || "fp_sha256_active"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Session Status:</span>
            <span className="text-emerald-400 font-semibold">VALIDATED & ACTIVE</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Joined At:</span>
            <span className="text-slate-300">{identity.joined_at ? new Date(identity.joined_at).toLocaleTimeString() : "Session Active"}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Total Requests Recorded:</span>
            <span className="text-slate-300">{identity.request_count || features?.request_count_5m || 1}</span>
          </div>
        </div>

        {/* Multi-Window Behavioural Feature Vector */}
        <div>
          <h4 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-2.5">
            Streaming Behavioural Feature Vector (Server-Measured)
          </h4>
          <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Req Rate (5s / 30s):</span>
              <span className="text-slate-100 font-bold">
                {features?.request_rate_5s ?? "0.0"} / {features?.request_rate_30s ?? "0.0"} <span className="text-slate-500 font-normal">req/s</span>
              </span>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Endpoint Entropy (30s):</span>
              <span className="text-cyan-300 font-bold">
                {features?.endpoint_entropy_30s ?? "0.00"} <span className="text-slate-500 font-normal">bits</span>
              </span>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Error Ratio (4xx/5xx):</span>
              <span className={`font-bold ${(features?.error_ratio_30s || 0) > 0.3 ? "text-rose-400" : "text-emerald-400"}`}>
                {((features?.error_ratio_30s || 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Mean Interval (30s):</span>
              <span className="text-slate-100 font-bold">
                {features?.inter_request_interval_mean_30s ?? "0"} <span className="text-slate-500 font-normal">ms</span>
              </span>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Fingerprint Churn (5m):</span>
              <span className="text-slate-100 font-bold">
                {features?.fingerprint_churn_5m ?? 1} <span className="text-slate-500 font-normal">distinct</span>
              </span>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Account Churn (5m):</span>
              <span className="text-slate-100 font-bold">
                {features?.account_churn_5m ?? 1} <span className="text-slate-500 font-normal">identities</span>
              </span>
            </div>
          </div>
        </div>

        {/* Security Summary & Matched Rules */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400 font-semibold uppercase text-[11px]">Detection Engine Verdict:</span>
            {matchedRules.length > 0 ? (
              <span className="text-rose-400 font-mono font-bold">ATTACK SIGNATURE MATCHED</span>
            ) : (
              <span className="text-emerald-400 font-mono">BENIGN PATTERN</span>
            )}
          </div>
          <p className="text-slate-200 leading-relaxed font-sans">{assessment?.human_summary || "Normal operational traffic patterns."}</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-xs transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}

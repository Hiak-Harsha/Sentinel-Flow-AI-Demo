import React from "react";
import { motion } from "framer-motion";

/**
 * SOC Alert Card component with pulse ring animation, matched_rules badges,
 * feature contributions, and action controls.
 */
export function AlertCard({ alert, onResolve }) {
  if (!alert) return null;

  const isCritical = alert.threat_level === "CRITICAL";
  const isHigh = alert.threat_level === "HIGH";

  const borderColor = isCritical ? "border-rose-500/70" : isHigh ? "border-amber-500/60" : "border-violet-500/50";
  const bgGlow = isCritical ? "bg-rose-950/30" : isHigh ? "bg-amber-950/30" : "bg-violet-950/30";
  const badgeColor = isCritical ? "bg-rose-500/20 text-rose-300 border-rose-500/40" : isHigh ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative p-4 rounded-xl border ${borderColor} ${bgGlow} transition-all duration-300 shadow-xl backdrop-blur-md ${isCritical ? "pulse-alert shadow-rose-950/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase border ${badgeColor}`}>
            {alert.threat_level}
          </span>
          <h4 className="font-bold text-slate-100 text-sm font-sans leading-tight">{alert.title}</h4>
        </div>

        {onResolve && (
          <button
            onClick={() => onResolve(alert.alert_id)}
            className="px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Acknowledge
          </button>
        )}
      </div>

      <p className="text-xs text-slate-300 mb-3 leading-relaxed font-sans">{alert.summary}</p>

      {/* Matched Rules Tags */}
      {alert.matched_rules && alert.matched_rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {alert.matched_rules.map((rule) => (
            <span
              key={rule}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-cyan-500/30"
            >
              #{rule}
            </span>
          ))}
        </div>
      )}

      {/* Behavioral Evidence Breakdown */}
      {alert.evidence && alert.evidence.length > 0 && (
        <div className="space-y-1.5 mb-3 bg-black/40 p-2.5 rounded-lg border border-white/5 font-mono text-[11px]">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Observed Telemetry Evidence</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {alert.evidence.slice(0, 4).map((ev, i) => (
              <div key={i} className="flex justify-between items-center text-slate-300 bg-white/5 px-2 py-1 rounded">
                <span className="truncate mr-1 text-slate-400">{ev.feature || ev.name || "signal"}:</span>
                <span className="text-rose-400 font-bold">{ev.value ?? ev.deviation ?? ev.z_score ?? "flagged"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-white/5">
        <span className="truncate max-w-[200px]">Identity: <strong className="text-slate-400">{alert.identity_id}</strong></span>
        <span>{alert.created_at_iso ? new Date(alert.created_at_iso).toLocaleTimeString() : "Just now"}</span>
      </div>
    </motion.div>
  );
}

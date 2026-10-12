import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Panel({ title, kicker, children, className = "", headerAction = null }) {
  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-[#0c1626]/85 backdrop-blur-xl p-5 shadow-xl transition-all ${className}`}>
      {(title || kicker || headerAction) && (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/[0.05]">
          <div>
            {kicker && <p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-cyan-400/90">{kicker}</p>}
            {title && <h2 className="text-sm font-bold tracking-tight text-white mt-0.5">{title}</h2>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}

export function ThreatBadge({ level = "LOW" }) {
  const norm = (level || "LOW").toUpperCase();
  const isAnomalous = norm === "ANOMALOUS" || norm === "HIGH" || norm === "CRITICAL";
  const isElevated = norm === "ELEVATED" || norm === "MEDIUM" || norm === "WATCH";

  return (
    <motion.span
      key={norm}
      initial={{ scale: 0.95, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-mono font-bold border transition-colors ${
        isAnomalous
          ? "border-rose-400/40 bg-rose-500/15 text-rose-300 animate-pulse shadow-rose-900/30 shadow-sm"
          : isElevated
          ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isAnomalous
            ? "bg-rose-400 animate-ping"
            : isElevated
            ? "bg-amber-400 animate-pulse"
            : "bg-emerald-400"
        }`}
      />
      <span>
        THREAT: {isAnomalous ? "CRITICAL (ANOMALY)" : isElevated ? "ELEVATED" : "LOW (NORMAL)"}
      </span>
    </motion.span>
  );
}

export function StateBadge({ state = "NORMAL" }) {
  const s = (state || "NORMAL").toUpperCase();
  switch (s) {
    case "CONFIRMED_ANOMALY":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-200 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          CONFIRMED ANOMALY
        </span>
      );
    case "ANOMALOUS":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-300">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          ANOMALOUS
        </span>
      );
    case "WATCH":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          WATCH
        </span>
      );
    case "RECOVERING":
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-300 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          RECOVERING
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          NORMAL
        </span>
      );
  }
}

export function StatCard({ label, value, sub, trend = null, icon = null }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0c1626]/80 p-4 transition-all hover:border-cyan-400/30 hover:bg-[#0c1626]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono font-medium uppercase tracking-wider text-slate-400">{label}</p>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-white font-mono overflow-hidden">
        <motion.span
          key={String(value)}
          initial={{ opacity: 0.6, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </div>
      {(sub || trend) && (
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">{sub}</span>
          {trend && (
            <span className={`font-mono font-bold ${trend > 0 ? "text-rose-400" : trend < 0 ? "text-emerald-400" : "text-slate-400"}`}>
              {trend > 0 ? `+${trend}%` : `${trend}%`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function formatTime(timestamp) {
  if (!timestamp) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return String(timestamp);
  }
}

export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(Number(value));
}

export function EmptyState({
  title = "No Data Detected",
  description = "No telemetry signals or active records found in this view.",
  icon = null,
  action = null,
  className = "",
}) {
  return (
    <div className={`col-span-full rounded-2xl border border-white/[0.08] bg-[#0c1626]/60 p-8 sm:p-12 text-center backdrop-blur-md flex flex-col items-center justify-center space-y-3 ${className}`}>
      {/* Cyber Radar / Shield Illustration */}
      <div className="relative w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-950/50">
        <div className="absolute inset-0 rounded-2xl bg-cyan-400/5 animate-pulse" />
        {icon ? (
          <span className="text-2xl">{icon}</span>
        ) : (
          <svg className="w-8 h-8 text-cyan-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )}
      </div>

      <div className="max-w-md space-y-1">
        <h4 className="text-sm font-bold text-white font-sans">{title}</h4>
        <p className="text-xs text-slate-400 font-sans leading-relaxed">{description}</p>
      </div>

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

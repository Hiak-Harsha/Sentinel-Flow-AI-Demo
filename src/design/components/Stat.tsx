import React from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export interface StatProps {
  label: string;
  value: string | number;
  subtext?: string;
  change?: number; // percentage change, e.g. +14.2 or -5.1
  changePeriod?: string; // e.g. "vs last 15m"
  icon?: React.ReactNode;
  sparkline?: React.ReactNode;
  variant?: "default" | "critical" | "warning" | "success" | "cyan";
  className?: string;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  subtext,
  change,
  changePeriod = "vs prev",
  icon,
  sparkline,
  variant = "default",
  className = "",
}) => {
  const accentBorder = {
    default: "border-slate-800 hover:border-slate-700",
    critical: "border-rose-900/50 hover:border-rose-700/60 bg-rose-950/20",
    warning: "border-amber-900/50 hover:border-amber-700/60 bg-amber-950/20",
    success: "border-emerald-900/50 hover:border-emerald-700/60 bg-emerald-950/20",
    cyan: "border-cyan-900/50 hover:border-cyan-700/60 bg-cyan-950/20",
  }[variant];

  return (
    <div className={`p-4 rounded-xl bg-slate-900/70 border backdrop-blur-sm transition-all duration-200 ${accentBorder} ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold tracking-tight text-white font-mono sf-tabular">
          {value}
        </span>
        {change !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold sf-tabular ${
              change > 0
                ? "text-rose-400"
                : change < 0
                ? "text-emerald-400"
                : "text-slate-400"
            }`}
          >
            {change > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : change < 0 ? (
              <ArrowDownRight className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>

      {(subtext || changePeriod || sparkline) && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>{subtext || changePeriod}</span>
          {sparkline && <div className="shrink-0">{sparkline}</div>}
        </div>
      )}
    </div>
  );
};

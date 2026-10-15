import React from "react";

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  subline?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
  };
  highlight?: boolean;
}

/**
 * KPI Metric Card adhering to the BharatSR reference:
 * - Uppercase mono eyebrow label
 * - High-impact tabular value in Space Grotesk / Mono
 * - Mono sub-line explanation or trend
 * - Tinted icon tile on the right
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subline,
  icon,
  trend,
  highlight = false,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`p-4 md:p-5 rounded-[12px] bg-[#0f1013] border transition-colors ${
        highlight
          ? "border-[#fe9a00]/40 bg-[#111417]"
          : "border-white/[0.07] hover:border-white/[0.14]"
      } ${className}`}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#9aa4b2] truncate font-medium">
            {label}
          </p>
          <div className="text-2xl md:text-3xl font-bold font-display tracking-tight text-[#e9edf2] tabular-nums">
            {value}
          </div>
          {subline && (
            <div className="font-mono text-xs text-[#5f6975] flex items-center gap-1.5 pt-0.5">
              {trend && (
                <span
                  className={
                    trend.direction === "up"
                      ? "text-[#3ddc97]"
                      : trend.direction === "down"
                      ? "text-[#f4526b]"
                      : "text-[#9aa4b2]"
                  }
                >
                  {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.value}
                </span>
              )}
              <span className="truncate">{subline}</span>
            </div>
          )}
        </div>

        {icon && (
          <div
            className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 border ${
              highlight
                ? "bg-[#2d1f0b] border-[#fe9a00]/30 text-[#fe9a00]"
                : "bg-[#111417] border-white/[0.08] text-[#9aa4b2]"
            }`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

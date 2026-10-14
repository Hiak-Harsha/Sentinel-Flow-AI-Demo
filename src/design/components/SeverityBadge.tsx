import React from "react";

export type SeverityLevel = "CRITICAL" | "HIGH" | "ELEVATED" | "LOW" | "INFO" | "EMERGENCY_STOP" | string;

export interface SeverityBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  severity: SeverityLevel;
  size?: "sm" | "md" | "lg";
  showPulse?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  size = "md",
  showPulse = true,
  className = "",
  ...props
}) => {
  const norm = (severity || "LOW").toUpperCase();

  let bgBorderText = "bg-emerald-950/70 border-emerald-500/40 text-emerald-300";
  let dotColor = "bg-emerald-400";
  let label = norm;

  if (norm === "CRITICAL") {
    bgBorderText = "bg-rose-950/80 border-rose-500/50 text-rose-300 shadow-sm shadow-rose-950/50";
    dotColor = "bg-rose-400";
  } else if (norm === "HIGH") {
    bgBorderText = "bg-orange-950/80 border-orange-500/50 text-orange-300";
    dotColor = "bg-orange-400";
  } else if (norm === "ELEVATED" || norm === "MEDIUM") {
    bgBorderText = "bg-amber-950/80 border-amber-500/50 text-amber-300";
    dotColor = "bg-amber-400";
  } else if (norm === "INFO") {
    bgBorderText = "bg-sky-950/80 border-sky-500/40 text-sky-300";
    dotColor = "bg-sky-400";
  } else if (norm === "EMERGENCY_STOP") {
    bgBorderText = "bg-red-950/90 border-red-500 text-red-200 animate-pulse font-bold";
    dotColor = "bg-red-500";
    label = "ESTOP ENGAGED";
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-0.75 text-xs gap-1.5",
    lg: "px-3.5 py-1 text-sm gap-2 font-bold",
  }[size];

  const isAlerting = norm === "CRITICAL" || norm === "HIGH" || norm === "EMERGENCY_STOP";

  return (
    <span
      role="status"
      aria-label={`Severity level: ${label}`}
      className={`inline-flex items-center font-mono font-semibold uppercase tracking-wider rounded-md border sf-tabular select-none ${sizeClasses} ${bgBorderText} ${className}`}
      {...props}
    >
      <span className="relative flex h-2 w-2">
        {showPulse && isAlerting && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      {label}
    </span>
  );
};

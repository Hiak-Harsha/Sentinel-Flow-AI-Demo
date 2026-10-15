import React from "react";
import { AlertOctagon, AlertTriangle, AlertCircle, ShieldCheck, Info, Flame } from "lucide-react";

export type SeverityLevel = "CRITICAL" | "HIGH" | "ELEVATED" | "LOW" | "INFO" | "EMERGENCY_STOP" | string;

export interface SeverityBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  severity: SeverityLevel;
  size?: "sm" | "md" | "lg";
  showPulse?: boolean;
  hideLabelOnMobile?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  size = "md",
  showPulse = true,
  hideLabelOnMobile = false,
  className = "",
  ...props
}) => {
  const norm = (severity || "LOW").toUpperCase();

  // Colors measured directly from tokens (never brand amber):
  // critical: #f4526b, high: #ff7a45, elevated: #e9c46a, low: #3ddc97, info: #5aa9ff
  let bgBorderText = "bg-[#3ddc97]/10 border-[#3ddc97]/30 text-[#3ddc97]";
  let icon = <ShieldCheck className="w-3.5 h-3.5 shrink-0" />;
  let label = norm;

  if (norm === "CRITICAL") {
    bgBorderText = "bg-[#f4526b]/15 border-[#f4526b]/40 text-[#ff8497]";
    icon = <AlertOctagon className="w-3.5 h-3.5 shrink-0 text-[#ff8497]" />;
  } else if (norm === "HIGH") {
    bgBorderText = "bg-[#ff7a45]/15 border-[#ff7a45]/40 text-[#ff9f7a]";
    icon = <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#ff9f7a]" />;
  } else if (norm === "ELEVATED" || norm === "MEDIUM") {
    bgBorderText = "bg-[#e9c46a]/15 border-[#e9c46a]/40 text-[#f5d78e]";
    icon = <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#f5d78e]" />;
  } else if (norm === "INFO") {
    bgBorderText = "bg-[#5aa9ff]/15 border-[#5aa9ff]/30 text-[#8ec4ff]";
    icon = <Info className="w-3.5 h-3.5 shrink-0 text-[#8ec4ff]" />;
  } else if (norm === "EMERGENCY_STOP") {
    bgBorderText = "bg-[#f4526b]/25 border-[#f4526b] text-[#ff8497] font-bold";
    icon = <Flame className="w-3.5 h-3.5 shrink-0 text-[#ff8497]" />;
    label = "ESTOP ENGAGED";
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1 rounded-[4px]",
    md: "px-2.5 py-0.75 text-xs gap-1.5 rounded-[6px]",
    lg: "px-3.5 py-1 text-sm gap-2 rounded-[8px] font-bold",
  }[size];

  const isAlerting = norm === "CRITICAL" || norm === "HIGH" || norm === "EMERGENCY_STOP";

  return (
    <span
      role="status"
      aria-label={`Severity level: ${label}`}
      className={`inline-flex items-center font-mono font-medium tracking-wider border select-none tabular-nums ${sizeClasses} ${bgBorderText} ${className}`}
      {...props}
    >
      {icon}
      <span className={hideLabelOnMobile ? "hidden sm:inline" : ""}>{label}</span>
      {showPulse && isAlerting && (
        <span className="relative flex h-1.5 w-1.5 ml-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#f4526b]" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#f4526b]" />
        </span>
      )}
    </span>
  );
};

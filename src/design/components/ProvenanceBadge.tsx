import React from "react";
import { Radio, RotateCcw, FlaskConical } from "lucide-react";

export type ProvenanceType = "live" | "replay" | "simulated" | string;

export interface ProvenanceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  provenance: ProvenanceType;
  size?: "sm" | "md";
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  provenance,
  size = "md",
  className = "",
  ...props
}) => {
  const norm = (provenance || "live").toLowerCase();

  let label = "LIVE";
  let style = "bg-emerald-950/60 border-emerald-500/40 text-emerald-300";
  let Icon = Radio;

  if (norm === "replay") {
    label = "REPLAY";
    style = "bg-purple-950/60 border-purple-500/40 text-purple-300";
    Icon = RotateCcw;
  } else if (norm === "simulated" || norm === "simulation") {
    label = "SIMULATED";
    style = "bg-sky-950/60 border-sky-500/40 text-sky-300";
    Icon = FlaskConical;
  }

  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px] gap-1" : "px-2.5 py-0.75 text-xs gap-1.5";

  return (
    <span
      role="note"
      aria-label={`Data provenance: ${label}`}
      className={`inline-flex items-center font-mono font-medium tracking-wide rounded border sf-tabular select-none ${sizeClass} ${style} ${className}`}
      {...props}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {label}
    </span>
  );
};

import React from "react";
import { ProvenanceBadge, ProvenanceType } from "@/design/components/ProvenanceBadge";

export interface ProvenanceFilterProps {
  value: ProvenanceType | "all";
  onChange: (value: ProvenanceType | "all") => void;
  className?: string;
}

export function ProvenanceFilter({ value, onChange, className = "" }: ProvenanceFilterProps) {
  const options: Array<{ id: ProvenanceType | "all"; label: string }> = [
    { id: "all", label: "All Traffic" },
    { id: "live", label: "Live Telemetry" },
    { id: "replay", label: "Dataset Replay" },
    { id: "simulated", label: "Simulated Attacks" },
  ];

  return (
    <div
      role="group"
      aria-label="Filter events by data provenance"
      className={`inline-flex items-center gap-1.5 p-1 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-xs ${className}`}
    >
      <span className="text-[var(--text-muted)] font-medium px-2 hidden sm:inline select-none">
        Provenance:
      </span>
      {options.map((opt) => {
        const isSelected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
              isSelected
                ? "bg-[var(--surface-3)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {opt.id !== "all" && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  opt.id === "live"
                    ? "bg-emerald-400"
                    : opt.id === "replay"
                    ? "bg-purple-400"
                    : "bg-amber-400"
                }`}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

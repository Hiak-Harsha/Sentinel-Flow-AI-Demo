import React from "react";
import { Clock } from "lucide-react";

export type TimeRangeValue = "15m" | "1h" | "6h" | "24h" | "7d";

export interface TimeRangePickerProps {
  value: TimeRangeValue;
  onChange: (val: TimeRangeValue) => void;
  className?: string;
}

export function TimeRangePicker({ value, onChange, className = "" }: TimeRangePickerProps) {
  const ranges: Array<{ id: TimeRangeValue; label: string; rollup: string }> = [
    { id: "15m", label: "Last 15m", rollup: "live 5s" },
    { id: "1h", label: "Last 1h", rollup: "1m rollups" },
    { id: "6h", label: "Last 6h", rollup: "1m rollups" },
    { id: "24h", label: "Last 24h", rollup: "1h rollups" },
    { id: "7d", label: "Last 7d", rollup: "1h rollups" },
  ];

  return (
    <div
      role="group"
      aria-label="Time range selector"
      className={`inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-xs ${className}`}
    >
      <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] ml-1.5 mr-0.5" />
      {ranges.map((r) => {
        const isSelected = value === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer focus:outline-none ${
              isSelected
                ? "bg-[var(--surface-3)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

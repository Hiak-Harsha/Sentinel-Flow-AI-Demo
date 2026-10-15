import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Button } from "@/design/components/Button";
import { Badge } from "@/design/components/Badge";
import { Sliders, Save, Shield } from "lucide-react";
import { showToast } from "@/design/components/Toast";

export function ThresholdSettings() {
  const [fpBudget, setFpBudget] = useState("1.0%");
  const [threshold, setThreshold] = useState(0.65);
  const [confidence, setConfidence] = useState("95%");
  const [retentionDays, setRetentionDays] = useState(7);

  const handleSave = () => {
    showToast.success("Threshold Configuration Saved", `Operating at ${fpBudget} FP budget (threshold: ${threshold}).`);
  };

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--accent)]" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Detection Thresholds & FP Budget
          </CardTitle>
        </div>
        <Badge variant="subtle" size="sm">
          Active Budget: {fpBudget}
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-4 text-xs font-mono">
        {/* FP Budget */}
        <div className="space-y-1.5 font-sans">
          <label className="font-semibold text-[var(--text-secondary)] block">
            Target False-Positive Budget
          </label>
          <div className="flex gap-2">
            {["0.1%", "0.5%", "1.0%", "2.0%"].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setFpBudget(b)}
                className={`px-3 py-1.5 rounded-md font-mono text-xs transition-colors cursor-pointer ${
                  fpBudget === b
                    ? "bg-[var(--accent-wash)] text-[var(--accent)] border border-[var(--border)] font-bold"
                    : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] border border-[var(--border-subtle)]"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Dictates calibrated Platt probability operating threshold for alerts.
          </p>
        </div>

        {/* Operating Threshold Slider */}
        <div className="space-y-1.5 font-sans pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex justify-between">
            <span className="font-semibold text-[var(--text-secondary)]">Decision Cutoff Score</span>
            <span className="font-mono text-[var(--accent)] font-bold">{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[#fe9a00] cursor-pointer"
          />
        </div>

        {/* Retention Policy */}
        <div className="space-y-1.5 font-sans pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex justify-between">
            <span className="font-semibold text-[var(--text-secondary)]">Raw Telemetry Retention</span>
            <span className="font-mono text-slate-200">{retentionDays} Days</span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Events older than {retentionDays} days are rolled into 1-hour persistent summaries and purged.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleSave} className="mt-2">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save Threshold Policy
        </Button>
      </CardContent>
    </Card>
  );
}

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { Button } from "@/design/components/Button";
import { Activity, ShieldAlert, Cpu } from "lucide-react";
import { showToast } from "@/design/components/Toast";

export function HostSensorToggle() {
  const [enabled, setEnabled] = useState(false);
  const [isSampling, setIsSampling] = useState(false);

  const handleToggle = async () => {
    const nextState = !enabled;
    setEnabled(nextState);
    if (nextState) {
      showToast.success("Host Sensor Enabled", "Sampling local psutil connection counters (loopback boundary only).");
    } else {
      showToast.info("Host Sensor Disabled", "Sensor polling ceased.");
    }
  };

  const handleSampleNow = async () => {
    setIsSampling(true);
    try {
      const res = await fetch("/api/v1/sensor/sample", { method: "POST" });
      if (res.ok) {
        showToast.success("Host Metrics Sampled", "Instantaneous local machine counters recorded.");
      } else {
        showToast.error("Sample Failed", "Host sensor is uninitialized.");
      }
    } catch {
      showToast.error("Connection Error", "Could not reach host sensor endpoint.");
    } finally {
      setIsSampling(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Host Flow Sensor (psutil)
          </CardTitle>
        </div>
        <Badge variant={enabled ? "success" : "subtle"} size="sm">
          {enabled ? "Active" : "Disabled"}
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-4 text-xs font-sans">
        <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1.5">
          <div className="font-semibold text-slate-200">Strict Safety Invariant:</div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            The host sensor samples <em>only the local machine&apos;s own</em> process connection counters using <code>psutil</code>. It never monitors external networks or hosts outside this machine.
          </p>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-[var(--border-subtle)]">
          <div>
            <div className="font-semibold text-[var(--text-primary)]">Local Host Sampling</div>
            <div className="text-[11px] text-[var(--text-muted)]">Sample interval: 5 seconds</div>
          </div>
          <Button
            variant={enabled ? "danger" : "primary"}
            size="sm"
            onClick={handleToggle}
          >
            {enabled ? "Disable Sensor" : "Opt-In & Enable"}
          </Button>
        </div>

        {enabled && (
          <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSampling}
              onClick={handleSampleNow}
            >
              <Activity className="w-3.5 h-3.5 mr-1" />
              Sample Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

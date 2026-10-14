import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { Badge } from "@/design/components/Badge";
import { Gauge } from "@/design/components/Gauge";
import { ShieldCheck, ShieldAlert, Cpu, Activity, Info } from "lucide-react";

export interface PersonalAssessmentProps {
  alias: string;
  deviceId: string;
  threatScore?: number;
  threatLevel?: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  isControlledTarget?: boolean;
  plainLanguageExplanation?: string;
  requestsCount?: number;
  className?: string;
}

export function PersonalAssessment({
  alias,
  deviceId,
  threatScore = 0.05,
  threatLevel = "LOW",
  isControlledTarget = false,
  plainLanguageExplanation = "Your network requests align with expected baseline human traffic. No anomaly detected.",
  requestsCount = 24,
  className = "",
}: PersonalAssessmentProps) {
  const isThreat = threatLevel === "HIGH" || threatLevel === "CRITICAL" || isControlledTarget;

  return (
    <div className={`space-y-4 max-w-md mx-auto ${className}`}>
      {/* What you are doing explainer panel */}
      <Card className="p-4 bg-[var(--surface-1)] border-cyan-500/20 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
          <Info className="w-4 h-4" />
          <span>Classroom SOC Simulation Participant</span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Your browser is currently sending background telemetry requests to the Sentinel Flow proxy. The defensive AI pipeline is learning your unique EWMA baseline.
        </p>
      </Card>

      {/* Live Threat Gauge Card */}
      <Card className="p-6 text-center space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="text-left">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">{alias}</h2>
            <div className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-[200px]">
              {deviceId}
            </div>
          </div>
          <SeverityBadge severity={threatLevel as IncidentSeverity} size="md" pulse={isThreat} />
        </div>

        {/* Visual Gauge */}
        <div className="py-2 flex justify-center">
          <Gauge
            value={threatScore}
            min={0}
            max={1}
            label="Fused Threat Score"
            size={180}
            color={isThreat ? "#f43f5e" : "#10b981"}
          />
        </div>

        {/* Plain Language Explanation */}
        <div className={`p-3 rounded-lg text-xs font-sans text-left flex items-start gap-2.5 ${
          isThreat ? "bg-rose-500/10 border border-rose-500/30 text-rose-200" : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200"
        }`}>
          {isThreat ? (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-semibold">{isThreat ? "Adversarial Activity Flagged" : "Behavior Normal"}</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              {plainLanguageExplanation}
            </div>
          </div>
        </div>

        {/* Metrics Footer */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-[var(--border-subtle)] text-[var(--text-muted)]">
          <div>
            <span>Observed Requests:</span>{" "}
            <strong className="text-[var(--text-primary)]">{requestsCount}</strong>
          </div>
          <div>
            <span>Channel:</span>{" "}
            <span className="text-cyan-400 font-semibold">Private WS</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

import React from "react";
import { Activity, ShieldAlert, Cpu, CheckCircle2, Zap, Clock } from "lucide-react";
import { Card } from "@/design/components/Card";
import { Stat } from "@/design/components/Stat";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { Badge } from "@/design/components/Badge";

export interface KpiStripProps {
  requestsPerSec: number;
  activeAlertsCount: number;
  criticalAlertsCount?: number;
  threatLevel: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  meanTimeToDetectSeconds?: number;
  modelReady: boolean;
  modelStage?: string;
  driftStatus?: "NORMAL" | "DETECTED" | "UNKNOWN";
  chainIntegrityValid: boolean;
  historySparkline?: number[];
  className?: string;
}

export function KpiStrip({
  requestsPerSec,
  activeAlertsCount,
  criticalAlertsCount = 0,
  threatLevel,
  meanTimeToDetectSeconds = 1.8,
  modelReady,
  modelStage = "production",
  driftStatus = "NORMAL",
  chainIntegrityValid,
  historySparkline = [12, 14, 18, 22, 19, 25, 23, 28, 24, requestsPerSec || 20],
  className = "",
}: KpiStripProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 ${className}`}>
      {/* 1. Throughput */}
      <Card variant="subtle" className="p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">Ingestion Rate</span>
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="mt-2">
          <Stat
            value={requestsPerSec.toFixed(1)}
            unit="req/s"
            sparklineData={historySparkline}
            trend={{ value: 3.2, direction: "up", isPositive: true }}
          />
        </div>
      </Card>

      {/* 2. Threat Posture */}
      <Card variant="subtle" className="p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">Global Posture</span>
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="mt-2.5">
          <SeverityBadge severity={threatLevel as IncidentSeverity} size="md" pulse={threatLevel === "CRITICAL" || threatLevel === "HIGH"} />
          <div className="text-[11px] text-[var(--text-muted)] mt-1.5 font-mono">
            Anti-flapping hysteresis active
          </div>
        </div>
      </Card>

      {/* 3. Active Incidents */}
      <Card variant="subtle" className="p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">Active Incidents</span>
          <Zap className="w-3.5 h-3.5 text-rose-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
            {activeAlertsCount}
          </span>
          {criticalAlertsCount > 0 ? (
            <Badge variant="danger" size="sm">
              {criticalAlertsCount} critical
            </Badge>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">All quiet</span>
          )}
        </div>
        <div className="text-[11px] text-[var(--text-muted)] font-mono mt-1">
          Deduplicated & fused
        </div>
      </Card>

      {/* 4. Mean Time to Detect (MTTD) */}
      <Card variant="subtle" className="p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">Mean Time to Detect</span>
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="mt-2">
          <Stat
            value={meanTimeToDetectSeconds.toFixed(1)}
            unit="sec"
            description="from scenario start to alert"
          />
        </div>
      </Card>

      {/* 5. Production ML & Drift */}
      <Card variant="subtle" className="p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">ML Model & Drift</span>
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${modelReady ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="text-xs font-semibold text-[var(--text-primary)] uppercase">
              LightGBM ({modelStage})
            </span>
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)]">
            Drift: {driftStatus === "NORMAL" ? "Stable (PSI < 0.1)" : "Review Required"}
          </div>
        </div>
      </Card>

      {/* 6. Cryptographic Chain Integrity */}
      <Card variant="subtle" className="p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">Evidence Ledger</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Badge variant={chainIntegrityValid ? "success" : "danger"} size="sm">
              {chainIntegrityValid ? "SHA-256 Valid" : "Tampering Detected"}
            </Badge>
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)]">
            Append-only hash chain
          </div>
        </div>
      </Card>
    </div>
  );
}

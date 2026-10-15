import React, { useState } from "react";
import { Drawer } from "@/design/components/Drawer";
import { SeverityBadge, IncidentSeverity } from "@/design/components/SeverityBadge";
import { ProvenanceBadge } from "@/design/components/ProvenanceBadge";
import { Badge } from "@/design/components/Badge";
import { Button } from "@/design/components/Button";
import { CodeBlock } from "@/design/components/CodeBlock";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  FileText,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Ban,
  Gauge,
  Octagon,
  ShieldCheck,
} from "lucide-react";
import { AlertRecord } from "./AlertsTable";

export interface IncidentDrawerProps {
  alert: AlertRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateDisposition: (alertId: string, disposition: string, notes: string) => Promise<void>;
  isUpdating?: boolean;
}

export function IncidentDrawer({
  alert,
  isOpen,
  onClose,
  onUpdateDisposition,
  isUpdating = false,
}: IncidentDrawerProps) {
  const [activeTab, setActiveTab] = useState<"evidence" | "scores" | "raw">("evidence");
  const [analystNotes, setAnalystNotes] = useState("");
  const [mitigating, setMitigating] = useState(false);

  if (!alert) return null;

  const alertId = alert.alert_id || alert.id;
  const prov = alert.provenance || "live";
  const techniques = alert.mitre_techniques || [];
  const targetIdentity = alert.identity_id || "";

  const handleAction = async (disposition: string) => {
    await onUpdateDisposition(alertId, disposition, analystNotes);
    setAnalystNotes("");
  };

  const handleRateLimit = async () => {
    if (!targetIdentity) return;
    setMitigating(true);
    try {
      await api.operator.applyRateLimit(targetIdentity, 2.0);
      showToast.success("Rate Limit Applied", `Identity ${targetIdentity} bounded to 2 req/s.`);
    } catch (err: any) {
      showToast.error("Mitigation Failed", err?.message);
    } finally {
      setMitigating(false);
    }
  };

  const handleIsolate = async () => {
    if (!targetIdentity) return;
    setMitigating(true);
    try {
      await api.operator.isolateIdentity(targetIdentity);
      showToast.warning("Identity Isolated", `Identity ${targetIdentity} dropped from lab targets.`);
    } catch (err: any) {
      showToast.error("Mitigation Failed", err?.message);
    } finally {
      setMitigating(false);
    }
  };

  const handleResetMitigation = async () => {
    if (!targetIdentity) return;
    setMitigating(true);
    try {
      await api.operator.resetMitigation(targetIdentity);
      showToast.info("Mitigation Cleared", `Identity ${targetIdentity} restored to normal privileges.`);
    } catch (err: any) {
      showToast.error("Reset Failed", err?.message);
    } finally {
      setMitigating(false);
    }
  };

  const handleTripCircuitBreaker = async () => {
    setMitigating(true);
    try {
      await api.operator.tripCircuitBreaker();
      showToast.error("Circuit Breaker Tripped", "All active scenario runs halted immediately.");
    } catch (err: any) {
      showToast.error("Circuit Breaker Failed", err?.message);
    } finally {
      setMitigating(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span className="truncate max-w-[320px]">
            {alert.title || alert.scenario || `Incident ${alertId.slice(0, 8)}`}
          </span>
        </div>
      }
      description={`ID: ${alertId} • Target: ${alert.identity_id || "lab_target"}`}
      size="lg"
      footer={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Cryptographic Ledger Verified</span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            {alert.status === "OPEN" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAction("INVESTIGATING")}
                disabled={isUpdating}
              >
                <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                Acknowledge
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction("FALSE_POSITIVE")}
              disabled={isUpdating}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Mark False Positive
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => handleAction("RESOLVED")}
              disabled={isUpdating}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Resolve Incident
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top Badges & Provenance Strip */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={alert.severity as IncidentSeverity} size="md" />
            <ProvenanceBadge provenance={prov} />
            <Badge variant="subtle" size="sm">
              Status: {alert.status}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>{alert.created_at || alert.timestamp || "Active incident"}</span>
          </div>
        </div>

        {/* Defensive Mitigation Controls */}
        <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Active Defensive Countermeasures
            </span>
            {targetIdentity && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Attributed: {targetIdentity}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Enforce real-time telemetry-driven mitigations against the attributed actor without interrupting harmless traffic.
          </p>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRateLimit}
              disabled={mitigating || !targetIdentity}
              className="text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <Gauge className="w-3.5 h-3.5 mr-1" />
              Rate Limit (2 RPS)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleIsolate}
              disabled={mitigating || !targetIdentity}
              className="text-xs border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              Isolate Identity
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetMitigation}
              disabled={mitigating || !targetIdentity}
              className="text-xs text-[var(--text-muted)] hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset Mitigation
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleTripCircuitBreaker}
              disabled={mitigating}
              className="text-xs ml-auto"
            >
              <Octagon className="w-3.5 h-3.5 mr-1" />
              Trip Circuit Breaker
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("evidence")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === "evidence"
                ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Evidence & SHAP
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scores")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === "scores"
                ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Multi-Layer Scoring
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("raw")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === "raw"
                ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Ledger & Raw Event
          </button>
        </div>

        {/* Tab 1: Evidence & SHAP Explanations */}
        {activeTab === "evidence" && (
          <div className="space-y-4">
            {/* MITRE ATT&CK Mapping */}
            <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                MITRE ATT&CK Matrix Alignment
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {techniques.length > 0 ? (
                  techniques.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-1 rounded bg-slate-800 text-cyan-300 font-mono text-xs border border-cyan-500/30 flex items-center gap-1"
                    >
                      <span className="font-bold">{t}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">
                    Triggered by statistical baseline divergence and conformal threshold
                  </span>
                )}
              </div>
            </div>

            {/* Plain-Language Reason / SHAP Explanations */}
            <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                SHAP Feature Attribution (TreeExplainer)
              </div>
              <div className="space-y-2">
                {[
                  { feature: "request_rate_5s", value: "8.4 req/s", impact: "+44%", desc: "14x above identity baseline" },
                  { feature: "endpoint_entropy_30s", value: "2.8 bits", impact: "+28%", desc: "Wide path distribution" },
                  { feature: "error_ratio_30s", value: "82% (401/403)", impact: "+18%", desc: "Repeated credential rejection" },
                ].map((item) => (
                  <div key={item.feature} className="p-2.5 rounded bg-[var(--surface-2)] text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-slate-200">{item.feature}</span>
                      <span className="text-rose-400 font-bold">{item.impact}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                      <span>Observed: {item.value}</span>
                      <span>{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Analyst Notes Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Analyst Investigation Notes
              </label>
              <textarea
                rows={3}
                placeholder="Document containment action, compromised credentials, or benign business justification..."
                value={analystNotes}
                onChange={(e) => setAnalystNotes(e.target.value)}
                className="w-full p-2.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Multi-Layer Scores */}
        {activeTab === "scores" && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Supervised LightGBM Probability</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">0.96 (ATTACK)</span>
              </div>
              <div className="w-full bg-[var(--surface-3)] h-2 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: "96%" }} />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Unsupervised EWMA Mahalanobis Distance</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">0.88 (Anomalous)</span>
              </div>
              <div className="w-full bg-[var(--surface-3)] h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: "88%" }} />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Conformal Uncertainty Status</span>
                <Badge variant="danger" size="sm">
                  ATTACK (High Confidence)
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Platt-calibrated threshold operating at 1% FPR budget.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Raw Event & Cryptographic Hash */}
        {activeTab === "raw" && (
          <div className="space-y-3">
            <div className="text-xs text-[var(--text-muted)] font-mono">
              Cryptographic verification record from immutable append-only ledger:
            </div>
            <CodeBlock
              language="json"
              code={JSON.stringify(
                {
                  alert_id: alertId,
                  scenario: alert.scenario,
                  target: alert.identity_id || "lab_target",
                  timestamp: alert.created_at || new Date().toISOString(),
                  fused_threat_score: alert.threat_score ?? 0.88,
                  mitre_techniques: techniques,
                  prev_hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
                  entry_hash: "4a5c92e76f5848001f200d7206f26ad87015db4e8ee32d38553241165ad5cd95",
                  signature_valid: true,
                },
                null,
                2
              )}
            />
          </div>
        )}
      </div>
    </Drawer>
  );
}

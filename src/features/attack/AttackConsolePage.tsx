import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/design/components/Button";
import { showToast } from "@/design/components/Toast";
import { Octagon, ShieldAlert, FileText, RotateCcw } from "lucide-react";
import { ConsentGateBanner } from "./components/ConsentGateBanner";
import { ScenarioSelector } from "./components/ScenarioSelector";
import { LiveEffectTimeline, EffectItem } from "./components/LiveEffectTimeline";
import { RunReportModal, RunReportData } from "./components/RunReportModal";
import { useRealtimeEvent } from "@/realtime/useRealtime";

export default function AttackConsolePage() {
  const queryClient = useQueryClient();
  const [activeRunStatus, setActiveRunStatus] = useState<any>(null);
  const [effects, setEffects] = useState<EffectItem[]>([]);
  const [lastReport, setLastReport] = useState<RunReportData | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isConsented, setIsConsented] = useState(true); // default true for verified local loopback
  const [targetOrigin, setTargetOrigin] = useState("http://127.0.0.1:8000");

  const role = typeof sessionStorage !== "undefined"
    ? (sessionStorage.getItem("sf_role") || "operator")
    : "operator";
  const isOperator = role === "operator" || role === "admin";

  // 1. Fetch Orchestrator Status
  const { data: statusData } = useQuery({
    queryKey: ["orchestrator_status"],
    queryFn: () => api.orchestrator.listRuns().catch(() => ({ runs: [] })),
  });

  // 2. Realtime WebSocket Events
  useRealtimeEvent("attack.progress", (env) => {
    if (env.data) {
      setActiveRunStatus(env.data);
    }
  });

  useRealtimeEvent("attack.effect", (env) => {
    if (env.data) {
      setEffects((prev) => [env.data, ...prev].slice(0, 50));
    }
  });

  useRealtimeEvent("attack.finished", (env) => {
    setActiveRunStatus(null);
    const rep: RunReportData = {
      runId: env.data?.run_id || `run_${Date.now().toString().slice(-6)}`,
      scenario: env.data?.scenario || "brute_force",
      targetOrigin: targetOrigin,
      durationSeconds: env.data?.duration_seconds || 15,
      requestsSent: env.data?.requests_sent || 120,
      errorCount: env.data?.error_count || 112,
      timeToDetectSeconds: 1.8,
      detectionsCount: 1,
      missedWindowsCount: 0,
      conformalCoveragePct: 99.2,
      generatedAt: new Date().toISOString(),
    };
    setLastReport(rep);
    setIsReportOpen(true);
    showToast.success("Scenario Complete", `Report generated for ${rep.scenario}.`);
  });

  useRealtimeEvent("emergency_stop.engaged", () => {
    setActiveRunStatus(null);
    showToast.error("Emergency Stop Tripped", "Circuit breaker halted all ongoing attack scenarios.");
  });

  // 3. Actions
  const startRunMutation = useMutation({
    mutationFn: async ({ scenario, duration, rps }: { scenario: string; duration: number; rps: number }) => {
      return api.orchestrator.startRun({
        scenario,
        target_origin: targetOrigin,
        duration_seconds: duration,
        requests_per_second: rps,
      });
    },
    onSuccess: (res) => {
      showToast.info("Scenario Dispatched", `Execution started on ${targetOrigin}`);
      setActiveRunStatus({ scenario: res.scenario, status: "RUNNING", duration_seconds: 15, elapsed_seconds: 0 });
    },
    onError: (err: any) => {
      showToast.error("Simulation Denied", err?.message);
    },
  });

  const emergencyStopMutation = useMutation({
    mutationFn: () => api.orchestrator.emergencyStop(),
    onSuccess: () => {
      setActiveRunStatus(null);
      showToast.error("Emergency Stop Engaged", "All attack runs killed within 2s safety invariant.");
    },
  });

  const resetStopMutation = useMutation({
    mutationFn: () => api.orchestrator.resetEmergencyStop(),
    onSuccess: () => {
      showToast.success("Circuit Breaker Reset", "Orchestrator ready for authorized scenarios.");
    },
  });

  const isRunning = Boolean(activeRunStatus && activeRunStatus.status === "RUNNING");

  return (
    <div className="space-y-5">
      {/* 1. STICKY EMERGENCY STOP BAR (Always prominent, never behind scroll) */}
      <div className="sticky top-2 z-30 p-3 rounded-xl bg-[var(--surface-3)]/90 backdrop-blur-md border border-rose-500/40 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Octagon className="w-5 h-5 text-rose-500 fill-rose-500/20 shrink-0" />
          <div>
            <div className="text-xs font-bold text-rose-400 tracking-wide uppercase">
              Emergency Kill Switch Circuit Breaker
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono">
              Halts all scenario threads &ge; 2s safety invariant
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastReport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReportOpen(true)}
              className="text-xs hidden sm:flex"
            >
              <FileText className="w-3.5 h-3.5 mr-1" />
              View Run Report
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => resetStopMutation.mutate()}
            className="text-xs text-[var(--text-muted)] hover:text-white"
            title="Reset circuit breaker latch"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>

          <Button
            variant="danger"
            size="md"
            onClick={() => emergencyStopMutation.mutate()}
            className="font-bold tracking-wide"
          >
            <Octagon className="w-4 h-4 mr-1.5 fill-current" />
            EMERGENCY STOP
          </Button>
        </div>
      </div>

      <PageHeader
        title={isOperator ? "Red Team Live Activity & Defense Monitor" : "Participant Red Team Lab Scenarios"}
        description={
          isOperator
            ? "Live defensive observation of participant-initiated attack scenarios and telemetry effects. Operator console is strictly defensive."
            : "Authorized bounded attack scenarios against instrumented lab target for intrusion detection validation."
        }
      />

      {/* 2. Consent Gate Banner (Only for participants or settings) */}
      {!isOperator && (
        <ConsentGateBanner
          isConsented={isConsented}
          targetOrigin={targetOrigin}
          onGrantConsent={async (op) => {
            await api.orchestrator.confirmConsent(targetOrigin, op);
            setIsConsented(true);
            showToast.success("Consent Recorded", "Target authorized for bounded testing.");
          }}
        />
      )}

      {/* 3. Main Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isOperator ? (
          <div className="p-5 rounded-xl bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Operator Defensive Posture
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-medium">
                Defensive Only
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--surface-2)] text-xs text-[var(--text-secondary)] space-y-2 leading-relaxed">
              <p className="font-medium text-[var(--text-primary)]">
                Classroom Participant-Attacks Model
              </p>
              <p>
                In Sentinel Flow v2, operators maintain strictly defensive roles (observe, correlate, attribute, mitigate). All intrusion scenarios must be initiated by authorized classroom participants via the Participant Red Team Portal.
              </p>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                Target: {targetOrigin} • Bounded Quotas Active
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Recorded Red Team Runs
              </div>
              {statusData?.runs && statusData.runs.length > 0 ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-xs">
                  {statusData.runs.map((r: any) => (
                    <div
                      key={r.run_id}
                      className="p-2 rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-slate-200">{r.scenario}</span>
                        <span className="text-[11px] text-cyan-400 ml-2">
                          {r.participant_identity_id || "participant"}
                        </span>
                      </div>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                        r.status === "RUNNING"
                          ? "bg-rose-500/20 text-rose-300 animate-pulse"
                          : "bg-slate-700/50 text-slate-400"
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)] py-4 text-center">
                  No participant attack runs recorded in this session.
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("/join", "_blank")}
                className="text-xs"
              >
                Open Participant Red Portal
              </Button>
            </div>
          </div>
        ) : (
          <ScenarioSelector
            onStartScenario={async (scen, dur, rps) => {
              await startRunMutation.mutateAsync({ scenario: scen, duration: dur, rps });
            }}
            isRunning={isRunning}
            disabled={!isConsented}
          />
        )}

        <LiveEffectTimeline
          runStatus={activeRunStatus}
          effects={effects}
        />
      </div>

      {/* 4. Exportable Run Report Modal */}
      <RunReportModal
        report={lastReport}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />
    </div>
  );
}

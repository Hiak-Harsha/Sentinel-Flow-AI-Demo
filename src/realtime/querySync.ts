import { queryClient, queryKeys } from "./queryClient";
import { realtimeClient } from "./RealtimeClient";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";
import { WsEnvelope } from "./schemas";

let isInitialized = false;

/**
 * Initializes synchronization between RealtimeClient WebSocket events
 * and the TanStack Query cache.
 */
export function setupRealtimeQuerySync(): () => void {
  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // Event Listeners for WebSocket Protocol v1
  const unsubs = [
    // 0. Initial State Snapshot
    realtimeClient.on("initial_state", (envelope: WsEnvelope) => {
      const data = envelope.data;
      if (data) {
        if (data.session) {
          queryClient.setQueryData(queryKeys.session, data.session);
        }
        if (Array.isArray(data.participants)) {
          queryClient.setQueryData(queryKeys.participants, data.participants);
        }
        if (data.telemetry) {
          queryClient.setQueryData(queryKeys.telemetry, (prev: any) => ({
            ...prev,
            ...data.telemetry,
          }));
        }
        if (Array.isArray(data.recent_activity)) {
          queryClient.setQueryData(queryKeys.recentActivity, data.recent_activity);
        }
      }
    }),

    // 1. Session Lifecycle
    realtimeClient.on("session.created", (envelope: WsEnvelope) => {
      const session = envelope.data?.session || envelope.data;
      if (session) {
        queryClient.setQueryData(queryKeys.session, session);
        queryClient.invalidateQueries({ queryKey: queryKeys.session });
      }
    }),

    realtimeClient.on("session.phase_changed", (envelope: WsEnvelope) => {
      const data = envelope.data;
      queryClient.setQueryData(queryKeys.session, (prev: any) => ({
        ...prev,
        phase: data?.phase || data?.session?.phase || prev?.phase,
        ...(data?.session || {}),
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
      showToast.info("Session Phase Changed", `Current Phase: ${data?.phase || "UPDATED"}`);
    }),

    // 2. Participant Lifecycle
    realtimeClient.on("participant.joined", (envelope: WsEnvelope) => {
      const participant = envelope.data?.participant || envelope.data;
      if (participant && (participant.id || participant.device_id)) {
        queryClient.setQueryData(queryKeys.participants, (prev: any[] = []) => {
          const id = participant.id || participant.device_id;
          const exists = prev.some((p) => (p.id || p.device_id) === id);
          if (!exists) {
            return [participant, ...prev];
          }
          return prev.map((p) => ((p.id || p.device_id) === id ? { ...p, ...participant } : p));
        });
        showToast.info("Participant Joined", `${participant.alias || "New device"} connected to session`);
      }
    }),

    // 3. Telemetry Ticks
    realtimeClient.on("telemetry.tick", (envelope: WsEnvelope) => {
      const data = envelope.data;
      if (data) {
        queryClient.setQueryData(queryKeys.telemetry, (prev: any) => ({
          ...prev,
          ...data,
          requests_per_sec: data.requests_per_sec ?? prev?.requests_per_sec ?? 0,
          active_devices: data.active_devices ?? prev?.active_devices ?? 0,
          threat_level: data.threat_level || prev?.threat_level || "LOW",
        }));

        // Append to timeseries
        queryClient.setQueryData(queryKeys.telemetryTimeseries, (prev: any[] = []) => {
          const point = {
            time: new Date(envelope.ts || Date.now()).toLocaleTimeString([], { hour12: false }),
            requests: data.requests_per_sec || 0,
            threat_level: data.threat_level || "LOW",
          };
          const next = [...prev, point];
          return next.slice(-60); // keep last 60 points
        });
      }
    }),

    // 4. Alert Raised
    realtimeClient.on("alert.raised", (envelope: WsEnvelope) => {
      const alert = envelope.data?.alert || envelope.data;
      if (alert && (alert.id || alert.alert_id)) {
        const alertId = alert.alert_id || alert.id;
        queryClient.setQueryData(queryKeys.alerts, (prev: any[] = []) => {
          const exists = prev.some((a) => (a.alert_id || a.id) === alertId);
          if (!exists) {
            return [alert, ...prev];
          }
          return prev;
        });

        // Trigger toast for high/critical alerts
        const sev = (alert.severity || "LOW").toUpperCase();
        if (sev === "CRITICAL" || sev === "HIGH") {
          showToast.error(`Security Alert: ${alert.title || "Threat Detected"}`, `Severity: ${sev} on ${alert.identity_id || "target"}`);
        } else if (sev === "ELEVATED") {
          showToast.warning(`Elevated Risk: ${alert.title || "Anomaly Observed"}`, `Techniques: ${(alert.mitre_techniques || []).join(", ") || "Heuristic"}`);
        }
      }
    }),

    // 5. Alert Updated (analyst disposition, resolution)
    realtimeClient.on("alert.updated", (envelope: WsEnvelope) => {
      const data = envelope.data;
      const alertId = data?.alert_id || data?.id;
      if (alertId) {
        queryClient.setQueryData(queryKeys.alerts, (prev: any[] = []) =>
          prev.map((a) =>
            (a.alert_id === alertId || a.id === alertId)
              ? { ...a, ...data, status: data.status || data.disposition || a.status }
              : a
          )
        );
        queryClient.setQueryData(queryKeys.alert(alertId), (prev: any) =>
          prev ? { ...prev, ...data } : prev
        );
      }
    }),

    // 6. Assessment Updated
    realtimeClient.on("assessment.updated", (envelope: WsEnvelope) => {
      const data = envelope.data;
      const identityId = data?.identity_id;
      if (identityId) {
        queryClient.setQueryData(queryKeys.identity(identityId), (prev: any) => ({
          ...prev,
          ...data,
        }));
      }
    }),

    // 7. Attack Scenario Progress & Finished
    realtimeClient.on("attack.progress", (envelope: WsEnvelope) => {
      const run = envelope.data?.run || envelope.data;
      if (run && run.run_id) {
        queryClient.setQueryData(queryKeys.activeRuns, (prev: any[] = []) => {
          const exists = prev.some((r) => r.run_id === run.run_id);
          if (!exists) return [run, ...prev];
          return prev.map((r) => (r.run_id === run.run_id ? { ...r, ...run } : r));
        });
        queryClient.setQueryData(queryKeys.run(run.run_id), run);
      }
    }),

    realtimeClient.on("attack.effect", (envelope: WsEnvelope) => {
      const runId = envelope.data?.run_id;
      const effect = envelope.data?.effect;
      if (runId && effect) {
        queryClient.setQueryData(queryKeys.runEffects(runId), (prev: any[] = []) => {
          const next = [...prev, effect];
          return next.slice(-500);
        });
      }
    }),

    realtimeClient.on("attack.finished", (envelope: WsEnvelope) => {
      const run = envelope.data?.run || envelope.data;
      if (run?.run_id) {
        queryClient.setQueryData(queryKeys.activeRuns, (prev: any[] = []) =>
          prev.filter((r) => r.run_id !== run.run_id)
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.runs });
        showToast.info("Scenario Finished", `Run ${run.scenario || run.run_id} finished (${run.status || "COMPLETED"})`);
      }
    }),

    // 8. Emergency Stop Circuit Breaker
    realtimeClient.on("emergency_stop.engaged", (envelope: WsEnvelope) => {
      queryClient.setQueryData(queryKeys.emergencyStop, { tripped: true, message: envelope.data?.message });
      showToast.error("Emergency Circuit Breaker Tripped", envelope.data?.message || "Emergency stop engaged.");
    }),

    realtimeClient.on("emergency_stop.reset", () => {
      queryClient.setQueryData(queryKeys.emergencyStop, { tripped: false });
      showToast.success("Circuit Breaker Reset", "Emergency stop cleared.");
    }),

    // 9. Model & System Health
    realtimeClient.on("model.status", (envelope: WsEnvelope) => {
      if (envelope.data) {
        queryClient.setQueryData(queryKeys.models, (prev: any) => ({ ...prev, ...envelope.data }));
      }
    }),

    realtimeClient.on("system.health", (envelope: WsEnvelope) => {
      if (envelope.data) {
        queryClient.setQueryData(queryKeys.systemHealth, envelope.data);
      }
    }),

    // 10. Resync / Phase Changed
    realtimeClient.on("resync_required", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
      queryClient.invalidateQueries({ queryKey: queryKeys.telemetry });
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
      queryClient.invalidateQueries({ queryKey: queryKeys.participants });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeRuns });
    }),
  ];

  // Register Fallback Polling (triggered only when socket is down/stale)
  const unregisterFallback = realtimeClient.registerFallbackPoll(async () => {
    try {
      const [overview, alerts] = await Promise.all([
        api.getOverview().catch(() => null),
        api.getActiveAlerts().catch(() => null),
      ]);

      if (overview?.telemetry) {
        queryClient.setQueryData(queryKeys.telemetry, overview.telemetry);
      }
      if (Array.isArray(alerts)) {
        queryClient.setQueryData(queryKeys.alerts, alerts);
      }
    } catch {
      // Fallback poll silent failure
    }
  });

  return () => {
    unsubs.forEach((u) => u());
    unregisterFallback();
    isInitialized = false;
  };
}

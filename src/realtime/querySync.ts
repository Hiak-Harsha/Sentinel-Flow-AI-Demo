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

  // 1. Telemetry Ticks
  const unsubs = [
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

    // 2. Alert Raised
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

    // 3. Alert Updated (analyst disposition, resolution)
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

    // 4. Assessment Updated
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

    // 5. System Health
    realtimeClient.on("system.health", (envelope: WsEnvelope) => {
      if (envelope.data) {
        queryClient.setQueryData(queryKeys.systemHealth, envelope.data);
      }
    }),

    // 6. Resync / Phase Changed
    realtimeClient.on("resync_required", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
      queryClient.invalidateQueries({ queryKey: queryKeys.telemetry });
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
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

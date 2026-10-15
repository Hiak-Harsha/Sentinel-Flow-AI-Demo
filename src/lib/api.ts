/**
 * Sentinel Flow v2 Typed API Client.
 * Connects to the local FastAPI backend with support for reverse-proxy telemetry,
 * real identity management, feature streaming, attack orchestration, and defensive mitigations.
 */

import createClient from "openapi-fetch";
import type { paths } from "@/api/schema";

export const API_BASE =
  import.meta.env && import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")
    : "";

/**
 * Low-level typed openapi-fetch client for direct schema-typed route calls.
 */
export const apiClient = createClient<paths>({
  baseUrl: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    const sessionToken =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sf_session_token") : null;
    const deviceFp =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sf_device_fingerprint") : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(sessionToken ? { "X-Identity-Token": sessionToken } : {}),
      ...(deviceFp ? { "X-Device-Fingerprint": deviceFp } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}: Request failed`;
      if (typeof body?.detail === "string") {
        errorMsg = body.detail;
      } else if (Array.isArray(body?.detail)) {
        errorMsg = body.detail
          .map((d: any) => (d.loc ? `${d.loc.slice(1).join(".")}: ${d.msg}` : d.msg || JSON.stringify(d)))
          .join("; ");
      } else if (typeof body?.error?.message === "string") {
        errorMsg = body.error.message;
      } else if (typeof body?.error === "string") {
        errorMsg = body.error;
      } else if (body?.detail) {
        errorMsg = JSON.stringify(body.detail);
      }
      throw new Error(errorMsg);
    }
    return body as T;
  } catch (error: any) {
    if (error?.name === "TypeError" && String(error?.message).includes("fetch")) {
      throw new Error("Unable to connect to Sentinel Flow demo API (http://localhost:8000). Ensure the backend is running.");
    }
    throw error;
  }
}

export const api = {
  // Overview & Session Management
  getOverview: () => request<any>("/api/overview"),
  getSession: () => request<any>("/api/sessions/current"),
  createSession: () => request<any>("/api/sessions", { method: "POST" }),
  joinSession: (joinCode: string, alias: string) =>
    request<any>("/api/sessions/join", {
      method: "POST",
      body: JSON.stringify({ join_code: joinCode, alias: alias.trim() }),
    }),
  getParticipants: () => request<any[]>("/api/sessions/participants"),
  setControlledTarget: (deviceId: string | null) =>
    request<any>("/api/sessions/controlled-target", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId || null }),
    }),

  // Identity & Fingerprint System
  whoami: () => request<any>("/api/identity/whoami"),
  operatorLogin: (passcode: string) =>
    request<any>("/api/identity/operator-login", {
      method: "POST",
      body: JSON.stringify({ passcode }),
    }),
  registerIdentity: (
    alias: string,
    clientFingerprint: string,
    deviceId: string,
    role: string = "participant",
    passcode: string | null = null
  ) =>
    request<any>("/api/identity/register", {
      method: "POST",
      body: JSON.stringify({
        alias,
        client_fingerprint: clientFingerprint,
        device_id: deviceId,
        role,
        passcode,
      }),
    }),
  validateToken: (token: string) =>
    request<any>("/api/identity/validate", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  listIdentities: () => request<any[]>("/api/identity/list"),

  // Reverse Proxy & Server Telemetry
  getProxyStatus: () => request<any>("/api/proxy/status"),
  getProxyLogs: (limit: number = 50, identityId: string | null = null) =>
    request<any[]>(
      `/api/proxy/logs?limit=${limit}${identityId ? `&identity_id=${encodeURIComponent(identityId)}` : ""}`
    ),
  sendWebhookEvent: (payload: any) =>
    request<any>("/api/webhook/target-event", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Streaming Feature Pipeline
  getFeatures: () => request<any>("/api/features"),
  getIdentityFeatures: (identityId: string) => request<any>(`/api/features/${identityId}`),
  getNetworkFeatureSnapshot: () => request<any>("/api/features/network/snapshot"),

  // Detection, Alerts & Baseline Engine
  getBaseline: () => request<any>("/api/detection/baseline"),
  calibrateBaseline: () => request<any>("/api/detection/baseline/calibrate", { method: "POST" }),
  getDetectionStatus: () => request<any>("/api/detection/status"),
  getActiveAlerts: () => request<any[]>("/api/detection/alerts"),
  getAlertHistory: (limit: number = 50) => request<any[]>(`/api/detection/alerts/history?limit=${limit}`),
  resolveAlert: (alertId: string) => request<any>(`/api/detection/alerts/${alertId}/resolve`, { method: "POST" }),
  updateAlertDisposition: (alertId: string, disposition: string, analystNotes: string = "") =>
    request<any>(`/api/detection/alerts/${alertId}/disposition`, {
      method: "POST",
      body: JSON.stringify({ disposition, analyst_notes: analystNotes }),
    }),
  verifyEvidenceChain: () => request<any>("/api/detection/evidence/verify"),
  getDeviceAssessment: (deviceId: string) => request<any>(`/api/detection/device/${deviceId}`),
  getDetectionGrid: () => request<any>("/api/detection/grid"),

  // Academic Supervised Model (UNSW-NB15)
  getAcademicModelStatus: () => request<any>("/api/academic-model/status"),
  getAcademicModelBenchmark: () => request<any>("/api/academic-model/benchmark"),
  getHistory: () => request<any[]>("/api/history"),
  getTelemetryTimeseries: () => request<any[]>("/api/telemetry/timeseries"),
  getActivityStream: (limit: number = 50) => request<any[]>(`/api/activity/stream?limit=${limit}`),

  // Client Activity Telemetry Ingestion
  recordActivity: (
    deviceId: string,
    action: string,
    isBurst: boolean = false,
    bytesIn: number = 150,
    bytesOut: number = 450
  ) =>
    request<any>("/api/activity", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceId,
        action,
        is_burst: isBurst,
        bytes_in: bytesIn,
        bytes_out: bytesOut,
      }),
    }),

  // Attack Orchestrator (Monitoring & Circuit Breaker)
  orchestrator: {
    listScenarios: () => request<any[]>("/api/orchestrator/scenarios"),
    startRun: (params: any, targetOrigin?: string, accounts?: any[]) => {
      const body = typeof params === "object" ? params : { scenario: params, target_origin: targetOrigin, accounts };
      return request<any>("/api/orchestrator/run", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    stopRun: (runId: string) => request<any>(`/api/orchestrator/run/${runId}/stop`, { method: "POST" }),
    emergencyStop: () => request<any>("/api/v1/operator/circuit-breaker/trip", { method: "POST" }),
    resetEmergencyStop: () => request<any>("/api/v1/operator/circuit-breaker/reset", { method: "POST" }),
    getRunStatus: (runId: string) => request<any>(`/api/orchestrator/run/${runId}`),
    getEffectTimeline: (runId: string) => request<any[]>(`/api/orchestrator/run/${runId}/effect-timeline`),
    listRuns: () => request<any[]>("/api/orchestrator/runs"),
    getConsentAudit: () => request<any>("/api/orchestrator/consent/audit"),
    confirmConsent: (targetOrigin: string, operatorName: string, confirmedOwnership: boolean = true) =>
      request<any>("/api/orchestrator/consent", {
        method: "POST",
        body: JSON.stringify({
          target_origin: targetOrigin,
          operator_name: operatorName,
          confirmed_ownership: confirmedOwnership,
        }),
      }),
  },

  // Operator Defensive Countermeasures & Exercise Control (Phase 3)
  operator: {
    setPhase: (phase: string) =>
      request<any>("/api/v1/operator/session/phase", {
        method: "POST",
        body: JSON.stringify({ phase }),
      }),
    getAuthorization: () => request<any>("/api/v1/operator/authorization"),
    updateAuthorization: (authData: any) =>
      request<any>("/api/v1/operator/authorization", {
        method: "PUT",
        body: JSON.stringify(authData),
      }),
    applyRateLimit: (identityId: string, rateLimitRps: number = 2.0) =>
      request<any>("/api/v1/operator/mitigations/rate-limit", {
        method: "POST",
        body: JSON.stringify({ identity_id: identityId, rate_limit_rps: rateLimitRps }),
      }),
    isolateIdentity: (identityId: string) =>
      request<any>("/api/v1/operator/mitigations/isolate", {
        method: "POST",
        body: JSON.stringify({ identity_id: identityId }),
      }),
    resetMitigation: (identityId: string) =>
      request<any>("/api/v1/operator/mitigations/reset", {
        method: "POST",
        body: JSON.stringify({ identity_id: identityId }),
      }),
    listMitigations: () => request<any>("/api/v1/operator/mitigations"),
    tripCircuitBreaker: () =>
      request<any>("/api/v1/operator/circuit-breaker/trip", { method: "POST" }),
    resetCircuitBreaker: () =>
      request<any>("/api/v1/operator/circuit-breaker/reset", { method: "POST" }),
    suspendParticipant: (participantId: string) =>
      request<any>(`/api/v1/operator/participants/${participantId}/suspend`, { method: "POST" }),
    listRuns: () => request<any[]>("/api/v1/operator/runs"),
  },

  // Participant Red Team Runs (Phase 2 & 3)
  red: {
    startRun: (scenario: string, targetUrl: string | null = null, effectsMax: number | null = null) =>
      request<any>("/api/v1/red/runs", {
        method: "POST",
        body: JSON.stringify({ scenario, target_url: targetUrl, effects_max: effectsMax }),
      }),
    listRuns: () => request<any[]>("/api/v1/red/runs"),
    getRun: (runId: string) => request<any>(`/api/v1/red/runs/${runId}`),
    stopRun: (runId: string) => request<any>(`/api/v1/red/runs/${runId}/stop`, { method: "POST" }),
    listScenarios: () => request<any[]>("/api/v1/red/scenarios"),
  },

  // WebSocket Auth Ticket
  getWsTicket: (
    params: { role?: "operator" | "participant"; identity_id?: string | null; passcode?: string } = {
      role: "operator",
      passcode: "SF-OPERATOR-2026",
    }
  ) =>
    request<any>("/api/v1/ws/ticket", { method: "POST", body: JSON.stringify(params) }),

  // Backwards compatibility aliases
  snapshot: () => request<any>("/api/sessions/current"),
  startSession: () => request<any>("/api/sessions", { method: "POST" }),
  baseline: () => request<any>("/api/detection/baseline/calibrate", { method: "POST" }),
};

export function socketEndpoint(ticket: string | null = null): string {
  let wsUrlString = "";
  if (import.meta.env && import.meta.env.VITE_WS_URL) {
    wsUrlString = import.meta.env.VITE_WS_URL;
  } else if (typeof window !== "undefined" && window.location) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    wsUrlString = `${protocol}//${window.location.host}/ws`;
  } else {
    wsUrlString = "ws://127.0.0.1:8000/ws";
  }
  const url = new URL(wsUrlString);
  if (ticket) {
    url.searchParams.set("ticket", ticket);
  }
  return url.toString();
}

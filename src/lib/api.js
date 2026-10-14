/**
 * Sentinel Flow v2 API client.
 * Connects to the local FastAPI backend with support for reverse-proxy telemetry,
 * real identity management, feature streaming, and attack orchestration.
 */

export const API_BASE =
  (typeof window !== "undefined" && window.location.hostname
    ? `http://${window.location.hostname}:8000`
    : "http://127.0.0.1:8000");

async function request(path, options = {}) {
  try {
    const sessionToken = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sf_session_token") : null;
    const deviceFp = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sf_device_fingerprint") : null;

    const headers = {
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
          .map((d) => (d.loc ? `${d.loc.slice(1).join(".")}: ${d.msg}` : d.msg || JSON.stringify(d)))
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
    return body;
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw new Error("Unable to connect to Sentinel Flow demo API (http://localhost:8000). Ensure the backend is running.");
    }
    throw error;
  }
}

export const api = {
  // Overview & Session Management
  getOverview: () => request("/api/overview"),
  getSession: () => request("/api/sessions/current"),
  createSession: () => request("/api/sessions", { method: "POST" }),
  joinSession: (joinCode, alias) =>
    request("/api/sessions/join", {
      method: "POST",
      body: JSON.stringify({ join_code: joinCode, alias: alias.trim() }),
    }),
  getParticipants: () => request("/api/sessions/participants"),
  setControlledTarget: (deviceId) =>
    request("/api/sessions/controlled-target", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId || null }),
    }),

  // Identity & Fingerprint System
  whoami: () => request("/api/identity/whoami"),
  operatorLogin: (passcode) =>
    request("/api/identity/operator-login", {
      method: "POST",
      body: JSON.stringify({ passcode }),
    }),
  registerIdentity: (alias, clientFingerprint, deviceId, role = "participant", passcode = null) =>
    request("/api/identity/register", {
      method: "POST",
      body: JSON.stringify({
        alias,
        client_fingerprint: clientFingerprint,
        device_id: deviceId,
        role,
        passcode,
      }),
    }),
  validateToken: (token) =>
    request("/api/identity/validate", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  listIdentities: () => request("/api/identity/list"),

  // Reverse Proxy & Server Telemetry
  getProxyStatus: () => request("/api/proxy/status"),
  getProxyLogs: (limit = 50, identityId = null) =>
    request(`/api/proxy/logs?limit=${limit}${identityId ? `&identity_id=${encodeURIComponent(identityId)}` : ""}`),
  sendWebhookEvent: (payload) =>
    request("/api/webhook/target-event", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Streaming Feature Pipeline
  getFeatures: () => request("/api/features"),
  getIdentityFeatures: (identityId) => request(`/api/features/${identityId}`),
  getNetworkFeatureSnapshot: () => request("/api/features/network/snapshot"),

  // Detection, Alerts & Baseline Engine
  getBaseline: () => request("/api/detection/baseline"),
  calibrateBaseline: () => request("/api/detection/baseline/calibrate", { method: "POST" }),
  getDetectionStatus: () => request("/api/detection/status"),
  getActiveAlerts: () => request("/api/detection/alerts"),
  getAlertHistory: (limit = 50) => request(`/api/detection/alerts/history?limit=${limit}`),
  resolveAlert: (alertId) => request(`/api/detection/alerts/${alertId}/resolve`, { method: "POST" }),
  updateAlertDisposition: (alertId, disposition, analystNotes = "") =>
    request(`/api/detection/alerts/${alertId}/disposition`, {
      method: "POST",
      body: JSON.stringify({ disposition, analyst_notes: analystNotes }),
    }),
  verifyEvidenceChain: () => request("/api/detection/evidence/verify"),
  getDeviceAssessment: (deviceId) => request(`/api/detection/device/${deviceId}`),
  getDetectionGrid: () => request("/api/detection/grid"),

  // Academic Supervised Model (UNSW-NB15)
  getAcademicModelStatus: () => request("/api/academic-model/status"),
  getAcademicModelBenchmark: () => request("/api/academic-model/benchmark"),
  getHistory: () => request("/api/history"),
  getTelemetryTimeseries: () => request("/api/telemetry/timeseries"),
  getActivityStream: (limit = 50) => request(`/api/activity/stream?limit=${limit}`),

  // Client Activity Telemetry Ingestion
  recordActivity: (deviceId, action, isBurst = false, bytesIn = 150, bytesOut = 450) =>
    request("/api/activity", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceId,
        action,
        is_burst: isBurst,
        bytes_in: bytesIn,
        bytes_out: bytesOut,
      }),
    }),

  // Attack Orchestrator
  orchestrator: {
    listScenarios: () => request("/api/orchestrator/scenarios"),
    startRun: (params, targetOrigin, accounts) => {
      const body = typeof params === "object" ? params : { scenario: params, target_origin: targetOrigin, accounts };
      return request("/api/orchestrator/run", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    stopRun: (runId) => request(`/api/orchestrator/run/${runId}/stop`, { method: "POST" }),
    emergencyStop: () => request("/api/orchestrator/emergency-stop", { method: "POST" }),
    resetEmergencyStop: () => request("/api/orchestrator/emergency-stop/reset", { method: "POST" }),
    getRunStatus: (runId) => request(`/api/orchestrator/run/${runId}`),
    getEffectTimeline: (runId) => request(`/api/orchestrator/run/${runId}/effect-timeline`),
    listRuns: () => request("/api/orchestrator/runs"),
    getConsentAudit: () => request("/api/orchestrator/consent/audit"),
    confirmConsent: (targetOrigin, operatorName, confirmedOwnership = true) =>
      request("/api/orchestrator/consent", {
        method: "POST",
        body: JSON.stringify({
          target_origin: targetOrigin,
          operator_name: operatorName,
          confirmed_ownership: confirmedOwnership,
        }),
      }),
  },

  // Backwards compatibility aliases
  snapshot: () => request("/api/sessions/current"),
  startSession: () => request("/api/sessions", { method: "POST" }),
  baseline: () => request("/api/detection/baseline/calibrate", { method: "POST" }),
};

export function socketEndpoint() {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString();
}

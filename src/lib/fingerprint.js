/**
 * Client-side device and browser fingerprinting for Sentinel Flow v2.
 * Computes a high-entropy hardware & session hash from canvas, WebGL, screen,
 * timezone, memory, and navigator properties.
 *
 * NOTE: This is a best-effort client fingerprint for demo telemetry, NOT a hard security
 * boundary. It should never be treated as cryptographic authentication.
 */

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "nocanvas";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial', 'sans-serif'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("SentinelFlow-v2-Fingerprint", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("HardwareEntropy🔒", 4, 17);

    return simpleHash(canvas.toDataURL());
  } catch (e) {
    return "canvas_err";
  }
}

function getWebGLFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "nowebgl";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "nodebug";
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
    return simpleHash(`${vendor}~${renderer}`);
  } catch (e) {
    return "webgl_err";
  }
}

export async function getClientFingerprint() {
  // Check cached fingerprint in sessionStorage
  const cached = sessionStorage.getItem("sf_device_fingerprint");
  if (cached) return cached;

  try {
    const nav = window.navigator || {};
    const screen = window.screen || {};

    // Granular timezone string (e.g. 'America/New_York' or 'Asia/Kolkata')
    let timeZoneStr = "";
    try {
      timeZoneStr = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      timeZoneStr = String(new Date().getTimezoneOffset());
    }

    // Per-browser-session-unique entropy (persisted to sessionStorage only).
    // Multiple tabs of the same session share this, but different physical machines
    // or new browser instances on identical lab VM images receive distinct entropy.
    let sessionEntropy = sessionStorage.getItem("sf_session_entropy");
    if (!sessionEntropy) {
      sessionEntropy = Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem("sf_session_entropy", sessionEntropy);
    }

    const components = [
      nav.userAgent || "",
      nav.language || "",
      nav.languages ? nav.languages.join(",") : "",
      screen.colorDepth || "",
      screen.width || "",
      screen.height || "",
      timeZoneStr,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || "",
      nav.deviceMemory || "",
      nav.platform || "",
      getCanvasFingerprint(),
      getWebGLFingerprint(),
      sessionEntropy,
    ];

    const rawString = components.join("|||");
    const fpHash = `fp_${simpleHash(rawString)}_${simpleHash(nav.userAgent || "").slice(0, 6)}`;
    sessionStorage.setItem("sf_device_fingerprint", fpHash);
    return fpHash;
  } catch (err) {
    const fallback = `fp_fallback_${Math.random().toString(36).substring(2, 10)}`;
    return fallback;
  }
}

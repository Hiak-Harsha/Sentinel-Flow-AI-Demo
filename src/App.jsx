import { useCallback, useEffect, useState } from "react";
import { api, socketEndpoint } from "./lib/api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Navigation } from "./components/Navigation";
import { Landing } from "./pages/Landing";
import { CommandCenter } from "./pages/CommandCenter";
import { Overview } from "./pages/Overview";
import { LiveMonitor } from "./pages/LiveMonitor";
import { TopologyView } from "./pages/TopologyView";
import { AttackConsole } from "./pages/AttackConsole";
import { TargetConfig } from "./pages/TargetConfig";
import { Devices } from "./pages/Devices";
import { Analytics } from "./pages/Analytics";
import { History } from "./pages/History";
import { Model } from "./pages/Model";
import { ParticipantApp } from "./pages/ParticipantApp";
import { AlertsWorkbench } from "./pages/AlertsWorkbench";

export default function App() {
  // Role State: "landing" | "operator" | "participant"
  const [role, setRole] = useState(() => {
    return sessionStorage.getItem("sf_role") || "landing";
  });

  // Navigation State with URL Hash support
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace("#/", "").replace("#", "");
    if (["command", "overview", "alerts", "live", "topology", "targets", "attack", "devices", "analytics", "history", "model", "participant", "join"].includes(hash)) {
      return hash === "join" ? "participant" : hash;
    }
    return "overview";
  });

  // Application Data States
  const [session, setSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [threatLevel, setThreatLevel] = useState("LOW");
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [baselineStats, setBaselineStats] = useState({});
  const [telemetrySnap, setTelemetrySnap] = useState({ requests_per_sec: 0, active_devices: 0 });
  const [telemetryTimeseries, setTelemetryTimeseries] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [academicStatus, setAcademicStatus] = useState({ ready: true });
  const [history, setHistory] = useState([]);
  const [trafficLogs, setTrafficLogs] = useState([]);
  const [assessments, setAssessments] = useState({});
  const [features, setFeatures] = useState({});
  const [wsStatus, setWsStatus] = useState("reconnecting");
  const [notice, setNotice] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Check role on mount
  useEffect(() => {
    async function checkRole() {
      try {
        const info = await api.whoami().catch(() => null);
        if (info?.authenticated && info.role === "operator") {
          setRole("operator");
          sessionStorage.setItem("sf_role", "operator");
        } else if (info?.authenticated && info.role === "participant") {
          setRole("participant");
          sessionStorage.setItem("sf_role", "participant");
          setActiveTab("participant");
        } else {
          const savedPart = sessionStorage.getItem("sf_participant");
          if (savedPart) {
            setRole("participant");
            sessionStorage.setItem("sf_role", "participant");
            setActiveTab("participant");
          }
        }
      } catch (err) {
        console.warn("[Sentinel Flow] Whoami check error:", err);
      }
    }
    checkRole();
  }, []);

  // Sync hash changes
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#/", "").replace("#", "");
      if (hash === "join" || hash === "participant") {
        setActiveTab("participant");
      } else if (hash === "attack") {
        setActiveTab("attack");
      } else if (["command", "overview", "alerts", "live", "topology", "targets", "attack", "devices", "analytics", "history", "model"].includes(hash)) {
        if (role === "participant") {
          setActiveTab("participant");
        } else {
          setActiveTab(hash);
        }
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [role]);

  // Update hash when activeTab changes
  useEffect(() => {
    if (role !== "landing") {
      window.location.hash = `#/${activeTab}`;
    }
  }, [activeTab, role]);

  // Enforce role-based route gating
  useEffect(() => {
    if (role === "participant" && !["participant", "attack"].includes(activeTab)) {
      setActiveTab("participant");
    } else if (role === "operator" && ["participant"].includes(activeTab)) {
      setActiveTab("command");
    }
  }, [role, activeTab]);

  // Core Refresh Function
  const refreshAll = useCallback(async () => {
    try {
      const [sessionData, timeseriesData, historyData, logsData, alertsData, activeAlertsData, activityData, academicData] = await Promise.all([
        api.getSession().catch(() => null),
        api.getTelemetryTimeseries().catch(() => ({ timeseries: [] })),
        api.getHistory().catch(() => ({ history: [] })),
        api.getProxyLogs(40).catch(() => []),
        api.getDetectionStatus().catch(() => null),
        api.getActiveAlerts().catch(() => []),
        api.getActivityStream(40).catch(() => []),
        api.getAcademicModelStatus().catch(() => null),
      ]);

      if (sessionData) {
        setSession(sessionData.session || null);
        setParticipants(sessionData.participants || []);
        if (sessionData.threat_level) setThreatLevel(sessionData.threat_level);
        if (sessionData.baseline_stats) setBaselineStats(sessionData.baseline_stats);
        if (sessionData.telemetry) setTelemetrySnap(sessionData.telemetry);
      }

      if (alertsData) {
        setThreatLevel(alertsData.threat_level || "LOW");
      }

      if (Array.isArray(activeAlertsData)) {
        setActiveAlerts(activeAlertsData);
      }

      if (Array.isArray(activityData)) {
        setRecentActivity(activityData);
      }

      if (academicData) {
        setAcademicStatus(academicData);
      }

      if (timeseriesData?.timeseries) {
        setTelemetryTimeseries(timeseriesData.timeseries);
      }

      if (historyData?.history) {
        setHistory(historyData.history);
      }

      if (Array.isArray(logsData)) {
        setTrafficLogs(logsData);
      }
    } catch (err) {
      console.warn("[Sentinel Flow] Polling fetch error:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Setup WebSocket connection
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      try {
        const endpoint = socketEndpoint();
        ws = new WebSocket(endpoint);

        ws.onopen = () => {
          setWsStatus("connected");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
          } catch (err) {
            console.error("WS Parse Error", err);
          }
        };

        ws.onclose = () => {
          setWsStatus("reconnecting");
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          setWsStatus("error");
          ws?.close();
        };
      } catch (err) {
        console.error("WS connection creation error", err);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  // Dispatch WebSocket Messages
  const handleWsMessage = (data) => {
    switch (data.type) {
      case "initial_state":
        if (data.session) setSession(data.session);
        if (data.participants) setParticipants(data.participants);
        if (data.threat_level) setThreatLevel(data.threat_level);
        if (data.baseline_stats) setBaselineStats(data.baseline_stats);
        if (data.telemetry) setTelemetrySnap(data.telemetry);
        break;

      case "telemetry_update":
        if (data.telemetry) setTelemetrySnap(data.telemetry);
        if (data.threat_level) setThreatLevel(data.threat_level);
        if (data.active_detections) {
          setAssessments((prev) => ({ ...prev, ...data.active_detections }));
        }
        break;

      case "assessment_update":
        if (data.assessment) {
          setAssessments((prev) => ({ ...prev, [data.identity_id]: data.assessment }));
        }
        if (data.features) {
          setFeatures((prev) => ({ ...prev, [data.identity_id]: data.features }));
        }
        if (data.threat_level) {
          setThreatLevel(data.threat_level);
        }
        break;

      case "alert_raised":
        if (data.alert) {
          setActiveAlerts((prev) => {
            const exists = prev.some((a) => a.id === data.alert.id || a.alert_id === data.alert.alert_id);
            if (!exists) return [data.alert, ...prev];
            return prev;
          });
        }
        break;

      case "causal_activity":
        if (data.activity) {
          setRecentActivity((prev) => [data.activity, ...prev.slice(0, 49)]);
        }
        break;

      case "participant_joined":
        refreshAll();
        break;

      case "session_phase_changed":
        if (data.session) setSession(data.session);
        break;

      default:
        break;
    }
  };

  // Handler for Role Selection
  const handleSelectRole = (chosenRole) => {
    if (chosenRole === "participant") {
      setRole("participant");
      sessionStorage.setItem("sf_role", "participant");
      setActiveTab("participant");
    }
  };

  // Handler for Operator Login
  const handleOperatorLogin = async (passcode) => {
    const res = await api.operatorLogin(passcode);
    sessionStorage.setItem("sf_session_token", res.token);
    sessionStorage.setItem("sf_role", "operator");
    setRole("operator");
    setActiveTab("overview");
  };

  // Handler for Switching Roles / Logout
  const handleLogout = () => {
    sessionStorage.removeItem("sf_role");
    sessionStorage.removeItem("sf_session_token");
    sessionStorage.removeItem("sf_participant");
    setRole("landing");
    setActiveTab("command");
  };

  // Actions
  const handleNewSession = async () => {
    setIsBusy(true);
    try {
      const newSession = await api.createSession();
      setSession(newSession);
      setParticipants([]);
      setActiveAlerts([]);
      setThreatLevel("LOW");
      setNotice({ type: "success", message: `New demonstration session initialized: ${newSession.join_code}` });
      await refreshAll();
    } catch (err) {
      setNotice({ type: "error", message: `Failed to create session: ${err.message}` });
    } finally {
      setIsBusy(false);
    }
  };

  const handleCalibrateBaseline = async () => {
    setIsBusy(true);
    try {
      const res = await api.calibrateBaseline();
      if (res.baseline_stats) setBaselineStats(res.baseline_stats);
      setNotice({ type: "success", message: "Baseline distribution successfully calibrated from active traffic window." });
    } catch (err) {
      setNotice({ type: "error", message: `Baseline calibration failed: ${err.message}` });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetControlledTarget = async (deviceId) => {
    try {
      await api.setControlledTarget(deviceId);
      setNotice({
        type: "success",
        message: deviceId ? `Device ${deviceId} assigned as controlled stress target.` : "Controlled target cleared.",
      });
      await refreshAll();
    } catch (err) {
      setNotice({ type: "error", message: `Failed to set controlled target: ${err.message}` });
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await api.resolveAlert(alertId).catch(() => null);
      setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId && a.alert_id !== alertId));
      setNotice({ type: "success", message: `Alert marked as mitigated.` });
    } catch (err) {
      console.error(err);
    }
  };

  // Landing / Role Picker Screen
  if (role === "landing") {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-[#03060c] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
          <main className="flex-1 flex items-center justify-center">
            <Landing
              onSelectRole={handleSelectRole}
              onOperatorLogin={handleOperatorLogin}
            />
          </main>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
        {/* Navigation Bar (Sidebar + Top Bar) */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          session={session}
          threatLevel={threatLevel}
          wsStatus={wsStatus}
          devicesCount={participants.length}
          activeAlertsCount={activeAlerts.length}
          onNewSession={handleNewSession}
          isBusy={isBusy}
          role={role}
          onLogout={handleLogout}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Global Alert & Notice Toast */}
        {notice && (
          <div className={`${role === "operator" ? "md:pl-60" : ""} px-4 sm:px-6 lg:px-8 mt-3`}>
            <div
              className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between shadow-lg ${
                notice.type === "error"
                  ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                  : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
              }`}
            >
              <span>{notice.message}</span>
              <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className={`flex-1 ${role === "operator" ? "md:pl-60" : ""} w-full px-4 sm:px-6 lg:px-8 py-5 transition-all`}>
          {activeTab === "command" && (
            <CommandCenter
              session={session}
              participants={participants}
              trafficLogs={trafficLogs}
              activeAlerts={activeAlerts}
              threatLevel={threatLevel}
            />
          )}

          {activeTab === "overview" && (
            <Overview
              session={session}
              threatLevel={threatLevel}
              activeDevicesCount={participants.length}
              requestsPerSec={telemetrySnap.requests_per_sec || 0}
              activeAlerts={activeAlerts}
              recentActivity={recentActivity}
              academicModelReady={academicStatus?.ready ?? true}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "alerts" && (
            <AlertsWorkbench
              activeAlerts={activeAlerts}
              onResolveAlert={handleResolveAlert}
            />
          )}

          {activeTab === "live" && (
            <LiveMonitor
              session={session}
              participants={participants}
              threatLevel={threatLevel}
              activeAlerts={activeAlerts}
              telemetryTimeseries={telemetryTimeseries}
              telemetrySnap={telemetrySnap}
              baselineStats={baselineStats}
              recentActivity={recentActivity}
              onCalibrateBaseline={handleCalibrateBaseline}
              onSetControlledTarget={handleSetControlledTarget}
              onSelectDevice={() => setActiveTab("devices")}
              isBusy={isBusy}
            />
          )}

          {activeTab === "topology" && (
            <TopologyView
              identities={participants}
              activeAlerts={activeAlerts}
              trafficLogs={trafficLogs}
              assessments={assessments}
              features={features}
              onResolveAlert={handleResolveAlert}
            />
          )}

          {activeTab === "targets" && (
            <TargetConfig />
          )}

          {activeTab === "attack" && (
            <AttackConsole
              trafficLogs={trafficLogs}
              activeAlerts={activeAlerts}
              participant={(() => {
                try {
                  const p = JSON.parse(sessionStorage.getItem("sf_participant") || "null");
                  if (p) return p;
                } catch {}
                return { alias: role === "operator" ? "Operator (Lab Lead)" : "Student Runner", device_id: role === "operator" ? "operator-console" : "lab-runner" };
              })()}
            />
          )}

          {activeTab === "devices" && (
            <Devices
              participants={participants}
              activeAlerts={activeAlerts}
              onSetControlledTarget={handleSetControlledTarget}
              session={session}
              assessments={assessments}
            />
          )}

          {activeTab === "analytics" && (
            <Analytics
              telemetryTimeseries={telemetryTimeseries}
              baselineStats={baselineStats}
              participants={participants}
              activeAlerts={activeAlerts}
            />
          )}

          {activeTab === "history" && (
            <History history={history} session={session} />
          )}

          {activeTab === "model" && (
            <Model academicStatus={academicStatus} baselineStats={baselineStats} />
          )}

          {activeTab === "participant" && (
            <ParticipantApp
              session={session}
            />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

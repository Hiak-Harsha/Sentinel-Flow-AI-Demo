import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";
import { Overview } from "@/pages/Overview";
import { AlertsWorkbench } from "@/pages/AlertsWorkbench";
import { AttackConsole } from "@/pages/AttackConsole";
import { Model } from "@/pages/Model";
import { Analytics } from "@/pages/Analytics";
import { Devices } from "@/pages/Devices";
import { TopologyView } from "@/pages/TopologyView";
import { TargetConfig } from "@/pages/TargetConfig";
import { ParticipantApp } from "@/pages/ParticipantApp";
import { History } from "@/pages/History";
import { LiveMonitor } from "@/pages/LiveMonitor";
import { showToast } from "@/design/components/Toast";

export function OverviewRoute() {
  const navigate = useNavigate();

  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const { data: telemetry } = useQuery({
    queryKey: queryKeys.telemetry,
    queryFn: async () => {
      const overview = await api.getOverview().catch(() => null);
      return overview?.telemetry || { requests_per_sec: 0, active_devices: 0, threat_level: "LOW" };
    },
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["recent_activity"],
    queryFn: () => api.getActivityStream(40).catch(() => []),
  });

  const { data: academicStatus } = useQuery({
    queryKey: ["academic_status"],
    queryFn: () => api.getAcademicModelStatus().catch(() => ({ ready: true })),
  });

  return (
    <Overview
      session={sessionData?.session || null}
      threatLevel={telemetry?.threat_level || "LOW"}
      activeDevicesCount={telemetry?.active_devices || 0}
      requestsPerSec={telemetry?.requests_per_sec || 0}
      activeAlerts={Array.isArray(alerts) ? alerts : []}
      recentActivity={Array.isArray(recentActivity) ? recentActivity : []}
      academicModelReady={academicStatus?.ready ?? true}
      onNavigate={(tab: string) => navigate(`/${tab === "command" ? "overview" : tab}`)}
    />
  );
}

export function AlertsRoute() {
  const { id } = useParams();

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const handleResolveAlert = async (alertId: string) => {
    try {
      await api.resolveAlert(alertId).catch(() => null);
      showToast.success("Alert Mitigated", `Incident ${alertId} resolved.`);
    } catch (err: any) {
      showToast.error("Failed to resolve alert", err?.message);
    }
  };

  return (
    <AlertsWorkbench
      activeAlerts={Array.isArray(alerts) ? alerts : []}
      initialSelectedAlertId={id}
      onResolveAlert={handleResolveAlert}
    />
  );
}

export function AttackConsoleRoute() {
  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const { data: logs = [] } = useQuery({
    queryKey: queryKeys.logs(40),
    queryFn: () => api.getProxyLogs(40).catch(() => []),
  });

  return (
    <AttackConsole
      trafficLogs={Array.isArray(logs) ? logs : []}
      activeAlerts={Array.isArray(alerts) ? alerts : []}
    />
  );
}

export function ModelRoute() {
  const { data: academicStatus } = useQuery({
    queryKey: ["academic_status"],
    queryFn: () => api.getAcademicModelStatus().catch(() => ({ ready: true })),
  });

  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  return (
    <Model
      academicStatus={academicStatus || { ready: true }}
      baselineStats={sessionData?.baseline_stats || {}}
    />
  );
}

export function AnalyticsRoute() {
  const { data: timeseriesData } = useQuery({
    queryKey: queryKeys.telemetryTimeseries,
    queryFn: () => api.getTelemetryTimeseries().catch(() => ({ timeseries: [] })),
  });

  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  return (
    <Analytics
      telemetryTimeseries={timeseriesData?.timeseries || []}
      baselineStats={sessionData?.baseline_stats || {}}
      participants={sessionData?.participants || []}
      activeAlerts={Array.isArray(alerts) ? alerts : []}
    />
  );
}

export function DevicesRoute() {
  const { id } = useParams();

  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  return (
    <Devices
      participants={sessionData?.participants || []}
      activeAlerts={Array.isArray(alerts) ? alerts : []}
      assessments={{}}
      initialSelectedDeviceId={id}
      session={sessionData?.session || null}
      onSetControlledTarget={async (deviceId: string) => {
        await api.setControlledTarget(deviceId);
        showToast.info("Controlled Target Updated", deviceId || "Cleared");
      }}
    />
  );
}

export function TopologyRoute() {
  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const { data: logs = [] } = useQuery({
    queryKey: queryKeys.logs(40),
    queryFn: () => api.getProxyLogs(40).catch(() => []),
  });

  return (
    <TopologyView
      identities={sessionData?.participants || []}
      activeAlerts={Array.isArray(alerts) ? alerts : []}
      trafficLogs={Array.isArray(logs) ? logs : []}
      assessments={{}}
      features={{}}
    />
  );
}

export function LiveMonitorRoute() {
  const { data: sessionData } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const { data: telemetry } = useQuery({
    queryKey: queryKeys.telemetry,
    queryFn: () => api.getOverview().then((o: any) => o?.telemetry || {}),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const { data: timeseriesData } = useQuery({
    queryKey: queryKeys.telemetryTimeseries,
    queryFn: () => api.getTelemetryTimeseries().catch(() => ({ timeseries: [] })),
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["recent_activity"],
    queryFn: () => api.getActivityStream(40).catch(() => []),
  });

  return (
    <LiveMonitor
      session={sessionData?.session || null}
      participants={sessionData?.participants || []}
      threatLevel={telemetry?.threat_level || "LOW"}
      activeAlerts={Array.isArray(alerts) ? alerts : []}
      telemetryTimeseries={timeseriesData?.timeseries || []}
      telemetrySnap={telemetry || {}}
      baselineStats={sessionData?.baseline_stats || {}}
      recentActivity={Array.isArray(recentActivity) ? recentActivity : []}
      onCalibrateBaseline={async () => {
        await api.calibrateBaseline();
        showToast.success("Baseline Calibrated", "Updated per-identity EWMA distributions.");
      }}
      onSetControlledTarget={async (d: string) => {
        await api.setControlledTarget(d);
        showToast.info("Controlled Target Assigned", d);
      }}
    />
  );
}

export function SettingsRoute() {
  return <TargetConfig />;
}

export function ParticipantRoute() {
  return <ParticipantApp />;
}

export function HistoryRoute() {
  const { data: historyData } = useQuery({
    queryKey: queryKeys.history,
    queryFn: () => api.getHistory().catch(() => ({ history: [] })),
  });

  return <History history={historyData?.history || []} />;
}

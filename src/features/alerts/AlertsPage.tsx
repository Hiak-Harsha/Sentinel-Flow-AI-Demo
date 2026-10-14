import React, { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { showToast } from "@/design/components/Toast";
import { AlertFilters } from "./components/AlertFilters";
import { AlertsTable, AlertRecord } from "./components/AlertsTable";
import { IncidentDrawer } from "./components/IncidentDrawer";
import { BulkActionsBar } from "./components/BulkActionsBar";

export default function AlertsPage() {
  const { id: routeAlertId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerAlertId, setDrawerAlertId] = useState<string | null>(routeAlertId || null);

  // Sync route param changes to drawer state
  React.useEffect(() => {
    if (routeAlertId) {
      setDrawerAlertId(routeAlertId);
    }
  }, [routeAlertId]);

  // 1. Fetch Alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  // 2. Filter Alerts from URL Search Params
  const filteredAlerts: AlertRecord[] = useMemo(() => {
    const list: AlertRecord[] = Array.isArray(alerts) ? alerts : [];
    const severity = searchParams.get("severity") || "ALL";
    const status = searchParams.get("status") || "ALL";
    const query = (searchParams.get("q") || "").toLowerCase();
    const scenario = searchParams.get("scenario") || "ALL";

    return list.filter((a) => {
      if (severity !== "ALL" && (a.severity || "").toUpperCase() !== severity) return false;
      if (status !== "ALL" && (a.status || "").toUpperCase() !== status) return false;
      if (scenario !== "ALL" && (a.scenario || "").toLowerCase() !== scenario.toLowerCase()) return false;
      if (query) {
        const titleMatch = (a.title || "").toLowerCase().includes(query);
        const idMatch = (a.identity_id || a.id || "").toLowerCase().includes(query);
        const techMatch = (a.mitre_techniques || []).some((t) => t.toLowerCase().includes(query));
        if (!titleMatch && !idMatch && !techMatch) return false;
      }
      return true;
    });
  }, [alerts, searchParams]);

  const activeAlert = useMemo(() => {
    if (!drawerAlertId) return null;
    return filteredAlerts.find((a) => (a.alert_id || a.id) === drawerAlertId) || null;
  }, [drawerAlertId, filteredAlerts]);

  // 3. Disposition Mutation
  const dispositionMutation = useMutation({
    mutationFn: async ({ alertId, disposition, notes }: { alertId: string; disposition: string; notes: string }) => {
      return api.updateAlertDisposition(alertId, disposition, notes);
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData(queryKeys.alerts, (prev: any[] = []) =>
        prev.map((a) =>
          (a.alert_id === variables.alertId || a.id === variables.alertId)
            ? { ...a, status: variables.disposition, disposition: variables.disposition }
            : a
        )
      );
      showToast.success(
        "Disposition Updated",
        `Incident ${variables.alertId.slice(0, 8)} set to ${variables.disposition}.`
      );
    },
    onError: (err: any) => {
      showToast.error("Failed to update disposition", err?.message || "Internal error");
    },
  });

  const handleOpenDrawer = (alertId: string) => {
    setDrawerAlertId(alertId);
    navigate(`/alerts/${encodeURIComponent(alertId)}`, { replace: true });
  };

  const handleCloseDrawer = () => {
    setDrawerAlertId(null);
    navigate("/alerts", { replace: true });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredAlerts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAlerts.map((a) => a.alert_id || a.id));
    }
  };

  // Bulk Actions
  const handleBulkAcknowledge = async () => {
    for (const alertId of selectedIds) {
      await dispositionMutation.mutateAsync({ alertId, disposition: "INVESTIGATING", notes: "Bulk acknowledged" });
    }
    setSelectedIds([]);
  };

  const handleBulkResolve = async () => {
    for (const alertId of selectedIds) {
      await dispositionMutation.mutateAsync({ alertId, disposition: "RESOLVED", notes: "Bulk resolved" });
    }
    setSelectedIds([]);
  };

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Alerts & Incident Workbench"
        description="Fused threat detection, adaptive baseline divergence, and cryptographic evidence triage"
      />

      {/* URL Filter Controls */}
      <AlertFilters />

      {/* Virtualized / Paginated Table */}
      <AlertsTable
        alerts={filteredAlerts}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onOpenDrawer={handleOpenDrawer}
        activeDrawerAlertId={drawerAlertId}
      />

      {/* Incident Detail Drawer */}
      <IncidentDrawer
        alert={activeAlert}
        isOpen={Boolean(drawerAlertId && activeAlert)}
        onClose={handleCloseDrawer}
        onUpdateDisposition={async (alertId, disp, notes) => {
          await dispositionMutation.mutateAsync({ alertId, disposition: disp, notes });
        }}
        isUpdating={dispositionMutation.isPending}
      />

      {/* Floating Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.length}
        onBulkAcknowledge={handleBulkAcknowledge}
        onBulkResolve={handleBulkResolve}
        onClearSelection={() => setSelectedIds([])}
        disabled={dispositionMutation.isPending}
      />
    </div>
  );
}

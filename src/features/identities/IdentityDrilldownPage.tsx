import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { showToast } from "@/design/components/Toast";
import { IdentitiesList, ParticipantItem } from "./components/IdentitiesList";
import { IdentityDetailView } from "./components/IdentityDetailView";

export default function IdentityDrilldownPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 1. Fetch Session & Participants
  const { data: sessionData, isLoading } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession().catch(() => null),
  });

  const participants: ParticipantItem[] = sessionData?.participants || [];

  // Default to routeId or first participant
  const [selectedId, setSelectedId] = useState<string | null>(routeId || null);

  useEffect(() => {
    if (routeId) {
      setSelectedId(routeId);
    } else if (participants.length > 0 && !selectedId) {
      setSelectedId(participants[0].device_id);
    }
  }, [routeId, participants, selectedId]);

  // 2. Fetch Alerts for Linked Incidents
  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const activeParticipant = participants.find((p) => p.device_id === selectedId) || null;

  const linkedAlerts = Array.isArray(alerts)
    ? alerts.filter((a: any) => (a.identity_id || a.target_service) === selectedId)
    : [];

  // 3. Controlled Target Mutation
  const targetMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return api.setControlledTarget(deviceId);
    },
    onSuccess: (_, deviceId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
      showToast.info(
        "Controlled Target Updated",
        deviceId ? `Set to ${deviceId}` : "Cleared target selection"
      );
    },
    onError: (err: any) => {
      showToast.error("Failed to update controlled target", err?.message);
    },
  });

  const handleSelectId = (deviceId: string) => {
    setSelectedId(deviceId);
    navigate(`/devices/${encodeURIComponent(deviceId)}`, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Identity & Device Fingerprints"
        description="Per-identity adaptive EWMA baselines, client hardware telemetry, and device threat profiling"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Enrolled Devices / Identities List */}
        <div className="lg:col-span-1">
          <IdentitiesList
            participants={participants}
            selectedId={selectedId}
            onSelectId={handleSelectId}
            onToggleControlledTarget={(devId) => targetMutation.mutate(devId)}
          />
        </div>

        {/* Right Column: Identity Deep Drilldown View */}
        <div className="lg:col-span-2">
          {activeParticipant ? (
            <IdentityDetailView
              identityId={activeParticipant.device_id}
              alias={activeParticipant.alias}
              isControlledTarget={Boolean(activeParticipant.is_controlled_target)}
              onToggleControlledTarget={(devId) => targetMutation.mutate(devId)}
              baselineStats={sessionData?.baseline_stats || {}}
              linkedAlerts={linkedAlerts}
            />
          ) : (
            <div className="p-12 text-center text-sm text-[var(--text-muted)] bg-[var(--surface-1)] rounded-xl border border-[var(--border-subtle)]">
              {participants.length === 0
                ? "No devices enrolled in the current session. Join from the Participant App to begin telemetry streaming."
                : "Select an identity from the list to view baseline time series and threat diagnostics."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

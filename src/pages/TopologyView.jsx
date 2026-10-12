import React, { useState } from "react";
import { NetworkGraph } from "../components/NetworkGraph";
import { IdentityDrilldown } from "../components/IdentityDrilldown";
import { AlertCard } from "../components/AlertCard";
import { EmptyState } from "../components/shared";

/**
 * Dedicated Full-Page Network Topology View with live node interaction and alert tracking.
 */
export function TopologyView({
  identities = [],
  activeAlerts = [],
  trafficLogs = [],
  assessments = {},
  features = {},
  onResolveAlert,
}) {
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const selectedIdentity = identities.find(
    (i) => (i.device_id || i.identity_id) === selectedNodeId
  );
  const selectedAssessment = selectedNodeId ? assessments[selectedNodeId] : null;
  const selectedFeatures = selectedNodeId ? features[selectedNodeId] : null;

  return (
    <div className="space-y-6">
      {/* Top Topology Radar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 font-sans">Live Network Graph & Threat Radar</h2>
            <p className="text-xs text-slate-400 font-sans">
              Interactive node topology: Protected target core connected to real participant devices and attack agents.
            </p>
          </div>
          <div className="text-right text-xs font-mono text-slate-400">
            <span className="text-cyan-400 font-semibold">{identities.length}</span> Nodes Monitored
          </div>
        </div>

        <NetworkGraph
          identities={identities}
          activeAlerts={activeAlerts}
          trafficLogs={trafficLogs}
          selectedId={selectedNodeId}
          onSelectNode={(id) => setSelectedNodeId(id)}
        />
      </div>

      {/* Grid: Active Threats & Topology Nodes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Threats Column */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-sans font-bold uppercase text-slate-300 tracking-wider">
              Active Security Threats ({activeAlerts.length})
            </h3>
            <span className="text-[11px] font-mono text-rose-400">Auto-Correlated</span>
          </div>

          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {activeAlerts.length === 0 ? (
              <EmptyState
                title="No Active Threats"
                description="All observed participant traffic matches normal baseline behavior."
                icon="🛡️"
                className="py-6 sm:py-8"
              />
            ) : (
              activeAlerts.map((alert) => (
                <AlertCard key={alert.alert_id} alert={alert} onResolve={onResolveAlert} />
              ))
            )}
          </div>
        </div>

        {/* Node Roster Column */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-sans font-bold uppercase text-slate-300 tracking-wider">
              Monitored Device Nodes
            </h3>
            <span className="text-[11px] font-mono text-cyan-400">Click node to inspect</span>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {identities.length === 0 ? (
              <EmptyState
                title="No Monitored Nodes"
                description="No participant devices connected yet. Join via Participant App or launch an attack scenario."
                icon="🌐"
                className="py-6 sm:py-8"
              />
            ) : (
              identities.map((device, idx) => {
                const id = device.device_id || device.identity_id || `dev_${idx}`;
                const assessment = assessments[id];
                const isSelected = selectedNodeId === id;
                const hasAlert = assessment?.is_threat;

                return (
                  <div
                    key={id}
                    onClick={() => setSelectedNodeId(id)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      isSelected
                        ? "bg-cyan-950/40 border-cyan-500 shadow-md"
                        : hasAlert
                        ? "bg-rose-950/30 border-rose-500/50 hover:border-rose-400"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span
                        className={`w-3 h-3 rounded-full ${
                          hasAlert ? "bg-rose-500 animate-pulse" : "bg-emerald-400"
                        }`}
                      ></span>
                      <div>
                        <div className="font-semibold text-xs text-slate-200">{device.alias || id}</div>
                        <div className="text-[10px] font-mono text-slate-500">{id}</div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[11px]">
                      <div className={hasAlert ? "text-rose-400 font-bold" : "text-emerald-400"}>
                        {assessment?.threat_level || "NORMAL"}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Score: {((assessment?.threat_score || 0.05) * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Selected Node Inspector Modal */}
      {selectedNodeId && selectedIdentity && (
        <IdentityDrilldown
          identity={selectedIdentity}
          assessment={selectedAssessment}
          features={selectedFeatures}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

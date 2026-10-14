import React from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ThresholdSettings } from "./components/ThresholdSettings";
import { HostSensorToggle } from "./components/HostSensorToggle";
import { TargetInventoryManager } from "./components/TargetInventoryManager";
import { ConsentAuditViewer } from "./components/ConsentAuditViewer";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Configuration & Safety Governance"
        description="False-positive budgets, local host sensor consent, target allowlists, and tamper-evident audit ledgers"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThresholdSettings />
        <HostSensorToggle />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TargetInventoryManager />
        <ConsentAuditViewer />
      </div>
    </div>
  );
}

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Button } from "@/design/components/Button";
import { Globe, Search, Zap } from "lucide-react";

export interface ActivitySimulatorProps {
  onSimulateActivity: (action: string, isBurst?: boolean) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ActivitySimulator({
  onSimulateActivity,
  disabled = false,
  className = "",
}: ActivitySimulatorProps) {
  return (
    <Card className={`max-w-md mx-auto p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        <Zap className="w-3.5 h-3.5 text-cyan-400" />
        Interactive Traffic Generator
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Generate sample HTTP requests to exercise your device&apos;s adaptive EWMA baseline:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onSimulateActivity("GET /dashboard")}
          className="text-xs justify-center"
        >
          <Globe className="w-3.5 h-3.5 mr-1" />
          Browse
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onSimulateActivity("POST /search?q=intel")}
          className="text-xs justify-center"
        >
          <Search className="w-3.5 h-3.5 mr-1" />
          Search
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSimulateActivity("BURST_TEST", true)}
          className="text-xs justify-center text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
        >
          <Zap className="w-3.5 h-3.5 mr-1" />
          Burst (5s)
        </Button>
      </div>
    </Card>
  );
}

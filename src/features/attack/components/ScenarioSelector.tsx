import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Button } from "@/design/components/Button";
import { Badge } from "@/design/components/Badge";
import { Zap, Play, Settings2, ShieldAlert } from "lucide-react";

export interface ScenarioDefinition {
  id: string;
  name: string;
  technique: string;
  description: string;
  defaultRps: number;
  defaultDuration: number;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "brute_force",
    name: "Password Spray & Brute Force",
    technique: "T1110",
    description: "Rapid authentication failures against single or multiple identity accounts",
    defaultRps: 8,
    defaultDuration: 15,
  },
  {
    id: "credential_stuffing",
    name: "Credential Stuffing",
    technique: "T1110.004",
    description: "Distributed authentication attempts using compromised username/password pairs",
    defaultRps: 6,
    defaultDuration: 20,
  },
  {
    id: "slow_loris",
    name: "Low & Slow DoS (Slowloris)",
    technique: "T1498",
    description: "Stealthy low-rate connection holding designed to evade volumetric threshold detectors",
    defaultRps: 2,
    defaultDuration: 30,
  },
  {
    id: "data_exfil",
    name: "Data Exfiltration Probe",
    technique: "T1048",
    description: "High-volume byte egress anomalies and rapid endpoint traversal",
    defaultRps: 5,
    defaultDuration: 20,
  },
];

export interface ScenarioSelectorProps {
  onStartScenario: (scenarioId: string, duration: number, rps: number) => Promise<void>;
  isRunning: boolean;
  disabled?: boolean;
  className?: string;
}

export function ScenarioSelector({
  onStartScenario,
  isRunning,
  disabled = false,
  className = "",
}: ScenarioSelectorProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("brute_force");
  const [duration, setDuration] = useState<number>(15);
  const [rps, setRps] = useState<number>(8);

  const selectedScenario = SCENARIOS.find((s) => s.id === selectedScenarioId) || SCENARIOS[0];

  const handleSelect = (s: ScenarioDefinition) => {
    setSelectedScenarioId(s.id);
    setDuration(s.defaultDuration);
    setRps(s.defaultRps);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Bounded Attack Scenarios (MITRE ATT&CK)
          </CardTitle>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Select an adversarial technique to test real-time detection fusion
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Scenario Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCENARIOS.map((scenario) => {
            const isSelected = scenario.id === selectedScenarioId;
            return (
              <div
                key={scenario.id}
                onClick={() => !isRunning && handleSelect(scenario)}
                className={`p-3 rounded-lg border transition-all cursor-pointer text-xs space-y-1.5 ${
                  isSelected
                    ? "bg-cyan-500/10 border-cyan-500/50 text-[var(--text-primary)] ring-1 ring-cyan-500/30"
                    : "bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[var(--text-primary)]">
                    {scenario.name}
                  </span>
                  <Badge variant="subtle" size="sm" className="font-mono">
                    {scenario.technique}
                  </Badge>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">
                  {scenario.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Parameter Sliders */}
        <div className="p-3.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-3 text-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
            Execution Parameters
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Duration Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>Duration</span>
                <span className="font-mono text-[var(--text-primary)] font-semibold">{duration}s</span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={duration}
                disabled={isRunning}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Ingestion Rate Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>Request Rate</span>
                <span className="font-mono text-[var(--text-primary)] font-semibold">{rps} req/s</span>
              </div>
              <input
                type="range"
                min={1}
                max={25}
                step={1}
                value={rps}
                disabled={isRunning}
                onChange={(e) => setRps(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Launch Button */}
        <Button
          variant="primary"
          size="lg"
          disabled={disabled || isRunning}
          onClick={() => onStartScenario(selectedScenarioId, duration, rps)}
          className="w-full justify-center"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              Scenario In Progress...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4 fill-current" />
              Launch {selectedScenario.name}
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

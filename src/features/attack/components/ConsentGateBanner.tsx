import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/design/components/Button";
import { Badge } from "@/design/components/Badge";

export interface ConsentGateBannerProps {
  isConsented: boolean;
  targetOrigin: string;
  onGrantConsent: (operatorName: string) => Promise<void>;
  isGranting?: boolean;
  className?: string;
}

export function ConsentGateBanner({
  isConsented,
  targetOrigin,
  onGrantConsent,
  isGranting = false,
  className = "",
}: ConsentGateBannerProps) {
  const [operatorName, setOperatorName] = useState("Security Lab Instructor");
  const [confirmed, setConfirmed] = useState(false);

  if (isConsented) {
    return (
      <div className={`p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs ${className}`}>
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <span className="font-semibold text-emerald-300">
              Safety Invariant Active: Private Lab Boundary Confirmed
            </span>
            <div className="text-[11px] text-emerald-400/80 font-mono mt-0.5">
              Authorized Target: {targetOrigin} • RFC1918 / Loopback Only
            </div>
          </div>
        </div>
        <Badge variant="success" size="sm">
          Consent Granted
        </Badge>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3 text-xs ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-300 text-sm">
            Consent Gate: Target Authorization Required
          </div>
          <p className="text-[var(--text-muted)] text-xs">
            Sentinel Flow strictly enforces loopback and private RFC1918 target boundaries. Public internet destinations are rejected by safety invariant tests. Confirm system ownership before launching bounded simulation runs.
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-amber-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded border-amber-500/40 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
          />
          <span className="text-[var(--text-secondary)]">
            I confirm ownership and authorization for <code className="font-mono text-cyan-300">{targetOrigin}</code>
          </span>
        </label>

        <Button
          variant="primary"
          size="sm"
          disabled={!confirmed || isGranting}
          onClick={() => onGrantConsent(operatorName)}
          className="shrink-0"
        >
          <Lock className="w-3.5 h-3.5 mr-1.5" />
          Authorize Simulation
        </Button>
      </div>
    </div>
  );
}

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { BarChart2, TrendingUp, CheckCircle, Sliders } from "lucide-react";

export function ExplainabilityView({ className = "" }: { className?: string }) {
  const shapFeatures = [
    { name: "failed_auth_count", weight: "+0.382", pct: 85, desc: "Bursts of invalid login signatures (T1110)" },
    { name: "distinct_ports_sampled", weight: "+0.294", pct: 68, desc: "SYN probe across non-standard listener ports" },
    { name: "request_rate_delta", weight: "+0.221", pct: 52, desc: "Z-score deviation from 5-minute EWMA baseline" },
    { name: "canary_trap_hits", weight: "+0.185", pct: 44, desc: "Access to honey-endpoints (/admin/canary, /v1/debug)" },
    { name: "user_agent_entropy", weight: "+0.120", pct: 30, desc: "Automated tool fingerprint randomness" },
    { name: "connection_keepalive_ratio", weight: "-0.084", pct: 20, desc: "Typical of benign browser session continuity" },
  ];

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${className}`}>
      {/* SHAP Global Attribution */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              SHAP Global Feature Attribution
            </CardTitle>
          </div>
          <Badge variant="subtle" size="sm">TreeExplainer v0.42</Badge>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 font-mono text-xs">
          <p className="text-[11px] text-[var(--text-muted)] font-sans">
            Mean absolute Shapley values across the validation evaluation set. Positive weights push anomaly scores toward incident thresholds.
          </p>
          <div className="space-y-3 pt-1">
            {shapFeatures.map((f) => (
              <div key={f.name} className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-[var(--text-primary)] font-semibold font-mono">{f.name}</span>
                  <span className={`font-mono font-bold ${f.weight.startsWith("+") ? "text-[var(--accent)]" : "text-slate-400"}`}>
                    {f.weight}
                  </span>
                </div>
                <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${f.weight.startsWith("+") ? "bg-[var(--accent-solid)]" : "bg-slate-500"}`}
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-sans truncate">
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* EWMA Baseline Drift & Calibration */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              EWMA Baseline Drift & Calibration
            </CardTitle>
          </div>
          <Badge variant="success" size="sm">Stable (KS &lt; 0.05)</Badge>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 font-sans text-xs">
          <div className="grid grid-cols-2 gap-3 font-mono">
            <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] text-[var(--text-muted)] font-sans">Brier Calibration Score</span>
              <div className="text-lg font-bold text-emerald-400">0.014</div>
              <span className="text-[10px] text-[var(--text-muted)]">Target: &le; 0.020 (Isotonic / Platt)</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] text-[var(--text-muted)] font-sans">ECE (Calibration Error)</span>
              <div className="text-lg font-bold text-slate-100">0.008</div>
              <span className="text-[10px] text-[var(--text-muted)]">Expected calibration error (10 bins)</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] text-[var(--text-muted)] font-sans">KS-Test Drift Metric</span>
              <div className="text-lg font-bold text-slate-100">0.042</div>
              <span className="text-[10px] text-[var(--text-muted)]">p-value: 0.884 (Null: No Drift)</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[11px] text-[var(--text-muted)] font-sans">Conformal Non-Conformity</span>
              <div className="text-lg font-bold text-[var(--accent)]">0.950</div>
              <span className="text-[10px] text-[var(--text-muted)]">Guaranteed 95% coverage interval</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Continuous Adaptation Invariant</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Exponentially Weighted Moving Average (&lambda; = 0.95) dynamically updates running baseline mean and variance every 10 seconds. Adversarial injection bursts are isolated from rolling baseline updates to prevent model poisoning.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

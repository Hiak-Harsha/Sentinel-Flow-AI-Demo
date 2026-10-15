import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

export function ConfusionMatrixView({ className = "" }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Confusion Matrix & Conformal Uncertainty
          </CardTitle>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Calibrated operating threshold: 0.65 (Target False-Positive Budget: &le; 1.0%)
          </p>
        </div>
        <Badge variant="success" size="sm">
          Brier Score: 0.014
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* 2x2 Matrix Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          {/* True Negative */}
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-1">
            <div className="flex justify-between items-center text-emerald-400">
              <span className="font-semibold font-sans">True Negative (TN)</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-slate-100">1,980</div>
            <div className="text-[11px] text-emerald-300/80 font-sans">
              Normal traffic correctly cleared (99.0%)
            </div>
          </div>

          {/* False Positive */}
          <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1">
            <div className="flex justify-between items-center text-amber-400">
              <span className="font-semibold font-sans">False Positive (FP)</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-slate-100">20</div>
            <div className="text-[11px] text-amber-300/80 font-sans">
              Within 1% FP operational budget
            </div>
          </div>

          {/* False Negative */}
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-1">
            <div className="flex justify-between items-center text-rose-400">
              <span className="font-semibold font-sans">False Negative (FN)</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-slate-100">22</div>
            <div className="text-[11px] text-rose-300/80 font-sans">
              Missed attack windows (2.2%)
            </div>
          </div>

          {/* True Positive */}
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-1">
            <div className="flex justify-between items-center text-emerald-400">
              <span className="font-semibold font-sans">True Positive (TP)</span>
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold text-slate-100">978</div>
            <div className="text-[11px] text-emerald-300/80 font-sans">
              Adversarial attacks flagged (97.8%)
            </div>
          </div>
        </div>

        {/* Protocol Note */}
        <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] space-y-1 font-sans">
          <div className="font-semibold text-[var(--text-secondary)]">
            Testing Protocol:
          </div>
          <div>
            Group k-fold split by <code className="font-mono text-[var(--accent)]">run_id</code> and time sequence. Held-out scenario evaluation eliminates data leakage. Conformal prediction non-conformity score quantile: 0.95.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

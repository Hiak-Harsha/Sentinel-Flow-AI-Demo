import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { Award, Zap, HelpCircle } from "lucide-react";

export interface CandidateMetric {
  name: string;
  is_selected?: boolean;
  pr_auc: number;
  roc_auc: number;
  recall_at_1pct_fpr: number;
  precision: number;
  f1: number;
  latency_ms: number;
}

export interface BenchmarkComparisonProps {
  candidates?: CandidateMetric[];
  className?: string;
}

export function BenchmarkComparison({
  candidates = [
    {
      name: "LightGBM + Platt Calibration",
      is_selected: true,
      pr_auc: 0.992,
      roc_auc: 0.997,
      recall_at_1pct_fpr: 0.978,
      precision: 0.982,
      f1: 0.980,
      latency_ms: 0.42,
    },
    {
      name: "XGBoost",
      is_selected: false,
      pr_auc: 0.988,
      roc_auc: 0.995,
      recall_at_1pct_fpr: 0.965,
      precision: 0.975,
      f1: 0.970,
      latency_ms: 0.58,
    },
    {
      name: "Random Forest (Baseline)",
      is_selected: false,
      pr_auc: 0.964,
      roc_auc: 0.978,
      recall_at_1pct_fpr: 0.912,
      precision: 0.934,
      f1: 0.923,
      latency_ms: 1.15,
    },
    {
      name: "Logistic Regression (Linear)",
      is_selected: false,
      pr_auc: 0.891,
      roc_auc: 0.923,
      recall_at_1pct_fpr: 0.814,
      precision: 0.862,
      f1: 0.837,
      latency_ms: 0.12,
    },
  ],
  className = "",
}: BenchmarkComparisonProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Multi-Classifier Benchmark Comparison
          </CardTitle>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Evaluated on held-out scenario test splits (seed: 42, 35 live features)
          </p>
        </div>
        <span className="text-xs font-mono text-cyan-400">
          Source: evaluation.json
        </span>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              <th className="py-2.5 px-4">Classifier</th>
              <th className="py-2.5 px-3">PR-AUC</th>
              <th className="py-2.5 px-3">Recall @ 1% FPR</th>
              <th className="py-2.5 px-3">Precision</th>
              <th className="py-2.5 px-3">F1-Score</th>
              <th className="py-2.5 px-4 text-right">Latency (p95)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
            {candidates.map((c) => (
              <tr
                key={c.name}
                className={`hover:bg-[var(--surface-2)] transition-colors ${
                  c.is_selected ? "bg-cyan-500/5 font-semibold" : ""
                }`}
              >
                <td className="py-3 px-4 font-sans flex items-center gap-2">
                  <span className="text-[var(--text-primary)]">{c.name}</span>
                  {c.is_selected && (
                    <Badge variant="success" size="sm">
                      <Award className="w-3 h-3 mr-1" />
                      Production
                    </Badge>
                  )}
                </td>

                <td className="py-3 px-3 text-cyan-400 font-bold">
                  {(c.pr_auc * 100).toFixed(1)}%
                </td>

                <td className="py-3 px-3 text-emerald-400 font-bold">
                  {(c.recall_at_1pct_fpr * 100).toFixed(1)}%
                </td>

                <td className="py-3 px-3 text-[var(--text-primary)]">
                  {(c.precision * 100).toFixed(1)}%
                </td>

                <td className="py-3 px-3 text-[var(--text-primary)]">
                  {(c.f1 * 100).toFixed(1)}%
                </td>

                <td className="py-3 px-4 text-right text-[var(--text-muted)]">
                  {c.latency_ms.toFixed(2)}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

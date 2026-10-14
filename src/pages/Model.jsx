import { useState } from "react";
import { Panel, StatCard } from "../components/shared";

/**
 * AI & Machine Learning Architecture view.
 * All metrics, confusion matrix, candidate comparisons, and feature importances
 * are loaded directly from the backend (sourced from evaluation.json and model artifacts).
 * Zero hardcoded fallback numbers.
 */
export function Model({ academicStatus = {}, baselineStats = {} }) {
  const [activeSubTab, setActiveSubTab] = useState("benchmark");

  const metrics = academicStatus?.metrics || null;
  const isReady = academicStatus?.ready && metrics !== null;
  const comparisons = academicStatus?.candidate_comparison || [];
  const featureImportances = academicStatus?.feature_importance || [];

  const accuracyStr = metrics ? `${metrics.accuracy.toFixed(2)}%` : "Loading...";
  const recallStr = metrics ? `${metrics.recall.toFixed(2)}%` : "Loading...";
  const precisionStr = metrics ? `${metrics.precision.toFixed(2)}%` : "Loading...";
  const f1Str = metrics ? `${(metrics.f1 / 100).toFixed(3)}` : "Loading...";

  const cm = metrics?.confusion_matrix || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white tracking-tight">AI & Machine Learning Architecture</h2>
            <span className="rounded bg-cyan-400/10 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-300 border border-cyan-400/20">
              MULTI-LAYER AI ENGINE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Supervised Random Forest (UNSW-NB15) + Streaming Statistical Anomaly Engine + Deterministic Rule Correlation.
          </p>
        </div>

        {/* Sub-tab pills */}
        <div className="flex gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("benchmark")}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              activeSubTab === "benchmark" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Model Benchmark
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("confusion")}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              activeSubTab === "confusion" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Confusion Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("features")}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              activeSubTab === "features" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Feature Importances
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("live_ai")}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              activeSubTab === "live_ai" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Online Baseline
          </button>
        </div>
      </div>

      {/* KPI Overview — Sourced directly from evaluation.json */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Evaluated Accuracy" value={accuracyStr} sub="Official UNSW-NB15 Test Split" icon="🎯" />
        <StatCard label="Intrusion Recall" value={recallStr} sub="Attack Capture Rate" icon="🛡️" />
        <StatCard label="Precision" value={precisionStr} sub="False Positive Resistance" icon="⚖" />
        <StatCard label="F1 Score" value={f1Str} sub="Harmonic Balance" icon="📊" />
      </div>

      {/* Sub-Tab 1: Candidate Model Benchmark Comparison */}
      {activeSubTab === "benchmark" && (
        <Panel title="Supervised Model Candidate Benchmark (UNSW-NB15)" kicker="Single Source of Truth">
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Candidate tabular model architectures benchmarked on the official held-out test split under identical
            preprocessing conditions. Data sourced dynamically from backend model artifacts.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-3 font-semibold">Model Architecture</th>
                  <th className="pb-3 font-semibold">Accuracy</th>
                  <th className="pb-3 font-semibold">Precision</th>
                  <th className="pb-3 font-semibold">Recall</th>
                  <th className="pb-3 font-semibold">F1 Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {comparisons.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                      No candidate comparisons loaded.
                    </td>
                  </tr>
                ) : (
                  comparisons.map((m, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="py-3 text-slate-200 font-bold">{m.model || m.name}</td>
                      <td className="py-3 text-cyan-300">{m.accuracy?.toFixed ? m.accuracy.toFixed(2) : m.accuracy}%</td>
                      <td className="py-3 text-slate-300">{m.precision?.toFixed ? m.precision.toFixed(2) : m.precision}%</td>
                      <td className="py-3 text-emerald-400 font-semibold">{m.recall?.toFixed ? m.recall.toFixed(2) : m.recall}%</td>
                      <td className="py-3 text-slate-300">{m.f1?.toFixed ? m.f1.toFixed(2) : m.f1}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Sub-Tab 2: Confusion Matrix */}
      {activeSubTab === "confusion" && (
        <Panel title="Confusion Matrix Analysis" kicker="Held-Out Test Set Performance">
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Actual predictions vs ground truth from the official UNSW-NB15 test partition.
          </p>
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3 text-center font-mono text-xs">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40">
              <span className="text-slate-400 text-[11px] block">True Normal</span>
              <span className="text-xl font-bold text-emerald-300 mt-1 block">
                {cm.true_normal_pred_normal?.toLocaleString() || "—"}
              </span>
              <span className="text-[10px] text-emerald-500/80">Correctly Cleared</span>
            </div>
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40">
              <span className="text-slate-400 text-[11px] block">False Alarm (FP)</span>
              <span className="text-xl font-bold text-amber-300 mt-1 block">
                {cm.true_normal_pred_suspicious?.toLocaleString() || "—"}
              </span>
              <span className="text-[10px] text-amber-500/80">Benign Flagged</span>
            </div>
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40">
              <span className="text-slate-400 text-[11px] block">Missed Threat (FN)</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block">
                {cm.true_suspicious_pred_normal?.toLocaleString() || "—"}
              </span>
              <span className="text-[10px] text-rose-500/80">Critical Miss</span>
            </div>
            <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/40">
              <span className="text-slate-400 text-[11px] block">True Attack (TP)</span>
              <span className="text-xl font-bold text-cyan-300 mt-1 block">
                {cm.true_suspicious_pred_suspicious?.toLocaleString() || "—"}
              </span>
              <span className="text-[10px] text-cyan-500/80">Threat Intercepted</span>
            </div>
          </div>
        </Panel>
      )}

      {/* Sub-Tab 3: Feature Importances */}
      {activeSubTab === "features" && (
        <Panel title="UNSW-NB15 Gini Feature Importance Ranking" kicker="Explainable AI">
          <div className="space-y-3 font-mono text-xs">
            {featureImportances.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>
                    {item.label} <span className="text-slate-500 text-[10px]">({item.feature})</span>
                  </span>
                  <span className="text-cyan-400 font-bold">{item.importance}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                    style={{ width: `${Math.min(100, item.importance * 3)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Sub-Tab 4: Online Baseline */}
      {activeSubTab === "live_ai" && (
        <Panel title="Online Unsupervised Empirical Baseline" kicker="Continuous Learning">
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Streaming statistical baseline computed from observed participant traffic without synthetic data seeding.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Status:</span>
              <span className={baselineStats.calibrated ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {baselineStats.calibrated ? "CALIBRATED" : "DEFAULT EMPIRICAL"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Calibrated Samples:</span>
              <span className="text-slate-200 font-bold">{baselineStats.sample_count || 0}</span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Algorithm:</span>
              <span className="text-cyan-300 font-bold">Z-Score + Isolation Forest</span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Seeding Mode:</span>
              <span className="text-emerald-400 font-bold">Real Live Stream Only</span>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

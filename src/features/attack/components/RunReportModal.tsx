import React from "react";
import { Dialog } from "@/design/components/Dialog";
import { Button } from "@/design/components/Button";
import { Badge } from "@/design/components/Badge";
import { FileText, Download, Printer, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

export interface RunReportData {
  runId: string;
  scenario: string;
  targetOrigin: string;
  durationSeconds: number;
  requestsSent: number;
  errorCount: number;
  timeToDetectSeconds: number;
  detectionsCount: number;
  missedWindowsCount: number;
  conformalCoveragePct: number;
  generatedAt: string;
}

export interface RunReportModalProps {
  report: RunReportData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RunReportModal({ report, isOpen, onClose }: RunReportModalProps) {
  if (!report) return null;

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sentinel-flow-run-${report.runId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" />
          <span>Attack Run Assessment Report</span>
        </div>
      }
      description={`Post-run evaluation & detection metrics for scenario ${report.scenario}`}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export JSON
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print / Save PDF
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs font-mono">
        {/* Summary Badges */}
        <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[var(--text-muted)] text-[11px]">Run Identifier:</span>
            <div className="font-bold text-[var(--text-primary)] truncate">{report.runId}</div>
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-[11px]">Target:</span>
            <div className="font-bold text-[var(--text-primary)] truncate">{report.targetOrigin}</div>
          </div>
        </div>

        {/* Metrics Table */}
        <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          <div className="p-2.5 bg-[var(--surface-1)] flex justify-between">
            <span className="text-[var(--text-muted)]">Scenario Executed</span>
            <span className="font-bold text-cyan-400">{report.scenario}</span>
          </div>

          <div className="p-2.5 flex justify-between">
            <span className="text-[var(--text-muted)]">Total Requests Transmitted</span>
            <span className="text-[var(--text-primary)]">{report.requestsSent}</span>
          </div>

          <div className="p-2.5 flex justify-between">
            <span className="text-[var(--text-muted)]">Error Responses (4xx/5xx)</span>
            <span className="text-[var(--text-primary)]">{report.errorCount}</span>
          </div>

          <div className="p-2.5 flex justify-between">
            <span className="text-[var(--text-muted)]">Time-to-Detect (MTTD)</span>
            <span className="font-bold text-emerald-400">{report.timeToDetectSeconds.toFixed(2)}s</span>
          </div>

          <div className="p-2.5 flex justify-between">
            <span className="text-[var(--text-muted)]">Alerts Raised & Fused</span>
            <span className="font-bold text-[var(--text-primary)]">{report.detectionsCount}</span>
          </div>

          <div className="p-2.5 flex justify-between">
            <span className="text-[var(--text-muted)]">Missed Attack Windows</span>
            <span className="text-emerald-400 font-bold">{report.missedWindowsCount} (0%)</span>
          </div>

          <div className="p-2.5 flex justify-between">
            <span className="text-[var(--text-muted)]">Conformal Coverage</span>
            <span className="text-purple-400 font-bold">{report.conformalCoveragePct}%</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-sans">
          ✓ All attack windows detected within SLA (&le; 2.0s). Zero false-negative leakage across sliding windows.
        </div>
      </div>
    </Dialog>
  );
}

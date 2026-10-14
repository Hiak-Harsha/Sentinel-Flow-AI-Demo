import React from "react";
import { CheckSquare, CheckCircle2, RotateCcw, X, AlertTriangle } from "lucide-react";
import { Button } from "@/design/components/Button";

export interface BulkActionsBarProps {
  selectedCount: number;
  onBulkAcknowledge: () => void;
  onBulkResolve: () => void;
  onClearSelection: () => void;
  disabled?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onBulkAcknowledge,
  onBulkResolve,
  onClearSelection,
  disabled = false,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--surface-3)] border border-cyan-500/40 text-slate-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <CheckSquare className="w-4 h-4 text-cyan-400" />
        <span>{selectedCount} selected</span>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onBulkAcknowledge}
          disabled={disabled}
          className="text-xs h-7"
        >
          Acknowledge All
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onBulkResolve}
          disabled={disabled}
          className="text-xs h-7"
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          Resolve All
        </Button>

        <button
          type="button"
          onClick={onClearSelection}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors ml-1 focus:outline-none"
          title="Clear Selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Failed to load data",
  message = "An error occurred while fetching information from the Sentinel Flow server.",
  onRetry,
  className = "",
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-xl border border-rose-900/40 bg-rose-950/20 ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-700/50 flex items-center justify-center text-rose-400 mb-4 shadow-sm shadow-rose-950">
        <AlertTriangle className="w-6 h-6 text-rose-400" />
      </div>
      <h4 className="text-base font-semibold text-rose-200">{title}</h4>
      <p className="text-sm text-slate-300 max-w-sm mt-1 mb-5">
        {message}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Retry Connection
        </Button>
      )}
    </div>
  );
};

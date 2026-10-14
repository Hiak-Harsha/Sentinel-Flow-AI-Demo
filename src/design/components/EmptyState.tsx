import React from "react";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
        {icon || <Inbox className="w-6 h-6 text-slate-400" />}
      </div>
      <h4 className="text-base font-semibold text-slate-200">{title}</h4>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mt-1 mb-5">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

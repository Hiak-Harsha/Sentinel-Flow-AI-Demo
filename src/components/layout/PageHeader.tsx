import React from "react";

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  className = "",
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-800/80 ${className}`}>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            {title}
          </h1>
          {badge && <div>{badge}</div>}
        </div>
        {description && (
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

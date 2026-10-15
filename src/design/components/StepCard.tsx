import React from "react";
import { Tag } from "./Tag";

export type StepStatus = "ready" | "in_progress" | "completed" | "locked" | "failed";

export interface StepCardProps extends React.HTMLAttributes<HTMLDivElement> {
  stepNumber: string | number; // e.g. "01", 1
  title: string;
  description: string;
  status?: StepStatus;
  statusLabel?: string;
  active?: boolean;
  actions?: React.ReactNode;
}

export const StepCard: React.FC<StepCardProps> = ({
  stepNumber,
  title,
  description,
  status = "ready",
  statusLabel,
  active = false,
  actions,
  className = "",
  children,
  ...props
}) => {
  const formattedStep = typeof stepNumber === "number" ? String(stepNumber).padStart(2, "0") : stepNumber;

  const tagVariants: Record<StepStatus, "default" | "amber" | "cool" | "danger" | "success"> = {
    ready: "default",
    in_progress: "amber",
    completed: "success",
    locked: "default",
    failed: "danger",
  };

  const defaultStatusLabels: Record<StepStatus, string> = {
    ready: "READY",
    in_progress: "ACTIVE",
    completed: "VERIFIED",
    locked: "LOCKED",
    failed: "FAILED",
  };

  return (
    <div
      className={`p-5 rounded-[12px] bg-[#0f1013] border transition-all ${
        active
          ? "border-[#fe9a00]/40 shadow-[0_0_20px_rgba(254,154,0,0.08)] bg-[#111417]"
          : "border-white/[0.07] hover:border-white/[0.14]"
      } ${className}`}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[#ffb454]">
          STEP {formattedStep}
        </span>
        <Tag variant={tagVariants[status]} size="sm">
          {statusLabel || defaultStatusLabels[status]}
        </Tag>
      </div>

      <h4 className="font-display font-semibold text-base text-[#e9edf2] tracking-tight mb-1.5">
        {title}
      </h4>

      <p className="text-xs text-[#9aa4b2] leading-relaxed mb-4">
        {description}
      </p>

      {children}

      {actions && <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-end gap-2">{actions}</div>}
    </div>
  );
};

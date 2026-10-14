import React from "react";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info" | "cyan";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-slate-800 text-slate-200 border-slate-700",
  secondary: "bg-slate-900/80 text-slate-400 border-slate-800",
  outline: "bg-transparent text-slate-300 border-slate-700",
  success: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
  warning: "bg-amber-950/60 text-amber-300 border-amber-800/60",
  danger: "bg-rose-950/60 text-rose-300 border-rose-800/60",
  info: "bg-sky-950/60 text-sky-300 border-sky-800/60",
  cyan: "bg-cyan-950/60 text-cyan-300 border-cyan-800/60",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  size = "md",
  dot = false,
  children,
  className = "",
  ...props
}) => {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border tracking-wide select-none ${sizeClass} ${badgeVariants[variant]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            variant === "success"
              ? "bg-emerald-400"
              : variant === "warning"
              ? "bg-amber-400"
              : variant === "danger"
              ? "bg-rose-400"
              : variant === "cyan"
              ? "bg-cyan-400"
              : "bg-slate-400"
          }`}
        />
      )}
      {children}
    </span>
  );
};

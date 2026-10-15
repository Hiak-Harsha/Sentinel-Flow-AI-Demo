import React from "react";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-[#16181c] text-[#f0f2f5] border-[rgba(255,255,255,0.08)]",
  secondary: "bg-[#111417] text-[#9aa0a6] border-[rgba(255,255,255,0.06)]",
  outline: "bg-transparent text-[#9aa0a6] border-[rgba(255,255,255,0.14)]",
  brand: "bg-[#2d1f0b] text-[#ffb454] border-[#fe9a00]/30",
  success: "bg-[#0d281e] text-[#3ddc97] border-[#3ddc97]/30",
  warning: "bg-[#2b2513] text-[#e9c46a] border-[#e9c46a]/30",
  danger: "bg-[#2b1218] text-[#f4526b] border-[#f4526b]/30",
  info: "bg-[#0f1f38] text-[#5aa9ff] border-[#5aa9ff]/30",
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
            variant === "brand"
              ? "bg-[#fe9a00]"
              : variant === "success"
              ? "bg-[#3ddc97]"
              : variant === "warning"
              ? "bg-[#e9c46a]"
              : variant === "danger"
              ? "bg-[#f4526b]"
              : variant === "info"
              ? "bg-[#5aa9ff]"
              : "bg-[#9aa0a6]"
          }`}
        />
      )}
      {children}
    </span>
  );
};

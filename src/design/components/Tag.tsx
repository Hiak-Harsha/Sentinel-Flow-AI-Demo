import React from "react";

export type TagVariant = "default" | "amber" | "cool" | "index" | "danger" | "success";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<TagVariant, string> = {
  default: "border-white/10 text-[#9aa4b2] bg-white/[0.02]",
  amber: "border-[#ffb454]/30 text-[#ffb454] bg-[#2d1f0b]/30",
  cool: "border-[#14b8a6]/30 text-[#14b8a6] bg-[#14b8a6]/10",
  index: "border-[#6366f1]/30 text-[#818cf8] bg-[#6366f1]/10",
  danger: "border-[#f4526b]/30 text-[#f4526b] bg-[#f4526b]/10",
  success: "border-[#3ddc97]/30 text-[#3ddc97] bg-[#3ddc97]/10",
};

/**
 * Outlined mono tag designed according to BharatSR reference
 * (e.g. "MISSION CONSOLE", "OPERATOR", "STEP 01").
 */
export const Tag: React.FC<TagProps> = ({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...props
}) => {
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider font-medium border rounded-[4px] select-none ${sizeClasses} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

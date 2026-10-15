import React from "react";

export interface PillProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  label?: string;
  value: React.ReactNode;
  variant?: "default" | "brand" | "elevated" | "critical" | "success";
  size?: "sm" | "md";
}

export const Pill: React.FC<PillProps> = ({
  icon,
  label,
  value,
  variant = "default",
  size = "md",
  className = "",
  ...props
}) => {
  const variantStyles = {
    default: "bg-[#111417] border-[rgba(255,255,255,0.08)] text-[#f0f2f5]",
    brand: "bg-[#2d1f0b] border-[#fe9a00]/40 text-[#ffb454]",
    elevated: "bg-[#2b2513] border-[#e9c46a]/40 text-[#e9c46a]",
    critical: "bg-[#2b1218] border-[#f4526b]/40 text-[#f4526b]",
    success: "bg-[#0d281e] border-[#3ddc97]/40 text-[#3ddc97]",
  };

  const sizeStyles = size === "sm" ? "px-2 py-0.5 text-xs gap-1.5" : "px-2.5 py-1 text-xs gap-2";

  return (
    <div
      className={`inline-flex items-center rounded-full border font-mono select-none ${sizeStyles} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {label && <span className="text-[#9aa0a6] font-normal uppercase text-[10px]">{label}:</span>}
      <span className="font-semibold sf-tabular">{value}</span>
    </div>
  );
};

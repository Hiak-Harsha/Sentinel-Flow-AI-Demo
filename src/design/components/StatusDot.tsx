import React from "react";

export type StatusDotVariant = "live" | "amber" | "danger" | "faint" | "info";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusDotVariant;
  pulse?: boolean;
}

const colorMap: Record<StatusDotVariant, { dot: string; pulse: string }> = {
  live: { dot: "bg-[#3ddc97]", pulse: "bg-[#3ddc97]" },
  amber: { dot: "bg-[#fe9a00]", pulse: "bg-[#fe9a00]" },
  danger: { dot: "bg-[#f4526b]", pulse: "bg-[#f4526b]" },
  faint: { dot: "bg-[#5f6975]", pulse: "bg-[#5f6975]" },
  info: { dot: "bg-[#5aa9ff]", pulse: "bg-[#5aa9ff]" },
};

export const StatusDot: React.FC<StatusDotProps> = ({
  variant = "live",
  pulse = false,
  className = "",
  ...props
}) => {
  const { dot, pulse: pulseColor } = colorMap[variant];

  return (
    <span className={`relative inline-flex items-center justify-center w-2 h-2 shrink-0 ${className}`} {...props}>
      {pulse && (
        <span
          className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${pulseColor}`}
        />
      )}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${dot}`} />
    </span>
  );
};

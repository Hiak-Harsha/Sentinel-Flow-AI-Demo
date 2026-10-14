import React from "react";

export interface GaugeProps {
  value: number; // 0 to 100
  label?: string;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
  className?: string;
}

export const Gauge: React.FC<GaugeProps> = ({
  value,
  label,
  size = 120,
  strokeWidth = 10,
  showValue = true,
  className = "",
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  // Use a 240-degree arc
  const arcLength = circumference * (240 / 360);
  const strokeDashoffset = arcLength - (clamped / 100) * arcLength;

  let color = "#10b981"; // green
  if (clamped >= 85) color = "#f43f5e"; // rose
  else if (clamped >= 65) color = "#f97316"; // orange
  else if (clamped >= 35) color = "#eab308"; // amber

  return (
    <div className={`inline-flex flex-col items-center justify-center relative select-none ${className}`}>
      <svg
        width={size}
        height={size}
        className="rotate-[150deg] transform"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>

      {/* Center Label & Value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        {showValue && (
          <span className="text-xl font-bold font-mono tracking-tight text-white sf-tabular">
            {clamped.toFixed(0)}%
          </span>
        )}
        {label && (
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

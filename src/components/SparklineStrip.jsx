import React from "react";

/**
 * Lightweight SVG sparkline strip for rate, byte volume, and error trends.
 */
export function SparklineStrip({ data = [], color = "#22d3ee", height = 36, label = "", currentValue = "" }) {
  const points = data.length > 0 ? data : [0, 0, 0, 0, 0];
  const maxVal = Math.max(1, ...points);
  const minVal = Math.min(0, ...points);
  const range = maxVal - minVal || 1;

  const width = 120;
  const padding = 2;
  const step = (width - padding * 2) / (points.length - 1 || 1);

  const polylineCoords = points
    .map((val, idx) => {
      const x = padding + idx * step;
      const normalized = (val - minVal) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="flex items-center space-x-3 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-1.5">
      <div className="flex flex-col min-w-[70px]">
        {label && <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>}
        <span className="font-mono text-sm font-semibold text-slate-100">{currentValue}</span>
      </div>
      <div className="relative">
        <svg width={width} height={height} className="overflow-visible">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineCoords}
          />
        </svg>
      </div>
    </div>
  );
}

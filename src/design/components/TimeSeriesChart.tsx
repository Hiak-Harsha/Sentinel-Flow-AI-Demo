import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface DataPoint {
  time: string | number;
  [key: string]: any;
}

export interface SeriesConfig {
  key: string;
  name?: string;
  color: string;
  fillOpacity?: number;
}

export interface TimeSeriesChartProps {
  data: DataPoint[];
  series: SeriesConfig[];
  height?: number;
  yUnit?: string;
  className?: string;
}

const CustomTooltip = ({ active, payload, label, yUnit }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-700/80 shadow-xl text-xs font-mono sf-tabular">
        <p className="text-slate-400 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name || entry.dataKey}:
            </span>
            <span className="font-bold text-white">
              {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value} {yUnit || ""}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  series,
  height = 240,
  yUnit = "",
  className = "",
}) => {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={s.fillOpacity ?? 0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />

          <XAxis
            dataKey="time"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
          />

          <YAxis
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
          />

          <Tooltip content={<CustomTooltip yUnit={yUnit} />} />

          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name || s.key}
              stroke={s.color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#grad-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

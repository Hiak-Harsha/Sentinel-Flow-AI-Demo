import { useMemo } from "react";
import { Panel, StatCard, formatNumber, formatTime } from "../components/shared";

export function Analytics({
  telemetryTimeseries = [],
  baselineStats = {},
  participants = [],
  activeAlerts = [],
}) {
  const points = useMemo(() => {
    return telemetryTimeseries.slice(-30).map((t, idx) => ({
      x: idx,
      rate: t.requests_per_sec || 0,
      active: t.active_devices || 0,
      bytesIn: t.bytes_in_per_sec || 0,
      bytesOut: t.bytes_out_per_sec || 0,
      time: t.timestamp ? formatTime(t.timestamp) : "",
    }));
  }, [telemetryTimeseries]);

  const maxRate = Math.max(10, ...points.map((p) => p.rate));
  const maxBytes = Math.max(2000, ...points.map((p) => p.bytesOut));

  const totalRequestsRecorded = participants.reduce((acc, p) => acc + (p.request_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c1626]/90 p-5 backdrop-blur-xl">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Session Behavioural Analytics</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Aggregated empirical telemetry metrics, baseline comparison, and anomaly distributions.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={totalRequestsRecorded} sub="All Connected Devices" icon="📊" />
        <StatCard label="Active Devices" value={participants.length} sub="Endpoints Monitored" icon="💻" />
        <StatCard label="Peak Rate" value={`${maxRate.toFixed(1)} req/s`} sub="Session High" icon="⚡" />
        <StatCard label="Anomalies Flagged" value={activeAlerts.length} sub="Active Alerts" icon="⚠" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Rate Timeline */}
        <Panel title="Network Request Rate Timeline" kicker="Requests / Second">
          <div className="h-56 w-full rounded-xl border border-white/5 bg-slate-950/60 p-4 flex flex-col justify-between">
            <div className="text-[10px] font-mono text-slate-500">MAX: {maxRate.toFixed(1)} req/s</div>
            <div className="h-40 w-full pt-2">
              <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                {points.length > 1 && (
                  <polyline
                    points={points
                      .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - (p.rate / maxRate) * 100}`)
                      .join(" ")}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>{points[0]?.time || "Start"}</span>
              <span>Rolling Rate Stream</span>
              <span>{points[points.length - 1]?.time || "Now"}</span>
            </div>
          </div>
        </Panel>

        {/* Traffic Volume (Bytes/s) */}
        <Panel title="Data Outflow Volume" kicker="Bytes / Second">
          <div className="h-56 w-full rounded-xl border border-white/5 bg-slate-950/60 p-4 flex flex-col justify-between">
            <div className="text-[10px] font-mono text-slate-500">MAX: {(maxBytes / 1024).toFixed(1)} KB/s</div>
            <div className="h-40 w-full pt-2">
              <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                {points.length > 1 && (
                  <polyline
                    points={points
                      .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - (p.bytesOut / maxBytes) * 100}`)
                      .join(" ")}
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>{points[0]?.time || "Start"}</span>
              <span>Outbound Throughput</span>
              <span>{points[points.length - 1]?.time || "Now"}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Baseline vs Observed Parameters (Section 16) */}
      <Panel title="Learned Baseline Reference vs Live Tolerances" kicker="Statistical Profile">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <span className="text-[10px] text-slate-500 block uppercase">Request Rate</span>
            <span className="text-xl font-bold text-white mt-1 block">
              {baselineStats?.request_rate?.median || "3.2"} req/s
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              P95 Tolerance: {baselineStats?.request_rate?.p95 || "6.8"} req/s
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <span className="text-[10px] text-slate-500 block uppercase">Inter-Arrival Time</span>
            <span className="text-xl font-bold text-white mt-1 block">
              {baselineStats?.inter_arrival_ms?.median || "270"} ms
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Rapid Alert Threshold: &lt;100 ms
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <span className="text-[10px] text-slate-500 block uppercase">Burstiness Index</span>
            <span className="text-xl font-bold text-white mt-1 block">
              {baselineStats?.burstiness?.median || "0.12"}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Elevated Zone: &gt;0.40
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <span className="text-[10px] text-slate-500 block uppercase">Outbound Size</span>
            <span className="text-xl font-bold text-white mt-1 block">
              {baselineStats?.bytes_out?.median ? `${(baselineStats.bytes_out.median / 1024).toFixed(1)} KB` : "1.3 KB"}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              P95 Bound: ~2.8 KB
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

import React from "react";
import { motion } from "framer-motion";

export function DeviceHeatmap({ devices = [], selectedDeviceId = null, onSelectDevice }) {
  const normalCount = devices.filter((d) => !d.threat_level || d.threat_level === "LOW").length;
  const elevatedCount = devices.filter((d) => d.threat_level === "ELEVATED").length;
  const highCount = devices.filter((d) => d.threat_level === "HIGH").length;
  const criticalCount = devices.filter((d) => d.threat_level === "CRITICAL").length;

  return (
    <div className="space-y-4">
      {/* Heatmap Header & Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-md">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
              Live Device Fleet Grid
            </h3>
            <span className="text-xs font-mono text-slate-400 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
              {devices.length} / 60 Capacity
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time per-device threat classification from streaming feature fusion.
          </p>
        </div>

        {/* Status Counts */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="flex items-center px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span>
            {normalCount} Safe
          </span>
          <span className="flex items-center px-2 py-1 rounded bg-amber-950/40 border border-amber-500/30 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400 mr-1.5"></span>
            {elevatedCount} Elevated
          </span>
          <span className="flex items-center px-2 py-1 rounded bg-orange-950/40 border border-orange-500/30 text-orange-400">
            <span className="w-2 h-2 rounded-full bg-orange-400 mr-1.5"></span>
            {highCount} High
          </span>
          <span className="flex items-center px-2 py-1 rounded bg-rose-950/50 border border-rose-500/40 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5 animate-ping"></span>
            {criticalCount} Critical
          </span>
        </div>
      </div>

      {/* Grid of Devices */}
      {devices.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
          <div className="w-12 h-12 rounded-full bg-cyan-950/50 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h4 className="text-sm font-medium text-slate-300">No Participants Connected Yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Audience members can join the demo on mobile or desktop using the session join code.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
          {devices.map((device, idx) => {
            const isSelected = selectedDeviceId === device.device_id;
            const level = device.threat_level || "LOW";
            const scorePct = Math.round((device.threat_score || 0) * 100);

            let colorStyles = "bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-300";
            let dotColor = "bg-emerald-400";
            let badgeBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

            if (level === "ELEVATED") {
              colorStyles = "bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50 text-amber-200";
              dotColor = "bg-amber-400";
              badgeBg = "bg-amber-500/20 text-amber-300 border-amber-500/30";
            } else if (level === "HIGH") {
              colorStyles = "bg-orange-950/30 border-orange-500/50 hover:border-orange-500/70 text-orange-200";
              dotColor = "bg-orange-400";
              badgeBg = "bg-orange-500/20 text-orange-300 border-orange-500/40";
            } else if (level === "CRITICAL") {
              colorStyles = "bg-rose-950/40 border-rose-500 hover:border-rose-400 text-rose-200 shadow-lg shadow-rose-950/50 animate-pulse";
              dotColor = "bg-rose-500 animate-ping";
              badgeBg = "bg-rose-500/30 text-rose-300 border-rose-500/50";
            }

            return (
              <motion.button
                key={device.device_id || idx}
                layout
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectDevice(device.device_id)}
                className={`relative p-3 rounded-xl border text-left transition-all ${colorStyles} ${
                  isSelected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 shadow-cyan-900/30" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeBg}`}>
                    {scorePct}%
                  </span>
                </div>

                <div className="mt-2">
                  <div className="text-xs font-semibold truncate text-slate-100" title={device.alias}>
                    {device.alias}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                    {device.device_id}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="truncate max-w-[80px]" title={device.last_action}>
                    {device.last_action || "Active"}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-tight">
                    {level.slice(0, 4)}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LiveTargetPanel({
  targetUrl = "http://127.0.0.1:8000/lab-target",
  onSelectTargetUrl,
  allowedOrigins = [],
  recentRequests = [],
  activeAttack = null,
}) {
  const [activeTab, setActiveTab] = useState("endpoints");

  // Take the last 5 requests
  const tickerItems = (recentRequests || []).slice(0, 5);

  return (
    <div className="relative rounded-2xl border border-cyan-500/30 bg-slate-950 overflow-hidden shadow-2xl">
      {/* Target Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span className="font-bold text-slate-200">ISOLATED LAB TARGET INVENTORY</span>
          <span className="text-slate-500">|</span>

          {allowedOrigins && allowedOrigins.length > 0 && onSelectTargetUrl ? (
            <select
              value={targetUrl}
              onChange={(e) => onSelectTargetUrl(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-cyan-300 text-xs focus:outline-none focus:border-cyan-400 font-mono"
            >
              {allowedOrigins.map((origin) => (
                <option key={origin} value={origin}>
                  {origin} (Private Lab)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-cyan-400 truncate max-w-xs">{targetUrl}</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <span className="rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 text-[10px]">
            ✓ LOCAL BOUNDARY ENFORCED
          </span>
          {activeAttack && (
            <span className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[10px] animate-pulse flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5 animate-ping"></span>
              SCENARIO ACTIVE: {activeAttack.scenario}
            </span>
          )}
        </div>
      </div>

      {/* Target Details Viewport */}
      <div className="p-5 bg-gradient-to-b from-slate-950 to-slate-900 text-slate-300 text-xs font-mono space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Sentinel Flow Disposable Target</span>
              <span className="text-[10px] text-cyan-400 font-normal">v1.0.0</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Instrumented internal fixture with authentication audit event sinks, canary traps, and port telemetry.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="px-2 py-1 rounded bg-slate-800 text-[10px] text-slate-300">
              Boundary: Loopback / RFC1918
            </span>
          </div>
        </div>

        {/* Endpoints Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border border-white/5 bg-slate-950/60">
            <span className="text-[10px] text-cyan-400 block font-bold">1. AUTHENTICATION SINK</span>
            <span className="text-slate-200 font-bold block mt-1">/lab-target/auth/login</span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Emits verified <code className="text-cyan-300">auth.failure</code> and <code className="text-emerald-300">auth.success</code> events.
            </span>
          </div>

          <div className="p-3 rounded-xl border border-white/5 bg-slate-950/60">
            <span className="text-[10px] text-amber-400 block font-bold">2. CANARY TRAPS (EXPLOIT PROBES)</span>
            <span className="text-slate-200 font-bold block mt-1">/lab-target/canary/*</span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Safe canary markers for SQLi, XSS, and Traversal without code execution.
            </span>
          </div>

          <div className="p-3 rounded-xl border border-white/5 bg-slate-950/60">
            <span className="text-[10px] text-indigo-400 block font-bold">3. PORT SENSOR TELEMETRY</span>
            <span className="text-slate-200 font-bold block mt-1">/lab-target/sensor/port-probe</span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Connection attempt telemetry observing TCP ports 21, 22, 23, 80, 443, 8080.
            </span>
          </div>
        </div>
      </div>

      {/* Live Transaction Ticker */}
      <div className="flex items-center space-x-3 px-4 py-2 bg-slate-900/90 border-t border-slate-800 text-[11px] font-mono">
        <span className="text-slate-500 font-bold flex-shrink-0">RECENT TRAFFIC:</span>
        <div className="flex-1 overflow-hidden">
          {tickerItems.length === 0 ? (
            <span className="text-slate-600 italic">No proxy requests observed yet...</span>
          ) : (
            <div className="flex items-center space-x-4 animate-pulse">
              {tickerItems.map((req, i) => (
                <span key={i} className="flex items-center space-x-1.5 flex-shrink-0">
                  <span className="text-cyan-400 font-bold">{req.method}</span>
                  <span className="text-slate-300">{req.path}</span>
                  <span
                    className={`px-1 rounded text-[10px] font-bold ${
                      req.status_code < 400
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-950 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {req.status_code}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

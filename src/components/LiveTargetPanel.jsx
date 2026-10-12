import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LiveTargetPanel({
  targetUrl = "https://kee-crochet-shop.vercel.app",
  onSelectTargetUrl,
  allowedOrigins = [],
  recentRequests = [],
  activeAttack = null,
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  // Take the last 5 requests
  const tickerItems = (recentRequests || []).slice(0, 5);

  const isLocalhost =
    targetUrl.startsWith("http://localhost:3000") ||
    targetUrl.startsWith("http://127.0.0.1:3000");

  const vercelOrigin =
    allowedOrigins.find((o) => o.includes("kee-crochet-shop.vercel.app")) ||
    "https://kee-crochet-shop.vercel.app";

  return (
    <div className="relative rounded-2xl border border-cyan-500/30 bg-slate-950 overflow-hidden shadow-2xl">
      {/* Target Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span className="font-bold text-slate-200">TARGET APPLICATION PREVIEW</span>
          <span className="text-slate-500">|</span>

          {allowedOrigins && allowedOrigins.length > 0 && onSelectTargetUrl ? (
            <select
              value={targetUrl}
              onChange={(e) => onSelectTargetUrl(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-cyan-300 text-xs focus:outline-none focus:border-cyan-400"
            >
              {allowedOrigins.map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-cyan-400 truncate max-w-xs">{targetUrl}</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {activeAttack && (
            <span className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[10px] animate-pulse flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5 animate-ping"></span>
              {activeAttack.scenario || "ATTACK SIMULATION ACTIVE"}
            </span>
          )}
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800 transition text-[11px]"
          >
            Open in Tab ↗
          </a>
        </div>
      </div>

      {/* Localhost Offline Helper Strip */}
      {isLocalhost && onSelectTargetUrl && (
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <span>ℹ️</span>
            <span>
              If your local clone is not running on port 3000 (showing <em>refused to connect</em>):
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTargetUrl(vercelOrigin)}
            className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold hover:bg-cyan-500/30 transition text-[11px]"
          >
            👉 Switch Preview to Kee Crochet Shop ({vercelOrigin})
          </button>
        </div>
      )}

      {/* Embedded Application Viewport */}
      <div className="relative h-[420px] w-full bg-[#030712] overflow-hidden">
        {/* Iframe View */}
        {!iframeError ? (
          <iframe
            key={targetUrl}
            src={targetUrl}
            title="Target Application"
            className="w-full h-full border-0 select-none bg-white"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              ⚠
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">Target Direct Embed Restricted</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                The target origin has restrictive frame policies. All traffic is still proxied and monitored seamlessly via Sentinel Flow.
              </p>
            </div>
            <a
              href={targetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-cyan-400 underline"
            >
              Open {targetUrl} in a new tab
            </a>
          </div>
        )}

        {/* Visual Effect Layer for active attacks */}
        <AnimatePresence>
          {activeAttack && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            >
              {/* Scanline sweep effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-rose-500/10 via-transparent to-rose-500/10"></div>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rose-500 to-transparent animate-pulse"></div>

              {/* Red border flash */}
              <div className="absolute inset-0 border-2 border-rose-500/40 animate-pulse"></div>

              {/* Watermark badge */}
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-rose-500/50 text-[11px] font-mono text-rose-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <span>INTRUSION STRESS SIMULATION IN PROGRESS</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Traffic Ticker along the bottom edge */}
        <div className="absolute bottom-0 inset-x-0 z-30 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 px-3 py-2 flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center space-x-2 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-bold text-slate-300">LIVE PROXIED INBOUND:</span>
          </div>

          <div className="flex items-center space-x-2 overflow-x-auto max-w-xl">
            {tickerItems.length === 0 ? (
              <span className="text-slate-600 italic">Waiting for proxied participant traffic...</span>
            ) : (
              tickerItems.map((req, i) => (
                <span
                  key={req.id || i}
                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 whitespace-nowrap"
                >
                  <span className="text-cyan-400 font-bold mr-1">{req.method || "GET"}</span>
                  <span className="text-slate-400">{req.path || "/"}</span>
                  <span className="ml-1 text-[10px] text-emerald-400 font-semibold">
                    {req.status_code || 200}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

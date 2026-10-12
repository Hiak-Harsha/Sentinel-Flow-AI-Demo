import React, { useEffect, useRef, useState } from "react";

/**
 * Green/Amber-on-black monospace streaming terminal component.
 * Displays live reverse-proxy access logs and attack scenario output.
 */
export function TerminalLog({ logs = [], title = "REVERSE PROXY & ATTACK TRAFFIC STREAM" }) {
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="flex flex-col h-[320px] rounded-xl border border-slate-800 bg-[#02050a] overflow-hidden shadow-2xl font-mono text-xs">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800 text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
          <span className="ml-2 font-bold tracking-wider text-slate-300 text-[11px]">{title}</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px]">
          <label className="flex items-center space-x-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-400 focus:ring-0 w-3 h-3"
            />
            <span>Auto-scroll</span>
          </label>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-semibold">{logs.length} events</span>
        </div>
      </div>

      {/* Terminal Body */}
      <div ref={containerRef} className="flex-1 p-3 overflow-y-auto space-y-1 terminal-scroll select-text">
        {logs.length === 0 ? (
          <div className="text-slate-600 py-6 text-center italic">
            -- Waiting for incoming proxied traffic or attack scenario execution --
          </div>
        ) : (
          logs.map((log, idx) => {
            const status = log.status_code || 200;
            const statusColor =
              status >= 500
                ? "text-rose-400 font-bold"
                : status >= 400
                ? "text-amber-400 font-bold"
                : status >= 300
                ? "text-cyan-300"
                : "text-emerald-400";

            return (
              <div key={idx} className="flex items-baseline space-x-2 leading-relaxed hover:bg-white/[0.02] px-1 rounded">
                <span className="text-slate-500 text-[10px]">
                  {log.timestamp_iso ? log.timestamp_iso.slice(11, 19) : new Date().toLocaleTimeString()}
                </span>
                <span className="text-cyan-400 font-semibold w-12">{log.method || "GET"}</span>
                <span className={`${statusColor} w-8 text-right`}>{status}</span>
                <span className="text-slate-200 flex-1 truncate">{log.path || "/"}</span>
                {log.identity_id && (
                  <span className="text-violet-400 text-[10px] px-1 bg-violet-950/40 rounded border border-violet-800/30">
                    {log.identity_id}
                  </span>
                )}
                {log.latency_ms !== undefined && (
                  <span className="text-slate-500 text-[10px]">{log.latency_ms}ms</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

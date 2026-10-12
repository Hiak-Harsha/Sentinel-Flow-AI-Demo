import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const BEAT_DURATION = 3000; // 3 seconds per beat
const TOTAL_BEATS = 5;

const BEAT_DETAILS = [
  {
    step: "BEAT 1: NORMAL TRAFFIC",
    title: "Normal Audience Participants Browse the Target",
    badge: "BENIGN STREAM",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    desc: "Legitimate users explore catalog items, check cart status, and browse pages through the reverse proxy at human intervals.",
  },
  {
    step: "BEAT 2: ADVERSARY BLENDS IN",
    title: "Adversary Launches Burst Scenarios on Port 443",
    badge: "ADVERSARY INJECTION",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    desc: "An attacker triggers credential stuffing and rapid endpoint scraping. From the outside, requests share identical ports, headers, and lab IP addresses.",
  },
  {
    step: "BEAT 3: REVERSE PROXY TELEMETRY",
    title: "Reverse Proxy & Traffic Logger Intercepts & Measures",
    badge: "SERVER MEASUREMENT",
    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    desc: "Every request is metered server-side: precise response latency, payload byte sizes, status codes, and strengthened fingerprint entropy are extracted.",
  },
  {
    step: "BEAT 4: 3-LAYER AI ENGINE",
    title: "Multi-Model Fusion Engine Classifies Traffic",
    badge: "AI INFERENCE",
    badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    desc: "Telemetry passes simultaneously through Random Forest (UNSW-NB15), Online Anomaly Detector, and Rule Correlator to compute an ensemble threat score.",
  },
  {
    step: "BEAT 5: ACTIVE INTERCEPTION",
    title: "Threat Isolated · Real User Flow Preserved",
    badge: "SOC ALERT & MITIGATION",
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    desc: "Fused score reaches 0.94 CRITICAL. Alert fires to the Operator Command Center and the attacker is isolated, while legitimate customer traffic continues uninterrupted.",
  },
];

export function LandingHeroAnimation() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setCurrentBeat(4); // Static end state
      return;
    }
    const interval = setInterval(() => {
      setCurrentBeat((prev) => (prev + 1) % TOTAL_BEATS);
    }, BEAT_DURATION);
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  const active = BEAT_DETAILS[currentBeat];

  // Visual state flags based on current beat
  const isAttackerActive = currentBeat >= 1;
  const isProxyInspecting = currentBeat >= 2;
  const isModelAnalyzing = currentBeat >= 3;
  const isAlertFired = currentBeat === 4;

  return (
    <div className="w-full max-w-4xl mx-auto my-6 flex flex-col items-center">
      {/* Visual Diagram Frame */}
      <div className="w-full relative rounded-2xl bg-gradient-to-b from-slate-900/90 via-[#0a1220]/95 to-slate-950 border border-cyan-500/30 shadow-2xl shadow-cyan-950/40 overflow-hidden backdrop-blur-xl p-4 sm:p-6">
        {/* Top Status Bar of Diagram */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-white/10 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="text-slate-300 font-bold uppercase tracking-wider">
              SENTINEL FLOW · ARCHITECTURAL DEFENSE PIPELINE
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${active.badgeColor}`}>
              {active.badge}
            </span>
            <div className="flex items-center space-x-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <button
                  key={i}
                  onClick={() => setCurrentBeat(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    i === currentBeat ? "w-5 bg-cyan-400" : "w-1.5 bg-slate-700 hover:bg-slate-500"
                  }`}
                  aria-label={`Jump to Beat ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* SVG Diagram Canvas */}
        <div className="relative w-full aspect-[2/1] min-h-[300px] max-h-[460px]">
          <svg
            viewBox="0 0 960 480"
            className="w-full h-full select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Gradients */}
              <linearGradient id="normalPulseGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="attackPulseGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="1" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.4" />
              </linearGradient>
              <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glowRose" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Grid Pattern */}
            <g opacity="0.15">
              {[80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 880].map((x) => (
                <line key={`x-${x}`} x1={x} y1="20" x2={x} y2="460" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="3 3" />
              ))}
              {[80, 160, 240, 320, 400].map((y) => (
                <line key={`y-${y}`} x1="40" y1={y} x2="920" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="3 3" />
              ))}
            </g>

            {/* FLOW LINES: Clients -> Reverse Proxy */}
            {/* Client 1 (Benign) -> Proxy */}
            <path
              d="M 170 90 C 240 90, 260 210, 320 230"
              fill="none"
              stroke="#0891b2"
              strokeWidth="2"
              strokeDasharray={isAttackerActive ? "4 4" : "none"}
              opacity="0.6"
            />
            {/* Client 2 (Benign) -> Proxy */}
            <path
              d="M 170 170 C 240 170, 260 230, 320 240"
              fill="none"
              stroke="#0891b2"
              strokeWidth="2"
              opacity="0.6"
            />
            {/* Client 3 (Adversary or Client) -> Proxy */}
            <path
              d="M 170 270 C 240 270, 260 250, 320 250"
              fill="none"
              stroke={isAttackerActive ? "#f43f5e" : "#0891b2"}
              strokeWidth={isAttackerActive ? "3" : "2"}
              opacity={isAttackerActive ? "0.9" : "0.6"}
            />
            {/* Client 4 (Benign) -> Proxy */}
            <path
              d="M 170 370 C 240 370, 260 270, 320 260"
              fill="none"
              stroke="#0891b2"
              strokeWidth="2"
              opacity="0.6"
            />

            {/* Animated Traffic Particles: Clients -> Proxy */}
            {!prefersReducedMotion && (
              <>
                {/* Normal pulses */}
                <circle r="4" fill="#22d3ee" filter="url(#glowCyan)">
                  <animateMotion
                    path="M 170 90 C 240 90, 260 210, 320 230"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle r="4" fill="#22d3ee" filter="url(#glowCyan)">
                  <animateMotion
                    path="M 170 170 C 240 170, 260 230, 320 240"
                    dur="2.8s"
                    begin="0.7s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle r="4" fill="#22d3ee" filter="url(#glowCyan)">
                  <animateMotion
                    path="M 170 370 C 240 370, 260 270, 320 260"
                    dur="3.1s"
                    begin="0.4s"
                    repeatCount="indefinite"
                  />
                </circle>

                {/* Attacker pulses: calm when benign, rapid and jagged when attacker active */}
                {isAttackerActive ? (
                  <>
                    <circle r="5" fill="#f43f5e" filter="url(#glowRose)">
                      <animateMotion
                        path="M 170 270 C 240 270, 260 250, 320 250"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="4" fill="#fbbf24">
                      <animateMotion
                        path="M 170 270 C 240 270, 260 250, 320 250"
                        dur="0.8s"
                        begin="0.3s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="5" fill="#f43f5e">
                      <animateMotion
                        path="M 170 270 C 240 270, 260 250, 320 250"
                        dur="0.8s"
                        begin="0.55s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                ) : (
                  <circle r="4" fill="#22d3ee">
                    <animateMotion
                      path="M 170 270 C 240 270, 260 250, 320 250"
                      dur="2.6s"
                      begin="0.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </>
            )}

            {/* FLOW LINES: Reverse Proxy -> Target Application */}
            <path
              d="M 440 260 C 490 260, 540 330, 610 350"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.5"
            />
            {/* Animated particles to Target */}
            {!prefersReducedMotion && (
              <circle r="4" fill="#22d3ee">
                <animateMotion
                  path="M 440 260 C 490 260, 540 330, 610 350"
                  dur="1.8s"
                  repeatCount="indefinite"
                />
              </circle>
            )}

            {/* FLOW LINES: Reverse Proxy -> 3-Layer AI Engine */}
            <path
              d="M 440 230 C 480 230, 490 100, 540 90"
              fill="none"
              stroke={isModelAnalyzing ? "#818cf8" : "#334155"}
              strokeWidth="1.5"
              strokeDasharray={isModelAnalyzing ? "3 3" : "none"}
            />
            <path
              d="M 440 240 C 480 240, 490 160, 540 160"
              fill="none"
              stroke={isModelAnalyzing ? "#818cf8" : "#334155"}
              strokeWidth="1.5"
              strokeDasharray={isModelAnalyzing ? "3 3" : "none"}
            />
            <path
              d="M 440 250 C 480 250, 490 230, 540 230"
              fill="none"
              stroke={isModelAnalyzing ? "#818cf8" : "#334155"}
              strokeWidth="1.5"
              strokeDasharray={isModelAnalyzing ? "3 3" : "none"}
            />

            {/* FLOW LINES: 3 Layers -> Fused Threat Score */}
            <path
              d="M 700 90 C 730 90, 740 150, 770 160"
              fill="none"
              stroke={isModelAnalyzing ? "#818cf8" : "#334155"}
              strokeWidth="1.5"
            />
            <path
              d="M 700 160 L 770 160"
              fill="none"
              stroke={isModelAnalyzing ? "#818cf8" : "#334155"}
              strokeWidth="1.5"
            />
            <path
              d="M 700 230 C 730 230, 740 170, 770 160"
              fill="none"
              stroke={isModelAnalyzing ? "#818cf8" : "#334155"}
              strokeWidth="1.5"
            />

            {/* FLOW LINE: Fused Score -> Operator Alert */}
            {isAlertFired && (
              <path
                d="M 870 160 C 890 160, 890 270, 840 290"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2.5"
                strokeDasharray="4 2"
                filter="url(#glowRose)"
              />
            )}

            {/* NODE 1: CLIENT NODES (Left Column) */}
            {/* Client 1 */}
            <g transform="translate(30, 65)">
              <rect width="140" height="48" rx="10" fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="10" fill="#0891b2" opacity="0.2" />
              <text x="24" y="28" textAnchor="middle" fill="#22d3ee" fontSize="12" fontWeight="bold">01</text>
              <text x="44" y="20" fill="#f8fafc" fontSize="11" fontWeight="bold" fontFamily="Inter, sans-serif">Participant 1</text>
              <text x="44" y="34" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">Chrome · 1.2 req/s</text>
            </g>

            {/* Client 2 */}
            <g transform="translate(30, 145)">
              <rect width="140" height="48" rx="10" fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="10" fill="#0891b2" opacity="0.2" />
              <text x="24" y="28" textAnchor="middle" fill="#22d3ee" fontSize="12" fontWeight="bold">02</text>
              <text x="44" y="20" fill="#f8fafc" fontSize="11" fontWeight="bold" fontFamily="Inter, sans-serif">Participant 2</text>
              <text x="44" y="34" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">Safari · 0.8 req/s</text>
            </g>

            {/* Client 3: ADVERSARY NODE */}
            <g transform="translate(30, 245)">
              <rect
                width="140"
                height="50"
                rx="10"
                fill={isAttackerActive ? "#2b0a14" : "#0f172a"}
                stroke={isAttackerActive ? "#f43f5e" : "#1e293b"}
                strokeWidth={isAttackerActive ? "2" : "1.5"}
                className="transition-colors duration-500"
              />
              <circle
                cx="24"
                cy="25"
                r="11"
                fill={isAttackerActive ? "#f43f5e" : "#0891b2"}
                opacity={isAttackerActive ? "0.3" : "0.2"}
              />
              <text
                x="24"
                y="29"
                textAnchor="middle"
                fill={isAttackerActive ? "#fb7185" : "#22d3ee"}
                fontSize="12"
                fontWeight="bold"
              >
                {isAttackerActive ? "⚡" : "03"}
              </text>
              <text
                x="44"
                y="21"
                fill={isAttackerActive ? "#fecdd3" : "#f8fafc"}
                fontSize="11"
                fontWeight="bold"
                fontFamily="Inter, sans-serif"
              >
                {isAttackerActive ? "Adversary (Bot)" : "Participant 3"}
              </text>
              <text
                x="44"
                y="36"
                fill={isAttackerActive ? "#fb7185" : "#64748b"}
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight={isAttackerActive ? "bold" : "normal"}
              >
                {isAttackerActive ? "Burst DoS · 35 req/s" : "Firefox · 1.5 req/s"}
              </text>
            </g>

            {/* Client 4 */}
            <g transform="translate(30, 345)">
              <rect width="140" height="48" rx="10" fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="10" fill="#0891b2" opacity="0.2" />
              <text x="24" y="28" textAnchor="middle" fill="#22d3ee" fontSize="12" fontWeight="bold">04</text>
              <text x="44" y="20" fill="#f8fafc" fontSize="11" fontWeight="bold" fontFamily="Inter, sans-serif">Participant 4</text>
              <text x="44" y="34" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">Edge · 1.0 req/s</text>
            </g>

            {/* NODE 2: REVERSE PROXY & TRAFFIC LOGGER (Center-Left) */}
            <g transform="translate(320, 195)">
              <rect
                width="120"
                height="100"
                rx="14"
                fill="#0a192f"
                stroke="#06b6d4"
                strokeWidth={isProxyInspecting ? "2" : "1"}
                filter={isProxyInspecting ? "url(#glowCyan)" : "none"}
              />
              <text x="60" y="24" textAnchor="middle" fill="#22d3ee" fontSize="10" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                REVERSE PROXY
              </text>
              <text x="60" y="38" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                Traffic Logger
              </text>
              <line x1="12" y1="46" x2="108" y2="46" stroke="#1e293b" strokeWidth="1" />

              {/* Server-Side Telemetry Chips */}
              <g transform="translate(14, 54)">
                <rect width="92" height="16" rx="4" fill="#032b44" />
                <text x="46" y="12" textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                  STATUS: 200 / 401
                </text>
              </g>
              <g transform="translate(14, 74)">
                <rect width="92" height="16" rx="4" fill="#032b44" />
                <text x="46" y="12" textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                  LAT: 28ms · 1.4KB
                </text>
              </g>
            </g>

            {/* NODE 3: 3-LAYER AI ENGINE (Center-Right) */}
            {/* Layer 1: Random Forest */}
            <g transform="translate(540, 68)">
              <rect
                width="160"
                height="44"
                rx="8"
                fill="#091428"
                stroke={isModelAnalyzing ? "#818cf8" : "#1e293b"}
                strokeWidth={isModelAnalyzing ? "1.5" : "1"}
              />
              <text x="12" y="18" fill="#c7d2fe" fontSize="10" fontWeight="bold" fontFamily="Inter, sans-serif">
                Layer 1: Supervised Model
              </text>
              <text x="12" y="32" fill="#818cf8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                Random Forest (UNSW-NB15)
              </text>
            </g>

            {/* Layer 2: Online Anomaly Detector */}
            <g transform="translate(540, 138)">
              <rect
                width="160"
                height="44"
                rx="8"
                fill="#091428"
                stroke={isModelAnalyzing ? "#818cf8" : "#1e293b"}
                strokeWidth={isModelAnalyzing ? "1.5" : "1"}
              />
              <text x="12" y="18" fill="#c7d2fe" fontSize="10" fontWeight="bold" fontFamily="Inter, sans-serif">
                Layer 2: Online Anomaly
              </text>
              <text x="12" y="32" fill="#818cf8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                Isolation Forest Baseline
              </text>
            </g>

            {/* Layer 3: Rule Correlator */}
            <g transform="translate(540, 208)">
              <rect
                width="160"
                height="44"
                rx="8"
                fill="#091428"
                stroke={isModelAnalyzing ? "#818cf8" : "#1e293b"}
                strokeWidth={isModelAnalyzing ? "1.5" : "1"}
              />
              <text x="12" y="18" fill="#c7d2fe" fontSize="10" fontWeight="bold" fontFamily="Inter, sans-serif">
                Layer 3: Rule Correlator
              </text>
              <text x="12" y="32" fill="#818cf8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                Burst / Cadence / Churn
              </text>
            </g>

            {/* NODE 4: FUSED THREAT SCORE */}
            <g transform="translate(770, 115)">
              <rect
                width="120"
                height="90"
                rx="12"
                fill={isAlertFired ? "#3b0716" : "#0f172a"}
                stroke={isAlertFired ? "#f43f5e" : isModelAnalyzing ? "#818cf8" : "#334155"}
                strokeWidth={isAlertFired ? "2" : "1.5"}
                filter={isAlertFired ? "url(#glowRose)" : "none"}
              />
              <text x="60" y="24" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                FUSED SCORE
              </text>
              <text
                x="60"
                y="54"
                textAnchor="middle"
                fill={isAlertFired ? "#fb7185" : isModelAnalyzing ? "#fbbf24" : "#22d3ee"}
                fontSize="24"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                {isAlertFired ? "0.94" : isModelAnalyzing ? "0.68" : "0.12"}
              </text>
              <text
                x="60"
                y="74"
                textAnchor="middle"
                fill={isAlertFired ? "#f43f5e" : "#64748b"}
                fontSize="8"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                {isAlertFired ? "CRITICAL THREAT" : isModelAnalyzing ? "EVALUATING" : "NORMAL (BENIGN)"}
              </text>
            </g>

            {/* NODE 5: TARGET APPLICATION (Bottom Center-Right) */}
            <g transform="translate(610, 325)">
              <rect
                width="170"
                height="75"
                rx="12"
                fill="#071b2d"
                stroke="#0284c7"
                strokeWidth="1.5"
              />
              <text x="85" y="26" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="bold" fontFamily="Inter, sans-serif">
                Target Application
              </text>
              <text x="85" y="44" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                kee-crochet-shop.vercel.app
              </text>
              <rect x="25" y="52" width="120" height="16" rx="4" fill="#032b44" />
              <text x="85" y="63" textAnchor="middle" fill="#34d399" fontSize="8" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                ✓ SHOP OPERATIONAL
              </text>
            </g>

            {/* NODE 6: OPERATOR DASHBOARD ALERT (Right) */}
            <g transform="translate(770, 275)">
              <rect
                width="145"
                height="80"
                rx="10"
                fill="#0d1829"
                stroke={isAlertFired ? "#f43f5e" : "#1e293b"}
                strokeWidth={isAlertFired ? "2" : "1"}
              />
              <text x="12" y="22" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="Inter, sans-serif">
                Operator Console
              </text>
              <text x="12" y="38" fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace">
                Live SOC Radar
              </text>

              {isAlertFired ? (
                <g transform="translate(10, 46)">
                  <rect width="125" height="24" rx="4" fill="#4c0519" stroke="#f43f5e" strokeWidth="1" />
                  <text x="62" y="16" textAnchor="middle" fill="#fecdd3" fontSize="8" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    ⚠ ALERT: ATTACK ISOLATED
                  </text>
                </g>
              ) : (
                <g transform="translate(10, 46)">
                  <rect width="125" height="24" rx="4" fill="#0f172a" />
                  <text x="62" y="16" textAnchor="middle" fill="#475569" fontSize="8" fontFamily="JetBrains Mono, monospace">
                    Status: Nominal (Low)
                  </text>
                </g>
              )}
            </g>
          </svg>
        </div>

        {/* Live Narration Beat Caption Below Diagram */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                {active.step}
              </span>
              <span className="text-slate-500 text-xs">·</span>
              <h4 className="text-sm font-bold text-white font-sans">{active.title}</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">{active.desc}</p>
          </div>

          <div className="shrink-0 flex items-center space-x-2 font-mono text-xs">
            <button
              onClick={() => setCurrentBeat((prev) => (prev === 0 ? TOTAL_BEATS - 1 : prev - 1))}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              title="Previous scene"
            >
              ◀ Prev
            </button>
            <button
              onClick={() => setCurrentBeat((prev) => (prev + 1) % TOTAL_BEATS)}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition"
              title="Next scene"
            >
              Next ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

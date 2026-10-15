import React, { useState, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Zap, Swords, Lock, Eye, EyeOff, X, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/design/components/Button";
import { Tag } from "@/design/components/Tag";
import { StatusDot } from "@/design/components/StatusDot";
import { Input } from "@/design/components/Input";
import { Card, CardContent } from "@/design/components/Card";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";

// Lazy load the hero architecture stream animation
const LandingHeroAnimation = lazy(() =>
  import("@/components/LandingHeroAnimation").then((m) => ({
    default: m.LandingHeroAnimation,
  }))
);

export default function LandingPage() {
  const navigate = useNavigate();
  const [showAnimation, setShowAnimation] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickJoinCode, setQuickJoinCode] = useState("");

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.operatorLogin(passcode.trim() || "SF-OPERATOR-2026");
      sessionStorage.setItem("sf_role", "operator");
      sessionStorage.setItem("sf_user", "operator-01");
      if (res?.token) {
        sessionStorage.setItem("sf_session_token", res.token);
      }
      setShowLoginModal(false);
      navigate("/overview");
    } catch (err: any) {
      showToast.error("Login Denied", err?.message || "Invalid operator passcode");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinParticipant = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sessionStorage.setItem("sf_role", "participant");
    if (quickJoinCode.trim()) {
      sessionStorage.setItem("sf_join_code", quickJoinCode.trim().toUpperCase());
    }
    navigate("/join");
  };

  return (
    <div className="min-h-screen bg-[#090c10] text-[#f0f2f5] flex flex-col justify-between py-8 px-4 selection:bg-[#fe9a00]/30 selection:text-white">
      {/* Top Brand Bar */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between pb-6 border-b border-[rgba(255,255,255,0.07)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ffb454] to-[#fe9a00] flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-[#1a1203]" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-sm tracking-tight text-[#f0f2f5]">
              SENTINEL FLOW
            </span>
            <span className="text-[10px] font-mono text-[#9aa0a6] uppercase tracking-wider">
              AI INTRUSION DEFENSE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusDot status="live" label="TELEMETRY ACTIVE" />
          <Tag variant="neutral" size="sm">v2.0 GRAPHITE & AMBER</Tag>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center space-y-8 py-8">
        {/* Eyebrow & Hero Title */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Tag variant="amber" size="md">MISSION OPERATIONS & RED TEAM ARENA</Tag>
          </div>

          <h1 className="text-4xl sm:text-6xl font-display font-extrabold tracking-tight text-[#f0f2f5]">
            Sentinel Flow
          </h1>

          <p className="text-[#9aa0a6] text-xs sm:text-sm max-w-xl mx-auto leading-relaxed font-sans">
            Production-grade defensive intrusion detection engine. Real-time reverse proxy telemetry, 35 sliding-window streaming features, calibrated LightGBM inference, and cryptographic evidence verification.
          </p>
        </div>

        {/* Two-Column Entrance Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
          {/* Operator Console Card */}
          <Card className="hover:border-[#fe9a00]/40 transition-all cursor-pointer group" onClick={() => setShowLoginModal(true)}>
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-lg bg-[#2d1f0b] border border-[#fe9a00]/30 flex items-center justify-center text-[#fe9a00]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-[#f0f2f5] group-hover:text-[#ffb454] transition-colors">
                    Operator Console
                  </h2>
                  <Tag variant="amber" size="sm">BLUE TEAM</Tag>
                </div>
                <p className="text-xs text-[#9aa0a6] leading-relaxed">
                  Strictly defensive visibility: monitor telemetry, triage calibrated alerts, evaluate shadow models, and manage classroom exercise limits.
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                className="w-full justify-between"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLoginModal(true);
                }}
              >
                <span>Launch Mission Console</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Participant Arena Card */}
          <Card className="hover:border-[rgba(255,255,255,0.2)] transition-all cursor-pointer group" onClick={handleJoinParticipant}>
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-lg bg-[#16181c] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-[#ff7a45]">
                  <Swords className="w-5 h-5" />
                </div>
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-[#f0f2f5] group-hover:text-[#f0f2f5] transition-colors">
                    Participant Portal
                  </h2>
                  <Tag variant="neutral" size="sm">RED TEAM</Tag>
                </div>
                <p className="text-xs text-[#9aa0a6] leading-relaxed">
                  Join a live classroom exercise, select bounded attack vectors (T1110, T1046, T1499), monitor execution telemetry, and stay within quotas.
                </p>
              </div>

              <div className="space-y-2">
                <form onSubmit={handleJoinParticipant} className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    placeholder="ROOM CODE"
                    maxLength={10}
                    value={quickJoinCode}
                    onChange={(e) => setQuickJoinCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#090c10] border border-[rgba(255,255,255,0.1)] text-xs font-mono text-[#f0f2f5] uppercase placeholder-[#5f6368] focus:border-[#fe9a00] focus:outline-none"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="md"
                    className="shrink-0"
                  >
                    Join
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Architectural Stream Diagram (Collapsible) */}
        <div className="w-full flex flex-col items-center max-w-3xl">
          <div className="w-full flex justify-between items-center mb-2">
            <span className="text-[11px] font-mono text-[#5f6368] uppercase">PIPELINE ARCHITECTURE</span>
            <button
              type="button"
              onClick={() => setShowAnimation(!showAnimation)}
              className="text-[11px] text-[#9aa0a6] hover:text-[#ffb454] font-mono transition-colors flex items-center gap-1 focus:outline-none cursor-pointer"
            >
              {showAnimation ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAnimation ? "Hide Diagram" : "Show Diagram"}</span>
            </button>
          </div>

          {showAnimation && (
            <Suspense
              fallback={
                <div className="h-44 w-full rounded-xl bg-[#0f1013] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-xs text-[#5f6368] font-mono">
                  Loading Architectural Stream Diagram...
                </div>
              }
            >
              <div className="w-full rounded-xl overflow-hidden border border-[rgba(255,255,255,0.07)] bg-[#0f1013]">
                <LandingHeroAnimation />
              </div>
            </Suspense>
          )}
        </div>
      </main>

      {/* Operator Passcode Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090c10]/85 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#111417] border border-[rgba(255,255,255,0.12)] rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#f0f2f5] font-mono">
                <Lock className="w-4 h-4 text-[#fe9a00]" />
                <span>Operator Passcode Gate</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="text-[#9aa0a6] hover:text-[#f0f2f5] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOperatorLogin} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[#9aa0a6] text-xs">Operator Passcode</label>
                  <button
                    type="button"
                    onClick={() => setPasscode("SF-OPERATOR-2026")}
                    className="text-[10px] text-[#ffb454] hover:underline cursor-pointer"
                  >
                    Use Demo Secret
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="SF-OPERATOR-2026"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#090c10] border border-[rgba(255,255,255,0.1)] text-[#f0f2f5] text-xs focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00] focus:outline-none"
                />
                <div className="text-[10px] text-[#5f6368] font-sans">
                  Default operator secret: <span className="font-mono text-[#ffb454]">SF-OPERATOR-2026</span>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting}
                className="w-full justify-center"
              >
                {isSubmitting ? "Authenticating..." : "Authenticate as Operator"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-[11px] text-[#5f6368] font-mono border-t border-[rgba(255,255,255,0.07)] pt-4 max-w-5xl mx-auto w-full">
        Sentinel Flow v2.0 • Authoritative Defensive Security Monitoring • Space Grotesk & JetBrains Mono
      </footer>
    </div>
  );
}

import React, { useState, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Zap, Smartphone, Lock, Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/design/components/Button";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";

// Lazy load the 27KB hero animation so it does not block initial landing bundle
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

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.operatorLogin(passcode.trim() || "SF-OPERATOR-2026");
      sessionStorage.setItem("sf_role", "operator");
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

  const handleJoinParticipant = () => {
    sessionStorage.setItem("sf_role", "participant");
    navigate("/join");
  };

  return (
    <div className="min-h-screen bg-[#060b13] text-slate-100 flex flex-col justify-between py-8 px-4 selection:bg-cyan-500/30">
      <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center space-y-6">
        {/* Badge & Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>AI INTRUSION DETECTION & TELEMETRY PLATFORM</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white font-sans">
            Sentinel{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">
              Flow
            </span>
          </h1>

          <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed font-sans">
            Production-grade defensive security monitoring system. Real-time reverse proxy telemetry, 35 sliding-window streaming features, calibrated LightGBM inference, and cryptographic evidence verification.
          </p>
        </div>

        {/* Skippable Hero Animation */}
        <div className="w-full flex flex-col items-center">
          <div className="w-full flex justify-end mb-1">
            <button
              type="button"
              onClick={() => setShowAnimation(!showAnimation)}
              className="text-[11px] text-slate-400 hover:text-cyan-300 font-mono transition-colors flex items-center gap-1 focus:outline-none cursor-pointer"
            >
              {showAnimation ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAnimation ? "Hide Diagram" : "Show Diagram"}</span>
            </button>
          </div>

          {showAnimation && (
            <Suspense
              fallback={
                <div className="h-48 w-full rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-xs text-slate-500 font-mono">
                  Loading Architectural Stream Diagram...
                </div>
              }
            >
              <LandingHeroAnimation />
            </Suspense>
          )}
        </div>

        {/* Role Select Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={() => setShowLoginModal(true)}
            className="w-full justify-center text-xs font-bold font-mono uppercase tracking-wider py-3.5"
          >
            <Zap className="w-4 h-4 mr-2" />
            Launch as Operator
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={handleJoinParticipant}
            className="w-full justify-center text-xs font-bold font-mono uppercase tracking-wider py-3.5"
          >
            <Smartphone className="w-4 h-4 mr-2" />
            Join as Participant
          </Button>
        </div>
      </main>

      {/* Operator Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-100 font-mono">
                <Lock className="w-4 h-4 text-cyan-400" />
                <span>Operator Passcode Gate</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOperatorLogin} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[var(--text-muted)]">Passcode</label>
                  <button
                    type="button"
                    onClick={() => setPasscode("SF-OPERATOR-2026")}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-sans cursor-pointer"
                  >
                    Use Demo Passcode
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="SF-OPERATOR-2026"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                />
                <div className="text-[10px] text-[var(--text-muted)] font-sans">
                  Default operator passcode: <span className="font-mono text-cyan-300">SF-OPERATOR-2026</span>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting}
                className="w-full justify-center"
              >
                {isSubmitting ? "Verifying..." : "Authenticate as Operator"}
              </Button>
            </form>
          </div>
        </div>
      )}

      <footer className="text-center text-[11px] text-slate-500 font-mono">
        Sentinel Flow 3.0 • Defensive Autonomous Cyber Monitoring
      </footer>
    </div>
  );
}

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LandingHeroAnimation } from "../components/LandingHeroAnimation";

export function Landing({ onSelectRole, onOperatorLogin }) {
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOperatorSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setIsSubmitting(true);
    try {
      await onOperatorLogin(passcode);
      setShowPasscodeModal(false);
    } catch (err) {
      setLoginError(err.message || "Invalid operator passcode");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-6 px-4">
      {/* Hero Header */}
      <div className="text-center max-w-3xl space-y-3">
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold tracking-wide"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>GITAM UNIVERSITY · AI INTRUSION DETECTION DEMO</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-sans"
        >
          Sentinel <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">Flow</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-300 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed font-sans"
        >
          Real-time reverse proxy telemetry and multi-layer AI intrusion defense system.
          Observing and classifying live behavioral attack bursts from 60 audience devices in classroom simulations.
        </motion.p>
      </div>

      {/* Hero Animated Architectural Diagram (Section 4) */}
      <LandingHeroAnimation />

      {/* Primary Role Selector Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md"
      >
        <button
          onClick={() => setShowPasscodeModal(true)}
          className="w-full group relative px-6 py-3.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 hover:opacity-95 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center space-x-2"
        >
          <span>⚡ Launch as Operator</span>
          <span className="text-[10px] text-slate-800 font-semibold">(Instructor)</span>
        </button>

        <button
          onClick={() => onSelectRole("participant")}
          className="w-full px-6 py-3.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 shadow-md transition-all flex items-center justify-center space-x-2"
        >
          <span>📱 Join as Participant</span>
          <span className="text-[10px] text-slate-400 font-semibold">(Audience)</span>
        </button>
      </motion.div>

      {/* Operator Passcode Modal */}
      <AnimatePresence>
        {showPasscodeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">Operator Passcode Gate</h3>
                </div>
                <button
                  onClick={() => setShowPasscodeModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Enter the instructor passcode to unlock the Red Team Orchestrator, Live Heatmap, and telemetry controls.
              </p>

              <form onSubmit={handleOperatorSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1.5">
                    Operator Passcode
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter operator passcode (default: SF-OPERATOR-2026)"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm font-mono focus:border-cyan-400 focus:outline-none"
                    autoFocus
                  />
                </div>

                {loginError && (
                  <p className="text-xs text-rose-400 font-mono bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30">
                    ⚠ {loginError}
                  </p>
                )}

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPasscodeModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !passcode}
                    className="px-5 py-2.5 rounded-xl bg-cyan-400 text-slate-950 text-xs font-mono font-bold hover:bg-cyan-300 disabled:opacity-50 transition shadow-lg shadow-cyan-500/20"
                  >
                    {isSubmitting ? "Authenticating..." : "Unlock Operator Console →"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

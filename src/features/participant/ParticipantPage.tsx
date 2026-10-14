import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";
import { JoinForm } from "./components/JoinForm";
import { PersonalAssessment } from "./components/PersonalAssessment";
import { ActivitySimulator } from "./components/ActivitySimulator";
import { useChannel, useRealtimeEvent } from "@/realtime/useRealtime";
import { ArrowLeft, LogOut } from "lucide-react";

export default function ParticipantPage() {
  const [enrolled, setEnrolled] = useState<{
    joinCode: string;
    alias: string;
    deviceId: string;
    token: string;
  } | null>(null);

  const [assessment, setAssessment] = useState<{
    threatScore: number;
    threatLevel: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
    isControlledTarget: boolean;
    plainLanguageExplanation: string;
    requestsCount: number;
  }>({
    threatScore: 0.04,
    threatLevel: "LOW",
    isControlledTarget: false,
    plainLanguageExplanation: "Your requests conform to your personal baseline distribution. No threat observed.",
    requestsCount: 18,
  });

  // Fetch active classroom session code
  const [activeJoinCode, setActiveJoinCode] = useState<string>("");

  useEffect(() => {
    api.getSession()
      .then((data) => {
        if (data?.session?.join_code) {
          setActiveJoinCode(data.session.join_code);
        }
      })
      .catch(() => {});
  }, []);

  // Restore stored session if exists
  useEffect(() => {
    const token = sessionStorage.getItem("sf_session_token");
    const deviceId = sessionStorage.getItem("sf_device_fingerprint");
    const alias = sessionStorage.getItem("sf_participant_alias") || "Participant";
    if (token && deviceId) {
      setEnrolled({ joinCode: "ACTIVE", alias, deviceId, token });
    }
  }, []);

  // Listen to private WebSocket channel `participant:{deviceId}`
  useChannel(enrolled ? `participant:${enrolled.deviceId}` : "", (envelope) => {
    if (envelope.data) {
      const data = envelope.data;
      setAssessment((prev) => ({
        threatScore: data.threat_score ?? prev.threatScore,
        threatLevel: data.threat_level || (data.threat_score > 0.7 ? "HIGH" : "LOW"),
        isControlledTarget: Boolean(data.is_controlled_target),
        plainLanguageExplanation: data.plain_language || prev.plainLanguageExplanation,
        requestsCount: prev.requestsCount + 1,
      }));
    }
  });

  const handleJoin = async (joinCode: string, alias: string) => {
    try {
      const res = await api.joinSession(joinCode, alias);
      const enrolledData = {
        joinCode,
        alias: res.alias || alias,
        deviceId: res.device_id || `dev_${Date.now().toString().slice(-6)}`,
        token: res.session_token || "tok_participant",
      };
      sessionStorage.setItem("sf_session_token", enrolledData.token);
      sessionStorage.setItem("sf_device_fingerprint", enrolledData.deviceId);
      sessionStorage.setItem("sf_participant_alias", enrolledData.alias);
      setEnrolled(enrolledData);
      showToast.success("Device Enrolled", `Joined session with alias "${enrolledData.alias}".`);
    } catch (err: any) {
      showToast.error("Failed to Join", err?.message || "Invalid join code");
    }
  };

  const handleLeave = () => {
    sessionStorage.removeItem("sf_session_token");
    sessionStorage.removeItem("sf_device_fingerprint");
    sessionStorage.removeItem("sf_participant_alias");
    setEnrolled(null);
    showToast.info("Session Cleared", "You have left the classroom range.");
  };

  const handleSimulate = async (action: string, isBurst = false) => {
    if (!enrolled) return;
    try {
      await api.recordActivity(enrolled.deviceId, action, isBurst);
      setAssessment((prev) => ({ ...prev, requestsCount: prev.requestsCount + (isBurst ? 5 : 1) }));
      showToast.success("Activity Transmitted", `Logged ${action}`);
    } catch (err: any) {
      showToast.error("Activity Error", err?.message);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)] p-4 sm:p-6 flex flex-col justify-between selection:bg-cyan-500/30">
      {/* Top Navbar */}
      <header className="max-w-md mx-auto w-full flex items-center justify-between py-2 border-b border-[var(--border-subtle)] mb-4">
        <Link
          to="/"
          className="text-xs text-[var(--text-muted)] hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Portal</span>
        </Link>

        {enrolled && (
          <button
            type="button"
            onClick={handleLeave}
            className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave</span>
          </button>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center py-4">
        {!enrolled ? (
          <JoinForm onJoin={handleJoin} defaultJoinCode={activeJoinCode} />
        ) : (
          <div className="space-y-4">
            <PersonalAssessment
              alias={enrolled.alias}
              deviceId={enrolled.deviceId}
              threatScore={assessment.threatScore}
              threatLevel={assessment.threatLevel}
              isControlledTarget={assessment.isControlledTarget}
              plainLanguageExplanation={assessment.plainLanguageExplanation}
              requestsCount={assessment.requestsCount}
            />
            <ActivitySimulator onSimulateActivity={handleSimulate} />
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-[var(--text-muted)] py-4 font-mono">
        Sentinel Flow 3.0 • Private Channel Security Telemetry
      </footer>
    </div>
  );
}

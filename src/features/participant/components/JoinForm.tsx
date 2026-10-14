import React, { useState, useEffect } from "react";
import { Card } from "@/design/components/Card";
import { Button } from "@/design/components/Button";
import { ArrowRight, Shield, Sparkles } from "lucide-react";

export interface JoinFormProps {
  onJoin: (joinCode: string, alias: string) => Promise<void>;
  isJoining?: boolean;
  defaultJoinCode?: string;
  className?: string;
}

export function JoinForm({
  onJoin,
  isJoining = false,
  defaultJoinCode = "",
  className = "",
}: JoinFormProps) {
  const [joinCode, setJoinCode] = useState(defaultJoinCode || "SF-DEMO");
  const [alias, setAlias] = useState("");

  useEffect(() => {
    if (defaultJoinCode) {
      setJoinCode(defaultJoinCode);
    }
  }, [defaultJoinCode]);

  const handleQuickFill = () => {
    const randNum = Math.floor(Math.random() * 90) + 10;
    setAlias(`User-${randNum}`);
    if (defaultJoinCode) {
      setJoinCode(defaultJoinCode);
    } else {
      setJoinCode("SF-DEMO");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCode = joinCode.trim() || defaultJoinCode || "SF-DEMO";
    const effectiveAlias = alias.trim() || `User-${Math.floor(Math.random() * 90) + 10}`;
    onJoin(effectiveCode.toUpperCase(), effectiveAlias);
  };

  return (
    <Card className={`max-w-md mx-auto p-6 space-y-5 ${className}`}>
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mx-auto flex items-center justify-center">
          <Shield className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          Join Security Simulation
        </h1>
        <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
          Connect your device to the classroom cyber range to participate in real-time threat monitoring
        </p>
      </div>

      <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/20 text-[11px] text-cyan-300/90 leading-relaxed space-y-1">
        <div className="font-semibold text-cyan-300">💡 Participant Access Info:</div>
        <div>Participants do <strong className="text-white">not require a password</strong>. Simply choose any handle and join using the active room code.</div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-[var(--text-secondary)]">
              Classroom Join Code
            </label>
            <button
              type="button"
              onClick={() => setJoinCode(defaultJoinCode || "SF-DEMO")}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono inline-flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              Active: {defaultJoinCode || "SF-DEMO"}
            </button>
          </div>
          <input
            type="text"
            required
            placeholder={defaultJoinCode || "SF-DEMO"}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-sm uppercase text-cyan-300 placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500 tracking-wider text-center font-bold"
          />
          <div className="text-[11px] text-[var(--text-muted)] font-mono text-center">
            Accepted: <span className="text-cyan-400 font-bold">{defaultJoinCode || "SF-DEMO"}</span> (or <span className="text-slate-400">SF-DEMO</span>)
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-[var(--text-secondary)]">
              Participant Handle / Device Alias
            </label>
            <button
              type="button"
              onClick={handleQuickFill}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono cursor-pointer"
            >
              Quick-Fill Demo User
            </button>
          </div>
          <input
            type="text"
            required
            placeholder="e.g. Alice-Laptop or User-01"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isJoining}
          className="w-full justify-center text-sm font-semibold mt-2"
        >
          {isJoining ? (
            "Enrolling Device..."
          ) : (
            <span className="flex items-center gap-2">
              Join Range
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </Button>
      </form>
    </Card>
  );
}

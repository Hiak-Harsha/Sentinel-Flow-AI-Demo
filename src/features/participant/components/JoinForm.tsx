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
  const [joinCode, setJoinCode] = useState(defaultJoinCode);
  const [alias, setAlias] = useState("");

  useEffect(() => {
    if (defaultJoinCode && !joinCode) {
      setJoinCode(defaultJoinCode);
    }
  }, [defaultJoinCode, joinCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !alias.trim()) return;
    onJoin(joinCode.trim().toUpperCase(), alias.trim());
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

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-[var(--text-secondary)]">
              Classroom Join Code
            </label>
            {defaultJoinCode && (
              <button
                type="button"
                onClick={() => setJoinCode(defaultJoinCode)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                Active: {defaultJoinCode}
              </button>
            )}
          </div>
          <input
            type="text"
            required
            placeholder={defaultJoinCode || "SF-XXXX"}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-sm uppercase text-cyan-300 placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500 tracking-wider text-center font-bold"
          />
          {defaultJoinCode && (
            <div className="text-[11px] text-[var(--text-muted)] font-mono text-center">
              Current room code detected: <span className="text-cyan-400 font-bold">{defaultJoinCode}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="font-semibold text-[var(--text-secondary)]">
            Participant Handle / Device Alias
          </label>
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
          disabled={isJoining || !joinCode || !alias}
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

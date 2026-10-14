import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { Button } from "@/design/components/Button";
import { Dialog } from "@/design/components/Dialog";
import { Target, Plus, ShieldCheck, Lock } from "lucide-react";
import { showToast } from "@/design/components/Toast";

export function TargetInventoryManager() {
  const [origins, setOrigins] = useState<string[]>([
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
  ]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const [passcode, setPasscode] = useState("");

  const handleAuthorize = async () => {
    if (!newOrigin.trim()) return;
    try {
      const res = await fetch("/api/v1/targets/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator_passcode: passcode || "SF-OPERATOR-2026",
          target_origin: newOrigin.trim(),
          operator_name: "Lab Operator",
          confirmed_ownership: true,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Target authorization rejected");
      }

      setOrigins((prev) => [...prev, newOrigin.trim()]);
      setIsDialogOpen(false);
      setNewOrigin("");
      setPasscode("");
      showToast.success("Target Authorized", `Added ${newOrigin} to private boundary.`);
    } catch (err: any) {
      showToast.error("Authorization Failed", err?.message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Authorized Target Boundary (Allowlist)
          </CardTitle>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setIsDialogOpen(true)} className="text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Target
        </Button>
      </CardHeader>

      <CardContent className="pt-3 space-y-2 font-mono text-xs">
        {origins.map((origin) => (
          <div
            key={origin}
            className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-between"
          >
            <span className="text-slate-200">{origin}</span>
            <Badge variant="success" size="sm" className="font-sans">
              Private / Verified
            </Badge>
          </div>
        ))}
      </CardContent>

      {/* Authorize Target Modal */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Authorize Private Target Host"
        description="Add a loopback or RFC1918 private address to the simulation allowlist."
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAuthorize}>
              Authorize Host
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-[var(--text-secondary)]">Target Origin / IP</label>
            <input
              type="text"
              placeholder="http://192.168.1.50:8000"
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              className="w-full p-2.5 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[var(--text-secondary)]">Operator Passcode</label>
            <input
              type="password"
              placeholder="SF-OPERATOR-2026"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full p-2.5 rounded bg-[var(--surface-1)] border border-[var(--border-subtle)] font-mono text-slate-100"
            />
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

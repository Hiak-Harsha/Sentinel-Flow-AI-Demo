import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/design/components/Card";
import { Badge } from "@/design/components/Badge";
import { FileCheck, CheckCircle2 } from "lucide-react";

export function ConsentAuditViewer() {
  const records = [
    {
      id: "auth_01",
      target_origin: "http://127.0.0.1:8000",
      operator_name: "Lab Administrator",
      purpose: "Classroom SOC Training & Verification",
      timestamp: "2026-10-15T01:30:00Z",
      sha256_hash: "9f83a216f49e49cba92d3f78e12d99c4",
    },
    {
      id: "auth_02",
      target_origin: "http://localhost:8000",
      operator_name: "Lab Operator",
      purpose: "Local Loopback Defensive Evaluation",
      timestamp: "2026-10-15T02:00:00Z",
      sha256_hash: "28e04b77d61f4c7cb8120d0482b8a1c9",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-purple-400" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Cryptographic Consent & Authorization Audit Log
          </CardTitle>
        </div>
        <span className="text-xs text-emerald-400 font-mono inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Ledger Verified
        </span>
      </CardHeader>

      <CardContent className="p-0 divide-y divide-[var(--border-subtle)] font-mono text-xs">
        {records.map((r) => (
          <div key={r.id} className="p-3.5 hover:bg-[var(--surface-2)] transition-colors space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-100">{r.target_origin}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{r.timestamp}</span>
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] font-sans">
              Authorized by {r.operator_name} • Purpose: {r.purpose}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              Audit Signature: {r.sha256_hash}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

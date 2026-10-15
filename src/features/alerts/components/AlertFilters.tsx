import React from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, X } from "lucide-react";
import { Button } from "@/design/components/Button";

export interface AlertFilterValues {
  severity: string;
  status: string;
  query: string;
  scenario: string;
}

export function AlertFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const severity = searchParams.get("severity") || "ALL";
  const status = searchParams.get("status") || "ALL";
  const query = searchParams.get("q") || "";
  const scenario = searchParams.get("scenario") || "ALL";

  const updateParam = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val === "ALL" || !val) {
      next.delete(key);
    } else {
      next.set(key, val);
    }
    setSearchParams(next, { replace: true });
  };

  const clearAll = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const hasActiveFilters = severity !== "ALL" || status !== "ALL" || query !== "" || scenario !== "ALL";

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#0f1013] border border-[rgba(255,255,255,0.07)] text-xs">
      {/* Search Bar */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6368]" />
        <input
          type="text"
          placeholder="Filter by identity, technique, or rule..."
          value={query}
          onChange={(e) => updateParam("q", e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#111417] border border-[rgba(255,255,255,0.08)] text-xs text-[#f0f2f5] placeholder-[#5f6368] focus:outline-none focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00]"
        />
      </div>

      {/* Select Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Severity */}
        <select
          value={severity}
          onChange={(e) => updateParam("severity", e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-[#111417] border border-[rgba(255,255,255,0.08)] text-xs text-[#f0f2f5] focus:outline-none focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00] cursor-pointer"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="ELEVATED">Elevated</option>
          <option value="LOW">Low</option>
          <option value="INFO">Info</option>
        </select>

        {/* Status / Disposition */}
        <select
          value={status}
          onChange={(e) => updateParam("status", e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-[#111417] border border-[rgba(255,255,255,0.08)] text-xs text-[#f0f2f5] focus:outline-none focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00] cursor-pointer"
        >
          <option value="ALL">All Dispositions</option>
          <option value="OPEN">Open (New)</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="RESOLVED">Resolved / Contained</option>
          <option value="FALSE_POSITIVE">False Positive</option>
        </select>

        {/* Scenario */}
        <select
          value={scenario}
          onChange={(e) => updateParam("scenario", e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-[#111417] border border-[rgba(255,255,255,0.08)] text-xs text-[#f0f2f5] focus:outline-none focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00] cursor-pointer"
        >
          <option value="ALL">All Scenarios</option>
          <option value="credential_stuffing">Brute Force (T1110)</option>
          <option value="port_scan">Port Scan (T1046)</option>
          <option value="burst_dos">Burst DoS (T1499)</option>
          <option value="canary_probe">Canary Probe (T1190)</option>
        </select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-[11px] text-[#9aa0a6] hover:text-[#f4526b] flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset</span>
          </Button>
        )}
      </div>
    </div>
  );
}

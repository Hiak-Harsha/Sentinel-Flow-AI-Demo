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
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-xs">
      {/* Search Bar */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Filter by identity, technique, or rule..."
          value={query}
          onChange={(e) => updateParam("q", e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {/* Select Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Severity */}
        <select
          value={severity}
          onChange={(e) => updateParam("severity", e.target.value)}
          className="px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="ELEVATED">Elevated</option>
          <option value="LOW">Low</option>
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => updateParam("status", e.target.value)}
          className="px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="RESOLVED">Resolved</option>
          <option value="FALSE_POSITIVE">False Positive</option>
        </select>

        {/* Scenario */}
        <select
          value={scenario}
          onChange={(e) => updateParam("scenario", e.target.value)}
          className="px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
        >
          <option value="ALL">All Scenarios</option>
          <option value="brute_force">Brute Force (T1110)</option>
          <option value="credential_stuffing">Credential Stuffing (T1110.004)</option>
          <option value="slow_loris">Slow Loris (T1498)</option>
          <option value="data_exfil">Data Exfiltration (T1048)</option>
        </select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7 px-2">
            <X className="w-3 h-3 mr-1" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

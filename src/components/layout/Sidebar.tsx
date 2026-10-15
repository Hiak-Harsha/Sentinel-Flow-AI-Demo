import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldAlert,
  Swords,
  Cpu,
  BarChart3,
  Network,
  Sliders,
  Users,
  Palette,
  Shield,
} from "lucide-react";
import { Tooltip } from "@/design/components/Tooltip";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";

export interface SidebarProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed = false,
  onNavigate,
  className = "",
}) => {
  // Query active alerts count
  const { data: alerts } = useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => api.getActiveAlerts().catch(() => []),
  });

  const activeAlertsCount = Array.isArray(alerts)
    ? alerts.filter((a) => (a.status || "ACTIVE").toUpperCase() === "ACTIVE").length
    : 0;

  const role = typeof sessionStorage !== "undefined"
    ? (sessionStorage.getItem("sf_role") || "operator")
    : "operator";

  const operatorNavItems = [
    { to: "/overview", label: "Overview", icon: LayoutDashboard },
    {
      to: "/alerts",
      label: "Alerts",
      icon: ShieldAlert,
      badge: activeAlertsCount > 0 ? activeAlertsCount : null,
      badgeColor: "bg-rose-500 text-white",
    },
    { to: "/attack-console", label: "Red Team Activity", icon: Swords },
    { to: "/models", label: "Model Registry", icon: Cpu },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/devices", label: "Network Topology", icon: Network },
    { to: "/settings", label: "Settings", icon: Sliders },
    { to: "/design", label: "Design System", icon: Palette },
  ];

  const participantNavItems = [
    { to: "/join", label: "Participant App", icon: Users },
    { to: "/attack-console", label: "Red Team Scenarios", icon: Swords },
    { to: "/design", label: "Design System", icon: Palette },
  ];

  const navItems = role === "participant" ? participantNavItems : operatorNavItems;

  return (
    <aside
      className={`flex flex-col bg-slate-950/90 border-r border-slate-800/80 backdrop-blur-md transition-all duration-200 select-none ${
        collapsed ? "w-16" : "w-60"
      } ${className}`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800/80 gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-sm text-slate-100 tracking-tight whitespace-nowrap">
              SENTINEL FLOW
            </span>
            <span className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase">
              DEFENSE OPS v3.0
            </span>
          </div>
        )}
      </div>

      {/* Nav List */}
      <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;

          const linkContent = (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
                } ${collapsed ? "justify-center px-0" : ""}`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate">{item.label}</span>
              )}
              {!collapsed && item.badge !== null && item.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold sf-tabular ${item.badgeColor || "bg-cyan-500 text-slate-950"}`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.to} content={item.label} side="right">
                {linkContent}
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </nav>

      {/* Role / Operator Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
        {!collapsed ? (
          <div className="flex items-center justify-between text-xs">
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">Active Mode</span>
              <span className="text-xs font-semibold text-slate-200 capitalize font-mono">
                {role}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
              v2.0
            </span>
          </div>
        ) : (
          <div className="flex justify-center text-[10px] font-mono text-slate-500">
            v2
          </div>
        )}
      </div>
    </aside>
  );
};

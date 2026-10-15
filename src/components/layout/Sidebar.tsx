import React, { useState, useEffect } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Tooltip } from "@/design/components/Tooltip";
import { Tag } from "@/design/components/Tag";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/realtime/queryClient";
import { api } from "@/lib/api";

export interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed: controlledCollapsed,
  onToggleCollapse,
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

  const isOperator = role === "operator";

  const operatorNavItems = [
    { to: "/overview", label: "Overview", icon: LayoutDashboard },
    {
      to: "/alerts",
      label: "Alerts",
      icon: ShieldAlert,
      badge: activeAlertsCount > 0 ? activeAlertsCount : null,
      badgeColor: "bg-[#f4526b] text-[#ffffff]",
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

  const navItems = isOperator ? operatorNavItems : participantNavItems;

  return (
    <aside
      className={`flex flex-col bg-[#090c10] border-r border-[rgba(255,255,255,0.07)] transition-all duration-200 select-none z-20 ${
        controlledCollapsed ? "w-[72px]" : "w-[232px]"
      } ${className}`}
    >
      {/* Brand Header (56px) */}
      <div className="h-14 flex items-center px-4 border-b border-[rgba(255,255,255,0.07)] gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ffb454] to-[#fe9a00] flex items-center justify-center shadow-sm shrink-0">
          <Shield className="w-4 h-4 text-[#1a1203]" />
        </div>
        {!controlledCollapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-display font-bold text-xs tracking-tight text-[#f0f2f5] whitespace-nowrap">
              SENTINEL FLOW
            </span>
            <span className="text-[10px] font-mono text-[#9aa0a6] tracking-wider uppercase">
              {isOperator ? "MISSION CONSOLE" : "RED TEAM PORTAL"}
            </span>
          </div>
        )}
      </div>

      {/* Nav List */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;

          const linkContent = (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fe9a00] ${
                  isActive
                    ? "bg-[#2d1f0b] text-[#ffb454] font-semibold border border-[#fe9a00]/40"
                    : "text-[#9aa0a6] hover:text-[#f0f2f5] hover:bg-[#111417]"
                } ${controlledCollapsed ? "justify-center px-0 h-10 w-full" : ""}`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Authoritative 3px Left Accent Bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[#fe9a00] rounded-r" />
                  )}
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#fe9a00]" : "text-[#9aa0a6] group-hover:text-[#f0f2f5]"}`} />
                  {!controlledCollapsed && (
                    <span className="flex-1 truncate tracking-tight">{item.label}</span>
                  )}
                  {!controlledCollapsed && item.badge !== null && item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold sf-tabular ${
                        item.badgeColor || "bg-[#fe9a00] text-[#1a1203]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );

          if (controlledCollapsed) {
            return (
              <Tooltip key={item.to} content={item.label} side="right">
                {linkContent}
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </nav>

      {/* Rail Collapse Toggle & Role Indicator Footer */}
      <div className="p-2 border-t border-[rgba(255,255,255,0.07)] bg-[#0f1013] flex items-center justify-between">
        {!controlledCollapsed ? (
          <div className="flex items-center justify-between w-full px-1">
            <div className="flex items-center gap-2">
              <Tag variant={isOperator ? "amber" : "neutral"} size="sm">
                {role.toUpperCase()}
              </Tag>
              <span className="text-[11px] font-mono text-[#5f6368]">v2.0</span>
            </div>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1 rounded-md text-[#5f6368] hover:text-[#f0f2f5] hover:bg-[#16181c] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fe9a00]"
                title="Collapse sidebar (72px rail)"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-full flex justify-center">
            {onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-md text-[#5f6368] hover:text-[#f0f2f5] hover:bg-[#16181c] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fe9a00]"
                title="Expand sidebar (232px)"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            ) : (
              <span className="text-[10px] font-mono text-[#5f6368]">v2</span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

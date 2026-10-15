import React, { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { Toast } from "@/design/components/Toast";
import { Drawer } from "@/design/components/Drawer";
import { setupRealtimeQuerySync } from "@/realtime/querySync";
import { realtimeClient } from "@/realtime/RealtimeClient";
import { useRealtimeEvent } from "@/realtime/useRealtime";
import {
  LayoutDashboard,
  ShieldAlert,
  Swords,
  Cpu,
  Palette,
} from "lucide-react";

export const AppLayout: React.FC = () => {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [timeRange, setTimeRange] = useState("Live");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("sf_sidebar_collapsed");
      return saved === "true";
    }
    return false;
  });
  const [screenSize, setScreenSize] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const [liveAnnouncement, setLiveAnnouncement] = useState<{ message: string; priority: "polite" | "assertive" } | null>(null);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("sf_sidebar_collapsed", String(next));
      }
      return next;
    });
  };

  // Resize listener for breakpoint tracking
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize("mobile");
      } else if (width < 1280) {
        setScreenSize("tablet");
      } else {
        setScreenSize("desktop");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize Realtime WebSocket Connection & Query Synchronization
  useEffect(() => {
    const cleanupSync = setupRealtimeQuerySync();
    realtimeClient.connect();

    return () => {
      cleanupSync();
    };
  }, []);

  // Accessibility aria-live alert handler
  useRealtimeEvent("alert.raised", (envelope) => {
    const alert = envelope.data?.alert || envelope.data;
    if (alert) {
      const sev = (alert.severity || "LOW").toUpperCase();
      const isCritical = sev === "CRITICAL" || sev === "HIGH";
      setLiveAnnouncement({
        message: `New ${sev} alert: ${alert.title || "Threat detected"} on identity ${alert.identity_id || "target"}`,
        priority: isCritical ? "assertive" : "polite",
      });
    }
  });

  const isCollapsed = screenSize === "tablet" || sidebarCollapsed;

  return (
    <div className="min-h-screen bg-[#090c10] text-[#f0f2f5] flex flex-col font-sans selection:bg-[#fe9a00]/30 selection:text-[#ffffff]">
      {/* Accessible aria-live regions */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement?.priority === "polite" ? liveAnnouncement.message : ""}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement?.priority === "assertive" ? liveAnnouncement.message : ""}
      </div>

      <div className="flex flex-1 w-full overflow-hidden pb-14 md:pb-0">
        {/* Desktop / Tablet Sidebar */}
        <Sidebar
          collapsed={isCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          className="hidden md:flex shrink-0 sticky top-0 h-screen"
        />

        {/* Mobile Navigation Drawer */}
        <Drawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          title="Sentinel Flow Navigation"
          side="left"
          width="max-w-xs"
        >
          <Sidebar
            collapsed={false}
            onNavigate={() => setMobileDrawerOpen(false)}
            className="w-full border-none bg-transparent"
          />
        </Drawer>

        {/* Main Application Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Bar (56px) */}
          <TopBar
            onToggleSidebar={() => setMobileDrawerOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />

          {/* Content Area with Max Width Container */}
          <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Responsive Bottom Navigation Bar (<768px screens) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#090c10] border-t border-[rgba(255,255,255,0.07)] flex items-center justify-around px-2 z-40 select-none">
        {[
          { to: "/overview", label: "Overview", icon: LayoutDashboard },
          { to: "/alerts", label: "Alerts", icon: ShieldAlert },
          { to: "/attack-console", label: "Red Team", icon: Swords },
          { to: "/models", label: "Models", icon: Cpu },
          { to: "/design", label: "Design", icon: Palette },
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-mono transition-colors ${
                isActive
                  ? "text-[#fe9a00] font-semibold"
                  : "text-[#9aa0a6] hover:text-[#f0f2f5]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-5 h-5 mb-0.5 ${isActive ? "text-[#fe9a00]" : "text-[#5f6368]"}`} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {/* Global Toast */}
      <Toast />
    </div>
  );
};

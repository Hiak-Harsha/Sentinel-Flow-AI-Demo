import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { Toast } from "@/design/components/Toast";
import { Drawer } from "@/design/components/Drawer";
import { setupRealtimeQuerySync } from "@/realtime/querySync";
import { realtimeClient } from "@/realtime/RealtimeClient";
import { useRealtimeEvent } from "@/realtime/useRealtime";

export const AppLayout: React.FC = () => {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [timeRange, setTimeRange] = useState("Live");
  const [screenSize, setScreenSize] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const [liveAnnouncement, setLiveAnnouncement] = useState<{ message: string; priority: "polite" | "assertive" } | null>(null);

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
      // Keep socket open during app lifecycle
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

  return (
    <div className="min-h-screen bg-[#060b13] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
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

      <div className="flex flex-1 w-full overflow-hidden">
        {/* Desktop / Tablet Sidebar */}
        <Sidebar
          collapsed={screenSize === "tablet"}
          className="hidden md:flex shrink-0 sticky top-0 h-screen"
        />

        {/* Mobile Navigation Drawer */}
        <Drawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          title="Navigation"
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
          {/* Top Bar */}
          <TopBar
            onToggleSidebar={() => setMobileDrawerOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />

          {/* Content Area with Max Width Container */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {/* Global Sonner Toaster */}
      <Toast />
    </div>
  );
};

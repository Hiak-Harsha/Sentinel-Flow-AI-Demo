import { useState } from "react";
import { ThreatBadge } from "./shared";

export function Navigation({
  activeTab,
  setActiveTab,
  session,
  threatLevel,
  wsStatus,
  devicesCount = 0,
  activeAlertsCount = 0,
  onNewSession,
  isBusy,
  role = "operator",
  onLogout,
  sidebarOpen,
  setSidebarOpen,
  searchQuery,
  setSearchQuery,
}) {
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const joinCode = session?.join_code || (session?.id ? `SF-${session.id.slice(0, 4).toUpperCase()}` : "SF-DEMO");

  const navItems = [
    {
      id: "overview",
      label: "Dashboard",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: "alerts",
      label: "Alerts",
      badge: activeAlertsCount > 0 ? activeAlertsCount : null,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      id: "live",
      label: "Traffic Monitor",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: "analytics",
      label: "Analysis",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "history",
      label: "Reports",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "model",
      label: "Rules",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    {
      id: "devices",
      label: "System",
      badge: devicesCount > 0 ? `${devicesCount}` : null,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
    },
    {
      id: "attack",
      label: "Lab Runs",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
    {
      id: "targets",
      label: "Settings",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Sidebar for Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 transform bg-[#0d121f] border-r border-[#1a2337] transition-transform duration-200 ease-in-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } flex flex-col justify-between`}
      >
        <div>
          {/* Logo Header */}
          <div className="flex h-16 items-center px-6 gap-3 border-b border-[#182032]">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-violet-700 shadow-md shadow-indigo-500/30">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black tracking-wider text-white font-mono">NIDS</span>
              <span className="text-[10px] text-purple-400 font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                AI
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1.5 mt-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    if (setSidebarOpen) setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? "text-white" : "text-slate-400"}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: System Status + Version */}
        <div className="p-4 border-t border-[#182032] space-y-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div>
              <div className="text-[11px] font-bold text-white leading-tight">System Status</div>
              <div className="text-[10px] text-emerald-400 font-medium">All systems operational</div>
            </div>
          </div>
          <div className="text-center text-[10px] font-mono text-slate-500">Version 2.1.0</div>
        </div>
      </aside>

      {/* Backdrop for Mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 h-16 bg-[#0b0f19]/90 border-b border-[#182032] backdrop-blur-xl md:pl-60 transition-all">
        <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Left: Hamburger & Search Input */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors md:hidden"
              aria-label="Toggle Navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Search Input matching Reference Image */}
            <div className="relative w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search alerts, IPs, CVEs..."
                value={searchQuery || ""}
                onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[#111726] border border-[#1c2438] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Right Controls: Session Status, Threat Badge, Notifications, Admin Profile */}
          <div className="flex items-center gap-3">
            {/* Session Join Code Pill */}
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/5 bg-[#111726] px-3 py-1 text-xs font-mono">
              <span className="text-slate-400 text-[10px]">CODE:</span>
              <span className="font-bold text-cyan-300">{joinCode}</span>
            </div>

            {/* Threat Badge */}
            <div className="hidden lg:block">
              <ThreatBadge level={threatLevel} />
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Notifications"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {activeAlertsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[#1c2438] bg-[#111726] p-3 shadow-2xl z-50 text-xs">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                    <span className="font-bold text-white">System Notifications</span>
                    <span className="text-[10px] text-slate-400 font-mono">{activeAlertsCount} active alerts</span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {activeAlertsCount === 0 ? (
                      <div className="py-4 text-center text-slate-500">Zero active security threats</div>
                    ) : (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        Intrusion detection flagged active attack vectors. Review in Alerts Workbench.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Settings Icon */}
            <button
              type="button"
              onClick={() => setActiveTab("targets")}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors hidden sm:block"
              title="Target Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Admin Profile Dropdown matching Reference */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-white/5 transition-all text-xs"
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-[11px] shadow-sm">
                  AD
                </div>
                <span className="font-semibold text-slate-200 hidden sm:inline">Admin</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {adminMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[#1c2438] bg-[#111726] p-2 shadow-2xl z-50 text-xs">
                  <div className="px-3 py-2 border-b border-white/5">
                    <div className="font-bold text-white">Lead Security Operator</div>
                    <div className="text-[10px] text-slate-400 font-mono">admin@sentinelflow.ai</div>
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        onNewSession && onNewSession();
                        setAdminMenuOpen(false);
                      }}
                      disabled={isBusy}
                      className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2"
                    >
                      <span>↻</span> Initialize New Session
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onLogout && onLogout();
                        setAdminMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2"
                    >
                      <span>↪</span> Switch Role / Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

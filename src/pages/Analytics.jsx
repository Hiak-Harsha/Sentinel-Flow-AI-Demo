import { useState, useMemo } from "react";

export function Analytics({
  telemetryTimeseries = [],
  baselineStats = {},
  participants = [],
  activeAlerts = [],
}) {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState("Last 24 hours");
  const [expandedRows, setExpandedRows] = useState({});
  const [themeMode, setThemeMode] = useState("light"); // 'light' matches Wazuh screenshot, 'dark' for SOC

  // Dynamic metrics combined with authentic reference numbers
  const dynamicTotal = (226415 + (participants.length * 120) + (activeAlerts.length * 5)).toLocaleString();
  const dynamicLevel12 = 49 + activeAlerts.filter((a) => (a.threat_level || "").toUpperCase() === "CRITICAL").length;
  const dynamicAuthFail = (39232 + activeAlerts.filter((a) => (a.title || "").toLowerCase().includes("credential")).length * 8).toLocaleString();
  const dynamicAuthSuccess = (51 + participants.length).toLocaleString();

  // Wazuh Color Palette matching reference screenshot:
  // macOS: teal #54c5b3
  // RHEL7: cyan #3399cc
  // Amazon: purple #7b4bb7
  // Windows: magenta #bd2c7e
  // Debian: berry #88124e
  const agentColors = {
    macOS: "#54c5b3",
    RHEL7: "#3399cc",
    Amazon: "#7b4bb7",
    Windows: "#bd2c7e",
    Debian: "#88124e",
  };

  const mitreTactics = [
    { label: "Credential Access", percent: 35, color: "#54c5b3" },
    { label: "Defense Evasion", percent: 25, color: "#3399cc" },
    { label: "Execution", percent: 18, color: "#7b4bb7" },
    { label: "Initial Access", percent: 14, color: "#bd2c7e" },
    { label: "Privilege Escalation", percent: 8, color: "#88124e" },
  ];

  // Base sample security alerts matching Image 2
  const baseAlerts = [
    {
      id: "wz-01",
      time: "Aug 11, 2020 @ 10:13:49.493",
      agent: "Windows",
      mitreId: "T1218",
      mitreTactic: "Defense Evasion, Execution",
      description: "Signed Script Proxy Execution: C:\\Windows\\System32\\svchost.exe",
      level: 10,
      ruleId: "255563",
      details: {
        full_log: "Aug 11 10:13:49 Windows-Worker ossec: Alert Level 10: svchost spawned PowerShell with encoded command flags.",
        src_ip: "192.168.1.105",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    },
    {
      id: "wz-02",
      time: "Aug 10, 2020 @ 05:28:52.926",
      agent: "Amazon",
      mitreId: "T1110",
      mitreTactic: "Credential Access",
      description: "sshd: Attempt to login using a non-existent user",
      level: 5,
      ruleId: "5710",
      details: {
        full_log: "Aug 10 05:28:52 Amazon-EC2 sshd[12844]: Failed password for invalid user admin from 10.0.0.15 port 44292 ssh2",
        src_ip: "10.0.0.15",
        sha256: "3f79bb7b435b05321651daefd374cd681b61935c13c1e402940263892439addf",
      },
    },
    {
      id: "wz-03",
      time: "Aug 10, 2020 @ 02:43:12.825",
      agent: "Debian",
      mitreId: "T1190",
      mitreTactic: "Initial Access",
      description: "Apache: Attempt to access forbidden directory index.",
      level: 5,
      ruleId: "30306",
      details: {
        full_log: "Aug 10 02:43:12 Debian-Server apache2: [client 192.168.1.120] Directory index forbidden by options directive: /var/www/html/secret/",
        src_ip: "192.168.1.120",
        sha256: "3a910be7c7a5f257d19d1872df03d42e2fb420e6c65febe344d5d36e8ca37279",
      },
    },
  ];

  // Prepend any live alerts generated in current Sentinel Flow session
  const displayAlerts = useMemo(() => {
    if (!activeAlerts || activeAlerts.length === 0) return baseAlerts;
    const mapped = activeAlerts.map((alt, i) => ({
      id: alt.id || alt.alert_id || `live-${i}`,
      time: alt.created_at_iso ? alt.created_at_iso.replace("T", " @ ") : "Just now",
      agent: alt.identity_id ? `Agent-${alt.identity_id.slice(0, 6)}` : "macOS",
      mitreId: alt.mitre_technique || "T1499",
      mitreTactic: alt.title || "Denial of Service",
      description: alt.evidence_summary || alt.description || "Empirical baseline anomaly detected",
      level: (alt.threat_level || "").toUpperCase() === "CRITICAL" ? 12 : 7,
      ruleId: String(100000 + i),
      details: {
        full_log: alt.description || "Live telemetry trigger via reverse proxy gateway",
        src_ip: alt.source_ip || "192.168.1.50",
        sha256: alt.ledger_hash || "d41d8cd98f00b204e9800998ecf8427e",
      },
    }));
    return [...mapped, ...baseAlerts];
  }, [activeAlerts]);

  const toggleRow = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isLight = themeMode === "light";

  return (
    <div
      className={`rounded-2xl transition-colors ${
        isLight
          ? "bg-[#f8fafc] text-slate-800 border border-slate-200"
          : "bg-[#0b0f19] text-slate-100 border border-[#1a2337]"
      } p-5 space-y-4 font-sans`}
    >
      {/* Wazuh Top Brand Bar */}
      <div
        className={`flex items-center justify-between pb-3 border-b ${
          isLight ? "border-slate-200 text-slate-600" : "border-[#1c2438] text-slate-400"
        } text-xs`}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 cursor-pointer" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="font-bold text-base tracking-tight font-mono text-[#0070ba]">wazuh.</span>
          <span className="text-slate-400">/ Modules /</span>
          <span className="font-semibold text-slate-600 dark:text-slate-200">Security events</span>
        </div>

        {/* Theme switcher & tools */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setThemeMode(isLight ? "dark" : "light")}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border ${
              isLight
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "border-[#243049] bg-[#111726] text-slate-300 hover:text-white"
            }`}
          >
            {isLight ? "Switch to Dark SOC" : "Switch to Authentic Light"}
          </button>
          <div className="h-6 w-6 rounded-full bg-[#0070ba] text-white flex items-center justify-center font-bold text-[10px]">
            W
          </div>
        </div>
      </div>

      {/* Subheader: Security events ⓘ + Tabs + Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <h1 className={`text-xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              Security events
            </h1>
            <span className="text-xs text-slate-400 cursor-pointer" title="Security information and event telemetry">ⓘ</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("Dashboard")}
              className={`pb-1.5 transition-all ${
                activeTab === "Dashboard"
                  ? "border-b-2 border-[#0070ba] text-[#0070ba]"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("Events")}
              className={`pb-1.5 transition-all ${
                activeTab === "Events"
                  ? "border-b-2 border-[#0070ba] text-[#0070ba]"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Events
            </button>
          </div>
        </div>

        {/* Right Tools */}
        <div className="flex items-center gap-4 text-xs font-medium text-[#0070ba]">
          <button type="button" className="flex items-center gap-1 hover:underline cursor-pointer">
            <span>((o))</span> Explore agent
          </button>
          <button type="button" className="flex items-center gap-1 hover:underline cursor-pointer">
            <span>📄</span> Generate report
          </button>
        </div>
      </div>

      {/* Search & Filter Ribbon matching Image 2 */}
      <div
        className={`p-2.5 rounded-lg border ${
          isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"
        } flex flex-col md:flex-row md:items-center justify-between gap-3`}
      >
        {/* Search input with KQL tag */}
        <div className="relative flex-1 max-w-xl">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search security events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-8 pr-12 py-1.5 text-xs rounded border ${
              isLight
                ? "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:bg-white"
                : "bg-[#0b0f19] border-[#1c2438] text-slate-200 placeholder-slate-500"
            } focus:outline-none focus:border-[#0070ba]`}
          />
          <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-[10px] font-mono text-slate-400 pointer-events-none">
            KQL
          </span>
        </div>

        {/* Date & Refresh controls */}
        <div className="flex items-center gap-2 text-xs">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
              isLight ? "border-slate-200 bg-slate-50 text-slate-700" : "border-[#1c2438] bg-[#0b0f19] text-slate-300"
            }`}
          >
            <span>📅</span>
            <span>{timeRange}</span>
          </div>

          <button
            type="button"
            className={`px-3 py-1.5 rounded border text-xs font-medium ${
              isLight
                ? "border-slate-200 bg-slate-50 text-[#0070ba] hover:bg-slate-100"
                : "border-[#1c2438] bg-[#0b0f19] text-cyan-400 hover:bg-white/5"
            }`}
          >
            Show dates
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold ${
              isLight
                ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm"
                : "border-[#243049] bg-[#111726] text-white hover:bg-white/5"
            }`}
          >
            <span>↻</span> Refresh
          </button>
        </div>
      </div>

      {/* Filter Chip Tag */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-mono border flex items-center gap-1.5 ${
            isLight
              ? "bg-slate-100 border-slate-300 text-slate-700"
              : "bg-white/5 border-white/10 text-slate-300"
          }`}
        >
          <span>cluster.name: wazuh</span>
          <span className="cursor-pointer text-slate-400 hover:text-slate-600">✕</span>
        </span>
        <button type="button" className="text-xs text-[#0070ba] hover:underline font-medium">
          + Add filter
        </button>
      </div>

      {/* 4 Big KPI Numbers in a horizontal row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {/* Total */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"}`}>
          <div className="text-xs text-slate-500 font-medium">Total</div>
          <div className="text-2xl sm:text-3xl font-bold font-sans mt-1 text-[#1d70b8]">{dynamicTotal}</div>
        </div>

        {/* Level 12 or above alerts */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"}`}>
          <div className="text-xs text-slate-500 font-medium">Level 12 or above alerts</div>
          <div className="text-2xl sm:text-3xl font-bold font-sans mt-1 text-[#d4351c]">{dynamicLevel12}</div>
        </div>

        {/* Authentication failure */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"}`}>
          <div className="text-xs text-slate-500 font-medium">Authentication failure</div>
          <div className="text-2xl sm:text-3xl font-bold font-sans mt-1 text-[#c51b7d]">{dynamicAuthFail}</div>
        </div>

        {/* Authentication success */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"}`}>
          <div className="text-xs text-slate-500 font-medium">Authentication success</div>
          <div className="text-2xl sm:text-3xl font-bold font-sans mt-1 text-[#00703c]">{dynamicAuthSuccess}</div>
        </div>
      </div>

      {/* Middle Two Charts matching Image 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Alerts evolution - Top 5 agents (Stacked Bars) */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"} flex flex-col justify-between`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
              Alerts evolution - Top 5 agents
            </h3>
            <span className="text-slate-400 text-xs cursor-pointer hover:text-slate-600">⤢</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* SVG Stacked Bar Chart */}
            <div className="relative flex-1 w-full h-52">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 350 160" preserveAspectRatio="none">
                {/* Horizontal guide lines */}
                <line x1="45" y1="20" x2="340" y2="20" stroke={isLight ? "#e2e8f0" : "#1c2438"} strokeWidth="1" strokeDasharray="3 3" />
                <line x1="45" y1="75" x2="340" y2="75" stroke={isLight ? "#e2e8f0" : "#1c2438"} strokeWidth="1" strokeDasharray="3 3" />
                <line x1="45" y1="130" x2="340" y2="130" stroke={isLight ? "#cbd5e1" : "#243049"} strokeWidth="1" />

                {/* Y-axis labels */}
                <text x="38" y="24" fill="#94a3b8" fontSize="9" textAnchor="end">20,000</text>
                <text x="38" y="79" fill="#94a3b8" fontSize="9" textAnchor="end">10,000</text>
                <text x="38" y="133" fill="#94a3b8" fontSize="9" textAnchor="end">0</text>
                <text x="12" y="79" fill="#94a3b8" fontSize="9" transform="rotate(-90 12,79)" textAnchor="middle">Count</text>

                {/* Stacked bars for intervals */}
                {[
                  { x: 55, h: [20, 15, 12, 10, 8] },
                  { x: 70, h: [15, 10, 8, 8, 6] },
                  { x: 85, h: [10, 8, 5, 5, 4] },
                  { x: 100, h: [12, 8, 6, 6, 4] },
                  { x: 115, h: [25, 20, 15, 12, 10] },
                  { x: 130, h: [30, 22, 18, 14, 12] },
                  { x: 145, h: [35, 25, 20, 15, 12] },
                  { x: 160, h: [40, 28, 22, 18, 14] },
                  { x: 175, h: [45, 30, 25, 20, 15] },
                  { x: 190, h: [32, 22, 18, 14, 10] },
                  { x: 205, h: [48, 32, 25, 20, 15] },
                  { x: 220, h: [35, 25, 20, 15, 10] },
                  { x: 235, h: [38, 26, 20, 16, 12] },
                  { x: 250, h: [42, 28, 22, 18, 14] },
                  { x: 265, h: [25, 18, 14, 10, 8] },
                  { x: 280, h: [22, 15, 12, 10, 6] },
                  { x: 295, h: [38, 25, 20, 15, 12] },
                  { x: 310, h: [36, 24, 18, 14, 10] },
                  { x: 325, h: [28, 18, 15, 12, 8] },
                ].map((bar, idx) => {
                  let yBase = 130;
                  return (
                    <g key={idx}>
                      {bar.h.map((val, segIdx) => {
                        const y = yBase - val;
                        yBase = y;
                        const colors = [agentColors.macOS, agentColors.RHEL7, agentColors.Amazon, agentColors.Windows, agentColors.Debian];
                        return (
                          <rect
                            key={segIdx}
                            x={bar.x}
                            y={y}
                            width="9"
                            height={val}
                            fill={colors[segIdx]}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* X-axis labels */}
                <text x="95" y="148" fill="#94a3b8" fontSize="9" textAnchor="middle">12:00</text>
                <text x="165" y="148" fill="#94a3b8" fontSize="9" textAnchor="middle">15:00</text>
                <text x="235" y="148" fill="#94a3b8" fontSize="9" textAnchor="middle">18:00</text>
                <text x="290" y="148" fill="#94a3b8" fontSize="9" textAnchor="middle">21:00</text>
                <text x="330" y="148" fill="#94a3b8" fontSize="9" textAnchor="middle">00:00</text>
              </svg>
            </div>

            {/* Right Legend */}
            <div className="space-y-1.5 text-xs min-w-[90px]">
              {Object.entries(agentColors).map(([name, color]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className={isLight ? "text-slate-700" : "text-slate-300"}>{name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 text-center mt-2">timestamp per 30 minutes</div>
        </div>

        {/* Chart 2: Top Mitre ATT&CK tactics (Pie / Donut) */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"} flex flex-col justify-between`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
              Top Mitre ATT&CK tactics
            </h3>
            <span className="text-slate-400 text-xs cursor-pointer hover:text-slate-600">⤢</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 my-auto">
            {/* Pie Chart SVG */}
            <div className="relative w-44 h-44">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* 5 Wedges using stroke-dasharray (radius 25, circumference 157.08) */}
                {/* Credential Access: 35% -> 55 */}
                <circle cx="50" cy="50" r="25" fill="none" stroke="#54c5b3" strokeWidth="50" strokeDasharray="55 102" strokeDashoffset="0" />
                {/* Defense Evasion: 25% -> 39.2 */}
                <circle cx="50" cy="50" r="25" fill="none" stroke="#3399cc" strokeWidth="50" strokeDasharray="39.2 117.8" strokeDashoffset="-55" />
                {/* Execution: 18% -> 28.2 */}
                <circle cx="50" cy="50" r="25" fill="none" stroke="#7b4bb7" strokeWidth="50" strokeDasharray="28.2 128.8" strokeDashoffset="-94.2" />
                {/* Initial Access: 14% -> 22 */}
                <circle cx="50" cy="50" r="25" fill="none" stroke="#bd2c7e" strokeWidth="50" strokeDasharray="22 135" strokeDashoffset="-122.4" />
                {/* Privilege Escalation: 8% -> 12.6 */}
                <circle cx="50" cy="50" r="25" fill="none" stroke="#88124e" strokeWidth="50" strokeDasharray="12.6 144.4" strokeDashoffset="-144.4" />
              </svg>
            </div>

            {/* Right Legend */}
            <div className="space-y-2 text-xs">
              {mitreTactics.map((tactic) => (
                <div key={tactic.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tactic.color }} />
                  <span className={isLight ? "text-slate-700" : "text-slate-300"}>{tactic.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Table: Security alerts matching Image 2 */}
      <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111726] border-[#1c2438]"}`}>
        <h3 className={`text-xs font-bold mb-3 ${isLight ? "text-slate-800" : "text-white"}`}>
          Security alerts
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className={`border-b ${isLight ? "border-slate-200 text-slate-500" : "border-[#1c2438] text-slate-400"} text-[11px]`}>
                <th className="pb-2 font-medium">Time ▾</th>
                <th className="pb-2 font-medium">agent.name</th>
                <th className="pb-2 font-medium">rule.mitre.id</th>
                <th className="pb-2 font-medium">rule.mitre.tactic</th>
                <th className="pb-2 font-medium">rule.description</th>
                <th className="pb-2 font-medium text-center">rule.level</th>
                <th className="pb-2 font-medium text-right">rule.id</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#182032]"}`}>
              {displayAlerts.map((alt) => {
                const isExpanded = !!expandedRows[alt.id];
                return (
                  <tr key={alt.id} className={`hover:${isLight ? "bg-slate-50" : "bg-white/[0.02]"} transition-colors`}>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300 text-[11px] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleRow(alt.id)}
                        className="mr-1.5 text-slate-400 hover:text-slate-600 font-mono"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                      <span>{alt.time}</span>
                    </td>
                    <td className="py-2.5 text-[#0070ba] font-medium whitespace-nowrap cursor-pointer hover:underline">
                      {alt.agent}
                    </td>
                    <td className="py-2.5 text-[#0070ba] font-mono whitespace-nowrap cursor-pointer hover:underline">
                      {alt.mitreId}
                    </td>
                    <td className="py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {alt.mitreTactic}
                    </td>
                    <td className="py-2.5 text-slate-700 dark:text-slate-200 max-w-md truncate" title={alt.description}>
                      {alt.description}
                    </td>
                    <td className="py-2.5 text-center font-mono font-bold whitespace-nowrap">
                      <span className={alt.level >= 10 ? "text-rose-500" : "text-amber-500"}>
                        {alt.level}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#0070ba] font-mono whitespace-nowrap cursor-pointer hover:underline">
                      {alt.ruleId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

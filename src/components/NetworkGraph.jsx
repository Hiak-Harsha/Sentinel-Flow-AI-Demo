import React, { useEffect, useRef, useState } from "react";

/**
 * Real-time Canvas-rendered force-directed network topology graph.
 * Displays the protected target application at the core, connected to
 * active participant devices and attack agents. Nodes pulse on activity
 * and glow red on active alert.
 */
export function NetworkGraph({
  identities = [],
  activeAlerts = [],
  trafficLogs = [],
  selectedId = null,
  onSelectNode = () => {},
  targetOrigin = "Target Application",
}) {
  const canvasRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  // Simulation physics state
  const nodesRef = useRef([]);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Resize canvas to match display size
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Build node list
    const centerNode = {
      id: "target_core",
      label: "TARGET APP",
      sublabel: targetOrigin.replace(/^https?:\/\//, ""),
      isTarget: true,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      radius: 28,
      color: "#fe9a00",
    };

    // Alert lookup
    const alertMap = new Map();
    activeAlerts.forEach((a) => {
      alertMap.set(a.identity_id, a);
    });

    // Map identities to surrounding nodes
    const surrounding = identities.map((idObj, idx) => {
      const id = typeof idObj === "string" ? idObj : idObj.device_id || idObj.identity_id || `node_${idx}`;
      const alias = idObj.alias || id;
      const alert = alertMap.get(id);

      // Distribute evenly around circle initially
      const angle = (idx / Math.max(1, identities.length)) * Math.PI * 2;
      const dist = 140 + (idx % 3) * 35;
      const initialX = width / 2 + Math.cos(angle) * dist;
      const initialY = height / 2 + Math.sin(angle) * dist;

      // Color coding
      let color = "#38bdf8"; // Normal blue
      if (alert) {
        color = alert.threat_level === "CRITICAL" ? "#f43f5e" : "#f59e0b";
      } else if (id.includes("bot") || id.includes("attacker")) {
        color = "#e11d48";
      }

      return {
        id,
        label: alias,
        isTarget: false,
        x: initialX,
        y: initialY,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        targetX: initialX,
        targetY: initialY,
        radius: alert ? 18 : 14,
        color,
        hasAlert: Boolean(alert),
        alertSeverity: alert?.threat_level || "NORMAL",
        threatScore: alert?.threat_score || 0.05,
      };
    });

    const allNodes = [centerNode, ...surrounding];
    nodesRef.current = allNodes;

    // Animation Loop
    let pulseAngle = 0;
    const render = () => {
      pulseAngle += 0.04;
      ctx.clearRect(0, 0, width, height);

      // Draw subtle orbital rings
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      [140, 180, 220].forEach((r) => {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // 1. Draw Links from nodes to center
      surrounding.forEach((node) => {
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(centerNode.x, centerNode.y);

        if (node.hasAlert) {
          ctx.strokeStyle = "rgba(244, 63, 94, 0.35)";
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = "rgba(255, 180, 84, 0.15)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();

        // Animated packet particle on link
        const t = (pulseAngle * 0.8 + node.x * 0.01) % 1;
        const px = node.x + (centerNode.x - node.x) * t;
        const py = node.y + (centerNode.y - node.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = node.hasAlert ? "#f43f5e" : "#ffb454";
        ctx.fill();
      });

      // 2. Draw Nodes
      allNodes.forEach((node) => {
        const isSelected = selectedId === node.id;
        const isHovered = hoveredNode === node.id;

        // Outer glow
        if (node.hasAlert || node.isTarget || isSelected || isHovered) {
          const glowRadius = node.radius + (node.hasAlert ? 8 + Math.sin(pulseAngle * 3) * 4 : 6);
          const grad = ctx.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, glowRadius);
          grad.addColorStop(0, node.color);
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main node body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.isTarget ? "#0f172a" : "#090d16";
        ctx.fill();
        ctx.lineWidth = node.isTarget ? 3 : isSelected ? 3 : 2;
        ctx.strokeStyle = node.color;
        ctx.stroke();

        // Center dot / icon
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.isTarget ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Label
        ctx.font = node.isTarget ? "bold 11px Inter, sans-serif" : "10px 'JetBrains Mono', monospace";
        ctx.fillStyle = node.hasAlert ? "#fca5a5" : "#e2e8f0";
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + node.radius + 14);

        if (node.sublabel) {
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillStyle = "#64748b";
          ctx.fillText(node.sublabel, node.x, node.y + node.radius + 25);
        }
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [identities, activeAlerts, selectedId, hoveredNode, targetOrigin]);

  // Click & hover detection
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let hit = null;
    nodesRef.current.forEach((n) => {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 5) {
        hit = n.id;
      }
    });
    setHoveredNode(hit);
  };

  const handleClick = (e) => {
    if (hoveredNode && hoveredNode !== "target_core") {
      onSelectNode(hoveredNode);
    }
  };

  return (
    <div className="relative w-full h-95 bg-[var(--bg)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xl">
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-3 text-xs">
        <span className="flex items-center text-[var(--accent)] font-mono font-semibold">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping mr-2"></span>
          TOPOLOGY RADAR
        </span>
        <span className="text-slate-500 font-mono">|</span>
        <span className="text-slate-400 font-mono">{identities.length} Active Nodes</span>
      </div>

      <div className="absolute top-3 right-4 z-10 flex items-center space-x-3 text-xs font-mono">
        <span className="flex items-center text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span> Normal
        </span>
        <span className="flex items-center text-rose-400">
          <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5 animate-pulse"></span> Alert
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        className="w-full h-full cursor-crosshair block"
      />
    </div>
  );
}

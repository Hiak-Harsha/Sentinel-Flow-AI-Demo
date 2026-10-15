import React, { useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldAlert,
  Swords,
  Cpu,
  BarChart3,
  Sliders,
  Users,
  Palette,
  PowerOff,
  RotateCcw,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { showToast } from "@/design/components/Toast";
import { Kbd } from "@/design/components/Kbd";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  if (!open) return null;

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  const handleEmergencyStop = async () => {
    try {
      await api.orchestrator.emergencyStop();
      showToast.error("Emergency Stop Engaged", "All active attacks and simulated traffic halted.");
    } catch (err: any) {
      showToast.error("Emergency Stop Failed", err?.message);
    }
  };

  const handleResetEmergencyStop = async () => {
    try {
      await api.orchestrator.resetEmergencyStop();
      showToast.success("Emergency Stop Reset", "Normal telemetry operations resumed.");
    } catch (err: any) {
      showToast.error("Reset Failed", err?.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 flex items-start justify-center">
      {/* Dimmed backdrop without blur */}
      <div
        className="fixed inset-0 bg-[#090c10]/80 transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-xl rounded-xl bg-[#111417] border border-[rgba(255,255,255,0.12)] shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
        <Command label="Global Command Menu" className="w-full">
          <div className="flex items-center px-4 border-b border-[rgba(255,255,255,0.08)] bg-[#0f1013]">
            <Search className="w-4 h-4 text-[#5f6368] mr-2 shrink-0" />
            <Command.Input
              placeholder="Type a command or jump to page..."
              className="w-full h-12 bg-transparent text-[#f0f2f5] text-sm placeholder:text-[#5f6368] focus:outline-none"
            />
            <Kbd>ESC</Kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2 text-xs">
            <Command.Empty className="py-6 text-center text-[#5f6368]">
              No matching commands or pages found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="text-[#5f6368] font-mono font-medium px-2 py-1.5 uppercase text-[10px] tracking-wider">
              <Command.Item
                onSelect={() => runCommand(() => navigate("/overview"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-[#ffb454]" />
                <span>Overview Dashboard</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/alerts"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <ShieldAlert className="w-4 h-4 text-[#f4526b]" />
                <span>Alerts Workbench</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/attack-console"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <Swords className="w-4 h-4 text-[#ff7a45]" />
                <span>Red Team Activity</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/models"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <Cpu className="w-4 h-4 text-[#5aa9ff]" />
                <span>Model Registry & Shadow Mode</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/analytics"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <BarChart3 className="w-4 h-4 text-[#3ddc97]" />
                <span>Security Analytics</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/settings"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <Sliders className="w-4 h-4 text-[#9aa0a6]" />
                <span>System Settings</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/join"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <Users className="w-4 h-4 text-[#ffb454]" />
                <span>Participant Portal</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/design"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#ffb454] cursor-pointer select-none transition-colors"
              >
                <Palette className="w-4 h-4 text-[#e9c46a]" />
                <span>Design System Showcase</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Operator Actions" className="text-[#5f6368] font-mono font-medium px-2 py-1.5 uppercase text-[10px] tracking-wider mt-2 border-t border-[rgba(255,255,255,0.08)]">
              <Command.Item
                onSelect={() => runCommand(handleEmergencyStop)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f4526b] hover:bg-[#2b1218] hover:text-[#f4526b] cursor-pointer select-none transition-colors"
              >
                <PowerOff className="w-4 h-4 text-[#f4526b]" />
                <span>Engage Emergency Stop</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(handleResetEmergencyStop)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#f0f2f5] hover:bg-[#16181c] hover:text-[#3ddc97] cursor-pointer select-none transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-[#3ddc97]" />
                <span>Reset Emergency Stop</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};

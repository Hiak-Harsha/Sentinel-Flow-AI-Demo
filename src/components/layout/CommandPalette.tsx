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
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
        <Command label="Global Command Menu" className="w-full">
          <div className="flex items-center px-4 border-b border-slate-800">
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <Command.Input
              placeholder="Type a command or search pages..."
              className="w-full h-12 bg-transparent text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none"
            />
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2 text-xs">
            <Command.Empty className="py-6 text-center text-slate-400">
              No matching commands or pages found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="text-slate-500 font-semibold px-2 py-1.5 uppercase text-[10px] tracking-wider">
              <Command.Item
                onSelect={() => runCommand(() => navigate("/overview"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <LayoutDashboard className="w-4 h-4 text-cyan-400" />
                <span>Overview Dashboard</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/alerts"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Alerts Workbench</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/attack-console"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <Swords className="w-4 h-4 text-amber-400" />
                <span>Attack Console</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/models"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>Model Registry & Shadow Mode</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/analytics"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Security Analytics</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/settings"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <Sliders className="w-4 h-4 text-slate-400" />
                <span>System Settings</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/join"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <Users className="w-4 h-4 text-sky-400" />
                <span>Participant Portal</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate("/design"))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <Palette className="w-4 h-4 text-pink-400" />
                <span>Design System Showcase</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Operator Actions" className="text-slate-500 font-semibold px-2 py-1.5 uppercase text-[10px] tracking-wider mt-2 border-t border-slate-800/60">
              <Command.Item
                onSelect={() => runCommand(handleEmergencyStop)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 cursor-pointer select-none"
              >
                <PowerOff className="w-4 h-4 text-rose-500" />
                <span>Engage Emergency Stop</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(handleResetEmergencyStop)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer select-none"
              >
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <span>Reset Emergency Stop</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};

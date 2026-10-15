import React, { useEffect } from "react";
import { X } from "lucide-react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  side?: "right" | "left" | "bottom";
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  side = "right",
  width = "max-w-xl",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const positionClasses = {
    right: `right-0 top-0 bottom-0 w-full ${width} border-l`,
    left: `left-0 top-0 bottom-0 w-full ${width} border-r`,
    bottom: `bottom-0 left-0 right-0 w-full max-h-[85vh] border-t rounded-t-2xl`,
  }[side];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 transition-opacity duration-200 animate-in fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed z-50 bg-[var(--surface-1)] border-[var(--border)] shadow-2xl flex flex-col transition-transform duration-200 animate-in ${
          side === "right"
            ? "slide-in-from-right"
            : side === "left"
            ? "slide-in-from-left"
            : "slide-in-from-bottom"
        } ${positionClasses}`}
      >
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">{title}</h3>
            {description && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe9a00]"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
};

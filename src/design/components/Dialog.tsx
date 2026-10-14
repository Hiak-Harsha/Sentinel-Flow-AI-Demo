import React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  maxWidth = "lg",
}) => {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <RadixDialog.Content
          className={`fixed left-[50%] top-[50%] z-50 w-full ${maxWidthMap[maxWidth]} translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl duration-200 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95`}
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <RadixDialog.Title className="text-lg font-bold text-slate-100 tracking-tight">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </RadixDialog.Close>
          </div>

          {description && (
            <RadixDialog.Description className="mt-3 text-sm text-slate-400">
              {description}
            </RadixDialog.Description>
          )}

          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};

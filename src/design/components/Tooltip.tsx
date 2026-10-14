import React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 200,
}) => {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          {children}
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={4}
            className="z-50 px-2.5 py-1 text-xs font-medium text-slate-100 bg-slate-900 border border-slate-700/80 rounded-md shadow-lg select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          >
            {content}
            <RadixTooltip.Arrow className="fill-slate-900" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
};

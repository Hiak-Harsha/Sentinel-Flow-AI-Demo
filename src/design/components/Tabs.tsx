import React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";

export interface TabsProps extends RadixTabs.TabsProps {
  items: {
    value: string;
    label: React.ReactNode;
    content: React.ReactNode;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
  }[];
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  defaultValue,
  value,
  onValueChange,
  className = "",
  ...props
}) => {
  const initialValue = defaultValue || items[0]?.value;

  return (
    <RadixTabs.Root
      defaultValue={initialValue}
      value={value}
      onValueChange={onValueChange}
      className={`flex flex-col w-full ${className}`}
      {...props}
    >
      <RadixTabs.List className="flex items-center gap-1 p-1 bg-slate-900/80 border border-slate-800 rounded-xl overflow-x-auto">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-slate-400 rounded-lg transition-all select-none hover:text-slate-200 hover:bg-slate-800/60 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300 data-[state=active]:font-semibold data-[state=active]:border data-[state=active]:border-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer"
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge && <span className="ml-1">{item.badge}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          value={item.value}
          className="mt-4 focus-visible:outline-none"
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
};

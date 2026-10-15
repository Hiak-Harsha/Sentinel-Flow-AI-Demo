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
      <RadixTabs.List className="flex items-center gap-1 p-1 bg-[#0f1013] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-x-auto">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-[#9aa0a6] rounded-lg transition-all select-none hover:text-[#f0f2f5] hover:bg-[#16181c] data-[state=active]:bg-[#2d1f0b] data-[state=active]:text-[#ffb454] data-[state=active]:font-semibold data-[state=active]:border data-[state=active]:border-[#fe9a00]/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fe9a00] cursor-pointer"
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

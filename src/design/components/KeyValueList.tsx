import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export interface KeyValueItem {
  key: string;
  label: React.ReactNode;
  value: React.ReactNode;
  copyable?: string;
  mono?: boolean;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  columns?: 1 | 2;
  className?: string;
}

export const KeyValueList: React.FC<KeyValueListProps> = ({
  items,
  columns = 1,
  className = "",
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div
      className={`grid gap-2.5 ${
        columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
      } ${className}`}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs"
        >
          <span className="text-slate-400 font-medium">{item.label}</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-slate-200 font-medium ${
                item.mono ? "font-mono sf-tabular" : ""
              }`}
            >
              {item.value}
            </span>
            {item.copyable && (
              <button
                type="button"
                onClick={() => handleCopy(item.key, item.copyable!)}
                className="text-slate-500 hover:text-cyan-400 transition-colors p-1 rounded hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                title="Copy to clipboard"
                aria-label={`Copy ${item.key}`}
              >
                {copiedKey === item.key ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

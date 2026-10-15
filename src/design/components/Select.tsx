import React, { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: string;
  size?: "sm" | "md";
  mono?: boolean;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      size = "md",
      mono = false,
      options,
      children,
      className = "",
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    const heightClass = size === "sm" ? "h-8 text-xs pl-2.5 pr-8" : "h-9.5 text-sm pl-3 pr-9";

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-mono font-medium tracking-wider uppercase text-[#9aa0a6]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={`w-full appearance-none rounded-lg bg-[#0f1013] border ${
              error ? "border-[#f4526b]" : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]"
            } ${heightClass} text-[#f0f2f5] ${
              mono ? "font-mono sf-tabular" : "font-sans"
            } transition-all duration-150 focus:outline-none focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="bg-[#111417] text-[#f0f2f5]"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="absolute right-3 pointer-events-none flex items-center justify-center text-[#5f6368]">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error && (
          <span className="text-[11px] font-mono text-[#f4526b] flex items-center gap-1">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span className="text-[11px] text-[#5f6368]">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

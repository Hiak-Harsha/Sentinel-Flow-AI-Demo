import React, { forwardRef } from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: string;
  size?: "sm" | "md";
  mono?: boolean;
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      size = "md",
      mono = false,
      leftAdornment,
      rightAdornment,
      className = "",
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    const heightClass = size === "sm" ? "h-8 text-xs px-2.5" : "h-9.5 text-sm px-3";

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-mono font-medium tracking-wider uppercase text-[#9aa0a6]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {leftAdornment && (
            <div className="absolute left-3 pointer-events-none flex items-center justify-center text-[#5f6368]">
              {leftAdornment}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`w-full rounded-lg bg-[#0f1013] border ${
              error ? "border-[#f4526b]" : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]"
            } ${heightClass} ${
              leftAdornment ? "pl-9" : ""
            } ${rightAdornment ? "pr-9" : ""} text-[#f0f2f5] placeholder-[#5f6368] ${
              mono ? "font-mono sf-tabular" : "font-sans"
            } transition-all duration-150 focus:outline-none focus:border-[#fe9a00] focus:ring-1 focus:ring-[#fe9a00] disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightAdornment && (
            <div className="absolute right-3 pointer-events-none flex items-center justify-center text-[#5f6368]">
              {rightAdornment}
            </div>
          )}
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

Input.displayName = "Input";

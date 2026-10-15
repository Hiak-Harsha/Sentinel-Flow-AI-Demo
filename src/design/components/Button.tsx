import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "outline" | "ghost" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

const variantStyles: Record<ButtonVariant, string> = {
  // Authoritative warm amber primary action
  primary: "bg-[#fe9a00] hover:bg-[#ffb454] text-[#1a1203] font-semibold shadow-sm hover:shadow-[0_0_15px_rgba(254,154,0,0.3)] active:translate-y-px",
  // Restrained dark graphite surface with hairline border
  secondary: "bg-[#111417] hover:bg-[#16181c] text-[#e9edf2] border border-white/10 hover:border-white/20 active:translate-y-px",
  // Strict non-amber destructive action
  destructive: "bg-[#f4526b] hover:bg-[#ff637b] text-white font-medium shadow-sm hover:shadow-[0_0_12px_rgba(244,82,107,0.3)] active:translate-y-px",
  outline: "bg-transparent hover:bg-[#16181c] text-[#e9edf2] border border-white/15 active:translate-y-px",
  ghost: "bg-transparent hover:bg-[#16181c] text-[#9aa4b2] hover:text-[#e9edf2]",
  // Accent brand button (mapped to primary amber solid, avoiding cyan/indigo gradients)
  accent: "bg-[#fe9a00] hover:bg-[#ffb454] text-[#1a1203] font-semibold shadow-sm hover:shadow-[0_0_15px_rgba(254,154,0,0.3)] active:translate-y-px",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs gap-1.5 rounded-[8px]",
  md: "px-3.5 py-1.5 text-sm gap-2 rounded-[8px]",
  lg: "px-5 py-2.5 text-base gap-2.5 rounded-[8px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconPosition = "left",
  children,
  className = "",
  ...props
}, ref) => {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe9a00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c10] disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {children}
        </>
      ) : (
        <>
          {icon && iconPosition === "left" && <span className="inline-flex shrink-0">{icon}</span>}
          {children}
          {icon && iconPosition === "right" && <span className="inline-flex shrink-0">{icon}</span>}
        </>
      )}
    </button>
  );
});

Button.displayName = "Button";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon: React.ReactNode;
  "aria-label": string;
}

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: "w-7 h-7 text-xs rounded-[8px]",
  md: "w-9 h-9 text-sm rounded-[8px]",
  lg: "w-11 h-11 text-base rounded-[8px]",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  variant = "ghost",
  size = "md",
  icon,
  className = "",
  disabled,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe9a00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c10] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles[variant]} ${iconSizeStyles[size]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
});

IconButton.displayName = "IconButton";

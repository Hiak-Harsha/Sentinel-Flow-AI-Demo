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
  primary: "bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold shadow-sm hover:shadow-cyan-500/20 active:translate-y-px",
  secondary: "bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 active:translate-y-px",
  destructive: "bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-sm hover:shadow-rose-600/20 active:translate-y-px",
  outline: "bg-transparent hover:bg-slate-800/60 text-slate-200 border border-slate-700 active:translate-y-px",
  ghost: "bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-white",
  accent: "bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold shadow-md shadow-cyan-500/25 active:translate-y-px",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs gap-1.5 rounded-md",
  md: "px-3.5 py-1.5 text-sm gap-2 rounded-lg",
  lg: "px-5 py-2.5 text-base gap-2.5 rounded-xl",
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
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
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
  sm: "w-7 h-7 text-xs rounded-md",
  md: "w-9 h-9 text-sm rounded-lg",
  lg: "w-11 h-11 text-base rounded-xl",
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
      className={`inline-flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles[variant]} ${iconSizeStyles[size]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
});

IconButton.displayName = "IconButton";

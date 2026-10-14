import React, { forwardRef } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glass" | "bordered" | "interactive";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = "default",
  className = "",
  children,
  ...props
}, ref) => {
  const variantStyles = {
    default: "bg-slate-900/70 border border-slate-800/80 shadow-md",
    glass: "bg-slate-900/50 backdrop-blur-md border border-white/10 shadow-lg",
    bordered: "bg-slate-950/80 border border-slate-700/80",
    interactive: "bg-slate-900/70 border border-slate-800/80 shadow-md hover:border-cyan-500/40 hover:bg-slate-800/60 transition-all duration-200 cursor-pointer",
  }[variant];

  return (
    <div
      ref={ref}
      className={`rounded-xl overflow-hidden ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = "Card";

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <div className={`p-4 md:p-5 border-b border-slate-800/60 flex items-center justify-between gap-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <h3 className={`font-semibold text-slate-100 text-sm md:text-base tracking-tight flex items-center gap-2 ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <p className={`text-xs text-slate-400 mt-0.5 ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <div className={`p-4 md:p-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <div className={`p-4 border-t border-slate-800/60 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400 ${className}`} {...props}>
    {children}
  </div>
);

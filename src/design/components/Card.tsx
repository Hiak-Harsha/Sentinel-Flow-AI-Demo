import React, { forwardRef } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "raised" | "bordered" | "interactive";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = "default",
  className = "",
  children,
  ...props
}, ref) => {
  const variantStyles = {
    // Surface-1 (#0f1013) with hairline border
    default: "bg-[#0f1013] border border-white/[0.07]",
    // Surface-2 (#111417)
    raised: "bg-[#111417] border border-white/[0.09]",
    bordered: "bg-[#0f1013] border border-white/[0.14]",
    // Interactive hover surface-3 (#16181c) with amber accent border hover
    interactive: "bg-[#0f1013] border border-white/[0.07] hover:border-white/[0.18] hover:bg-[#16181c] transition-colors duration-150 cursor-pointer",
  }[variant];

  return (
    <div
      ref={ref}
      className={`rounded-[12px] overflow-hidden ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = "Card";

export interface HeroCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export const HeroCard = forwardRef<HTMLDivElement, HeroCardProps>(({
  glow = false,
  className = "",
  children,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={`rounded-[20px] bg-[#0f1013] border border-white/[0.08] ${
        glow ? "shadow-[0_0_50px_rgba(254,154,0,0.06)]" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

HeroCard.displayName = "HeroCard";

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <div className={`p-4 md:p-5 border-b border-white/[0.06] flex items-center justify-between gap-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <h3 className={`font-semibold text-[#e9edf2] text-sm md:text-base tracking-tight flex items-center gap-2 font-display ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <p className={`text-xs text-[#9aa4b2] mt-0.5 ${className}`} {...props}>
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
  <div className={`p-4 border-t border-white/[0.06] bg-[#090c10]/40 flex items-center justify-between text-xs text-[#9aa4b2] ${className}`} {...props}>
    {children}
  </div>
);

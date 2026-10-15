import React from "react";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({ children, className = "", ...props }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#9aa0a6] bg-[#16181c] border border-[rgba(255,255,255,0.1)] rounded shadow-sm select-none tracking-tight ${className}`}
      {...props}
    >
      {children}
    </kbd>
  );
};

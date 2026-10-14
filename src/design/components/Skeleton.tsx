import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  circle = false,
  className = "",
  style,
  ...props
}) => {
  const dynamicStyle: React.CSSProperties = {
    ...style,
    width: width !== undefined ? width : undefined,
    height: height !== undefined ? height : undefined,
  };

  return (
    <div
      aria-hidden="true"
      style={dynamicStyle}
      className={`animate-pulse bg-slate-800/80 ${circle ? "rounded-full" : "rounded-md"} ${className}`}
      {...props}
    />
  );
};

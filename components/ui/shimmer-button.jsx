"use client";
import { cn } from "@/lib/utils";

export function ShimmerButton({
  children,
  shimmerColor = "rgba(255,255,255,0.4)",
  shimmerDuration = "1.8s",
  background = "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  className,
  onClick,
  ...props
}) {
  return (
    <>
      <style>{`
        @keyframes shimmer-slide {
          0%   { transform: translateX(-100%) skewX(-20deg); }
          100% { transform: translateX(200%) skewX(-20deg); }
        }
        @keyframes pulse-shadow {
          0%, 100% { box-shadow: 0 6px 24px rgba(37,99,235,.4); }
          50%       { box-shadow: 0 6px 36px rgba(37,99,235,.7), 0 0 0 10px rgba(37,99,235,.08); }
        }
      `}</style>
      <button
        className={cn("shimmer-btn", className)}
        onClick={onClick}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          border: 0,
          borderRadius: 10,
          padding: "13px 22px",
          fontWeight: 900,
          fontSize: 15,
          background,
          color: "#fff",
          cursor: "pointer",
          overflow: "hidden",
          animation: `pulse-shadow 2.2s ease-in-out infinite`,
        }}
        {...props}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
            width: "40%",
            animationName: "shimmer-slide",
            animationDuration: shimmerDuration,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDelay: "0.5s",
          }}
        />
        <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          {children}
        </span>
      </button>
    </>
  );
}

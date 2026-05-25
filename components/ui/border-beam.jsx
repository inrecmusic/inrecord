"use client";

export function BorderBeam({
  size = 300,
  duration = 8,
  delay = 0,
  colorFrom = "transparent",
  colorTo = "#60a5fa",
  borderWidth = 1.5,
}) {
  const id = `bb-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <>
      <style>{`
        @keyframes ${id}-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          padding: `${borderWidth}px`,
          background: "transparent",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: `${size}px`,
            height: `${size}px`,
            marginLeft: `-${size / 2}px`,
            marginTop: `-${size / 2}px`,
            background: `conic-gradient(from 0deg, ${colorFrom} 0%, ${colorFrom} 60%, ${colorTo} 80%, ${colorFrom} 100%)`,
            animationName: `${id}-spin`,
            animationDuration: `${duration}s`,
            animationDelay: `-${delay}s`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        />
      </div>
    </>
  );
}

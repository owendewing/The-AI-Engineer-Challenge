"use client";
import React, { useEffect, useState } from "react";

// Forest green color
const FOREST_GREEN = "#1B4332";

const NUM_LINES = 7;
const LINE_SPACING = 120;

function getLinePath(i: number, x: number, y: number, width: number) {
  const amplitude = 60 + i * 12;
  const phase = i * 0.5;
  const dx = x * amplitude;
  const dy = y * amplitude;
  const yPos = LINE_SPACING * (i + 1) + dy;
  return `M 0 ${yPos} Q ${width / 2} ${yPos + dx - 40 * Math.sin(phase + x * 2)}, ${width} ${yPos}`;
}

export default function AnimatedBackground() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    updateSize();
    window.addEventListener('resize', updateSize);
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      setMouse({ x, y });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return (
    <svg
      width={windowSize.width}
      height={windowSize.height}
      viewBox={`0 0 ${windowSize.width} ${windowSize.height}`}
      className="fixed inset-0 w-screen h-screen pointer-events-none select-none z-0"
      style={{ position: "fixed", top: 0, left: 0, zIndex: 0, width: '100vw', height: '100vh', background: 'rgba(245,245,220,0.1)' }}
    >
      {[...Array(NUM_LINES)].map((_, i) => (
        <path
          key={i}
          d={getLinePath(i, mouse.x, mouse.y, windowSize.width)}
          stroke={FOREST_GREEN}
          strokeWidth={2 + i * 0.5}
          opacity={0.10 + i * 0.04}
          fill="none"
        />
      ))}
    </svg>
  );
} 
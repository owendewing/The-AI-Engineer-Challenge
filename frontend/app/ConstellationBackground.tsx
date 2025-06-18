"use client";
import React, { useRef, useEffect } from "react";

const STAR_COLOR = "#F5F5DC"; // Cream
const LINE_COLOR = "#FFFFFF"; // White lines for visibility
const BG_COLOR = "rgba(245,245,220,0.0)"; // Transparent, let page bg show
const NUM_STARS = 60;
const STAR_RADIUS = 2.2;
const LINE_DISTANCE = 120;
const HOVER_DISTANCE = 80; // px

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export default function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stars = useRef(
    Array.from({ length: NUM_STARS }, () => ({
      x: randomBetween(0, 1),
      y: randomBetween(0, 1),
      vx: randomBetween(-0.004, 0.004), // Even slower velocity
      vy: randomBetween(-0.004, 0.004), // Even slower velocity
    }))
  );
  const mouse = useRef({ x: 0.5, y: 0.5, px: 0, py: 0 });

  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Move and draw stars
      for (const star of stars.current) {
        // Interactive effect: if mouse is near, move star toward mouse and speed up
        const sx = star.x * canvas.width;
        const sy = star.y * canvas.height;
        const distToMouse = Math.sqrt((sx - mouse.current.px) ** 2 + (sy - mouse.current.py) ** 2);
        if (distToMouse < HOVER_DISTANCE) {
          // Move toward mouse and speed up
          const angle = Math.atan2(mouse.current.py - sy, mouse.current.px - sx);
          star.vx += Math.cos(angle) * 0.0015;
          star.vy += Math.sin(angle) * 0.0015;
          // Clamp velocity
          star.vx = Math.max(-0.02, Math.min(0.02, star.vx));
          star.vy = Math.max(-0.02, Math.min(0.02, star.vy));
        } else {
          // Natural slow drift
          star.vx *= 0.98;
          star.vy *= 0.98;
        }
        // Parallax effect (very slow)
        star.x += star.vx + (mouse.current.x - 0.5) * 0.002;
        star.y += star.vy + (mouse.current.y - 0.5) * 0.002;
        // Bounce off edges
        if (star.x < 0 || star.x > 1) star.vx *= -1;
        if (star.y < 0 || star.y > 1) star.vy *= -1;
        star.x = Math.max(0, Math.min(1, star.x));
        star.y = Math.max(0, Math.min(1, star.y));
      }

      // Draw lines between close stars
      for (let i = 0; i < stars.current.length; i++) {
        for (let j = i + 1; j < stars.current.length; j++) {
          const a = stars.current[i];
          const b = stars.current[j];
          const dx = (a.x - b.x) * canvas.width;
          const dy = (a.y - b.y) * canvas.height;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINE_DISTANCE) {
            ctx.strokeStyle = LINE_COLOR;
            ctx.globalAlpha = 0.18 + 0.12 * (1 - dist / LINE_DISTANCE);
            ctx.beginPath();
            ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
            ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Draw stars
      for (const star of stars.current) {
        ctx.beginPath();
        ctx.arc(star.x * canvas.width, star.y * canvas.height, STAR_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = STAR_COLOR;
        ctx.shadowColor = STAR_COLOR;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationId = requestAnimationFrame(animate);
    }
    animate();

    function handleMouseMove(e: MouseEvent) {
      mouse.current.x = e.clientX / window.innerWidth;
      mouse.current.y = e.clientY / window.innerHeight;
      mouse.current.px = e.clientX;
      mouse.current.py = e.clientY;
    }
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-screen h-screen pointer-events-none select-none z-10"
      style={{ position: "fixed", top: 0, left: 0, zIndex: 10 }}
    />
  );
} 
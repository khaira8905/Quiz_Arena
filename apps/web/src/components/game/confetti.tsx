"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const COLORS = ["#c6ff34", "#ff5a3c", "#2bb3ff", "#ffc93c", "#c25bff", "#f2f4f8"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

/**
 * Canvas confetti, reserved for big moments (winner, personal podium). One canvas, a few
 * hundred particles, stops itself when settled. Disabled under reduced motion.
 */
export function Confetti({ fire, intensity = 1, origin = { x: 0.5, y: 0.35 } }: { fire: unknown; intensity?: number; origin?: { x: number; y: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!fire || reduced) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.width;
    const H = () => canvas.height;
    const count = Math.round(180 * intensity);
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = (8 + Math.random() * 14) * dpr;
      return {
        x: origin.x * W(),
        y: origin.y * H(),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: (6 + Math.random() * 6) * dpr,
        h: (10 + Math.random() * 10) * dpr,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        life: 1,
      };
    });

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W(), H());
      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.vy += 0.32 * dpr;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H() * 0.75) p.life -= 0.02;
        if (p.y > H() + 40) p.life = 0;
        if (p.life <= 0) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 2));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive > 0) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [fire, intensity, origin.x, origin.y, reduced]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}

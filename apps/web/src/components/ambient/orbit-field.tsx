"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * String art on a dotted orbit. Points sit on a circle and each one is joined to the point
 * at (i × k) mod N; as k drifts the threads sweep through cardioids, nephroids and stars.
 * Around it, dotted rings with a few travelling particles. Drawn on a canvas in the theme's
 * colours, paused when off-screen or in a background tab, and a still frame for reduced
 * motion.
 */
export function OrbitField({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let colors = { accent: "#fff", ink: "#fff", alt: "#fff" };
    const readColors = () => {
      // Resolve theme variables to concrete colours the canvas understands.
      const probe = document.createElement("span");
      el.parentElement?.appendChild(probe);
      const read = (v: string) => {
        probe.style.color = `var(${v})`;
        return getComputedStyle(probe).color;
      };
      colors = { accent: read("--accent"), ink: read("--text-primary"), alt: read("--answer-2") };
      probe.remove();
    };

    let w = 0;
    let h = 0;
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const N = 160;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.34;
      // k breathes between 2 and 7 over about a minute and a half.
      const k = 4.5 - 2.5 * Math.cos(t / 14000);
      const spin = t / 60000;
      const pt = (i: number, r = R) => {
        const a = (i / N) * Math.PI * 2 + spin - Math.PI / 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
      };

      // Threads
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const [x1, y1] = pt(i);
        const [x2, y2] = pt((i * k) % N);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // Pins on the circle
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < N; i += 2) {
        const [x, y] = pt(i);
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }

      // Dotted orbits, tilted, with travelling particles
      const rings = [
        { r: 1.32, tilt: 0.38, speed: 1, dots: 120, color: colors.ink },
        { r: 1.6, tilt: -0.22, speed: -0.6, dots: 150, color: colors.alt },
      ];
      for (const ring of rings) {
        const rx = R * ring.r;
        const ry = rx * 0.42;
        const cos = Math.cos(ring.tilt);
        const sin = Math.sin(ring.tilt);
        const at = (a: number) => {
          const x = Math.cos(a) * rx;
          const y = Math.sin(a) * ry;
          return [cx + x * cos - y * sin, cy + x * sin + y * cos] as const;
        };
        ctx.fillStyle = ring.color;
        ctx.globalAlpha = 0.28;
        for (let i = 0; i < ring.dots; i++) {
          const [x, y] = at((i / ring.dots) * Math.PI * 2);
          ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        }
        ctx.globalAlpha = 0.95;
        for (let p = 0; p < 3; p++) {
          const a = (t / 9000) * ring.speed + (p * Math.PI * 2) / 3;
          const [x, y] = at(a);
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = p === 0 ? colors.accent : ring.color;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    readColors();
    resize();
    let frame = 0;
    let visible = true;
    const loop = (t: number) => {
      draw(t);
      frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!frame && visible && !document.hidden && !reduced) frame = requestAnimationFrame(loop);
    };
    if (reduced) draw(30000);
    else start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(30000);
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      start();
    });
    io.observe(el);
    // Theme switches change the colours.
    const mo = new MutationObserver(() => {
      readColors();
      if (reduced) draw(30000);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-theme"] });
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className={cn("block h-full w-full", className)} />;
}

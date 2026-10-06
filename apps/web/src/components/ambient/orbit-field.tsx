"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * String art in 3D. Pins sit on a circle in space and each pin i is threaded to pin
 * (i × k) mod N; as k drifts the threads sweep through cardioids, nephroids and stars. The
 * circle turns slowly and tips toward the pointer, and two dotted orbits circle it on their
 * own tilted planes, all drawn with perspective so the near side is brighter and larger.
 * A 2D canvas with a few lines of projection maths: no WebGL needed. Theme colours, paused
 * off-screen and in background tabs, a still frame for reduced motion.
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

    // The pointer tips the scene; smoothed so it glides.
    const aim = { x: 0, y: 0 };
    const tip = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      aim.x = (e.clientX / innerWidth) * 2 - 1;
      aim.y = (e.clientY / innerHeight) * 2 - 1;
    };

    const N = 160;
    const pins = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(a), Math.sin(a)] as const;
    });

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      tip.x += (aim.x - tip.x) * 0.06;
      tip.y += (aim.y - tip.y) * 0.06;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.32;
      const F = R * 4; // focal length: lower = stronger perspective
      const yaw = Math.sin(t / 9000) * 0.55 + tip.x * 0.45;
      const pitch = 0.32 + Math.cos(t / 11000) * 0.12 + tip.y * 0.3;
      const [cyw, syw, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];

      /** Rotate (yaw about Y, then pitch about X) and project to the screen. */
      const project = (x: number, y: number, z: number) => {
        const x1 = x * cyw + z * syw;
        const z1 = -x * syw + z * cyw;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const s = F / (F + z2);
        return { x: cx + x1 * s, y: cy + y2 * s, s, z: z2 };
      };

      // Threads, with the near half brighter than the far half.
      const k = 4.5 - 2.5 * Math.cos(t / 14000);
      const pts = pins.map(([px, py]) => project(px * R, py * R, 0));
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = colors.accent;
      for (const near of [false, true]) {
        ctx.globalAlpha = near ? 0.32 : 0.12;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const a = pts[i]!;
          const b = pts[Math.floor((i * k) % N)]!;
          if (a.z + b.z < 0 !== near) continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }

      // Pins
      ctx.fillStyle = colors.ink;
      for (let i = 0; i < N; i += 2) {
        const p = pts[i]!;
        ctx.globalAlpha = p.z < 0 ? 0.7 : 0.3;
        const d = 1.4 * p.s;
        ctx.fillRect(p.x - d / 2, p.y - d / 2, d, d);
      }

      // Dotted orbits on their own tilted planes, with travelling particles.
      const rings = [
        { r: 1.35, tilt: 1.15, spin: 0.4, speed: 1, dots: 110, color: colors.ink },
        { r: 1.62, tilt: -0.9, spin: -0.3, speed: -0.65, dots: 140, color: colors.alt },
      ];
      for (const ring of rings) {
        const [ct, st, cs, ss] = [
          Math.cos(ring.tilt),
          Math.sin(ring.tilt),
          Math.cos(ring.spin),
          Math.sin(ring.spin),
        ];
        const at = (a: number) => {
          // A circle in XZ, tilted about X, then turned about Y.
          const x = Math.cos(a) * R * ring.r;
          const z0 = Math.sin(a) * R * ring.r;
          const y = -z0 * st;
          const z = z0 * ct;
          return project(x * cs - z * ss, y, x * ss + z * cs);
        };
        ctx.fillStyle = ring.color;
        for (let i = 0; i < ring.dots; i++) {
          const p = at((i / ring.dots) * Math.PI * 2);
          ctx.globalAlpha = p.z < 0 ? 0.42 : 0.14;
          const d = 1.3 * p.s;
          ctx.fillRect(p.x - d / 2, p.y - d / 2, d, d);
        }
        for (let q = 0; q < 3; q++) {
          const p = at((t / 9000) * ring.speed + (q * Math.PI * 2) / 3);
          ctx.globalAlpha = p.z < 0 ? 0.95 : 0.45;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.6 * p.s, 0, Math.PI * 2);
          ctx.fillStyle = q === 0 ? colors.accent : ring.color;
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
    // The day/night switch changes the colours.
    const mo = new MutationObserver(() => {
      readColors();
      if (reduced) draw(30000);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-theme"] });
    document.addEventListener("visibilitychange", start);
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className={cn("block h-full w-full", className)} />;
}

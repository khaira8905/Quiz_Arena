"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * The desktop cursor: a precise dot that sits exactly on the pointer, a ring that follows
 * with interpolation, and a short trail in the theme's accent. The ring reads what's under
 * the pointer and changes shape:
 *   hover    grows and tints; magnetic buttons spring toward the pointer and the ring wraps them
 *   link     a small arrow (pointing out for external links)
 *   media    a filled disc labelled VIEW, PLAY or EDIT
 *   drag     a grip that closes into a fist-tight ring while dragging
 *   loading  a spinning ring; disabled: a dashed one
 *   text     steps aside for the native I-beam
 * Clicking compresses it and throws a ripple and a few sparks.
 *
 * Only with a fine, hovering pointer and without "reduce motion"; never on the projector
 * (which hides its pointer) or when switched off in Settings. One requestAnimationFrame loop
 * writes transforms only and sleeps when nothing moves. Low-power devices get a shorter trail.
 */

type CursorState =
  "default" | "hover" | "link" | "text" | "disabled" | "media" | "drag" | "loading" | "hidden";

const STORAGE_KEY = "qa-cursor";
const MAGNET_PULL = 0.24; // share of the pointer's offset a magnetic element follows
const MAGNET_MAX = 10; // px
const SPARKS = 6;
/** Button springs: snappy toward the pointer, a soft overshoot on the way home. */
const STIFFNESS = 320;
const DAMPING = 18;

const listeners = new Set<() => void>();
/** The person's preference, remembered per browser. On unless switched off. */
export const cursorPreference = {
  get: (): boolean => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  },
  getServer: () => false,
  set(on: boolean) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {}
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Few cores, little memory or data saver on: keep the trail short. */
function lowPower(): boolean {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return (
    (nav.hardwareConcurrency ?? 8) <= 4 ||
    (nav.deviceMemory ?? 8) <= 4 ||
    !!nav.connection?.saveData
  );
}

const TEXT_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"], iframe';
const INTERACTIVE_SELECTOR =
  'button, [role="button"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], label[for], summary, [data-cursor="hover"]';

interface Classified {
  state: CursorState;
  el: HTMLElement | null;
  label?: string;
  external?: boolean;
}

/** Classify the element under the pointer. Cheap: a handful of closest() calls. */
function classify(target: Element | null): Classified {
  if (!target) return { state: "hidden", el: null };
  const explicit = target.closest<HTMLElement>("[data-cursor]");
  if (target.closest(TEXT_SELECTOR)) return { state: "text", el: null };
  if (target.closest('[aria-busy="true"]')) return { state: "loading", el: null };
  if (target.closest(':disabled, [aria-disabled="true"]')) return { state: "disabled", el: null };
  if (explicit?.dataset.cursor === "media")
    return { state: "media", el: explicit, label: explicit.dataset.cursorLabel ?? "View" };
  if (explicit?.dataset.cursor === "drag" || target.closest('[aria-roledescription="sortable"]'))
    return { state: "drag", el: null };
  const interactive = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
  if (interactive) return { state: "hover", el: interactive };
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (link) {
    // Links styled as buttons or cards behave like buttons; plain links get the arrow.
    if (link.matches(".magnetic, .card-interactive, [data-cursor='hover']"))
      return { state: "hover", el: link };
    return { state: "link", el: link, external: link.host !== location.host };
  }
  return { state: "default", el: null };
}

interface Spring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
}

export function Cursor() {
  const pathname = usePathname();
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const wanted = useSyncExternalStore(
    cursorPreference.subscribe,
    cursorPreference.get,
    cursorPreference.getServer,
  );
  const onProjector = /^\/host\/[^/]+\/projector/.test(pathname ?? "");
  const enabled = fine && !reduced && wanted && !onProjector;
  const [trailLength] = useState(() => (typeof navigator !== "undefined" && lowPower() ? 2 : 4));

  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const trail = useRef<(HTMLDivElement | null)[]>([]);
  const sparks = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.dataset.cursor = "custom";

    const pointer = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100, w: 32, h: 32 };
    const trailPos = Array.from({ length: trailLength }, () => ({ x: -100, y: -100 }));
    // Magnetic elements currently pulled (or springing home), with their spring state.
    const springs = new Map<HTMLElement, Spring>();
    let state: CursorState = "hidden";
    let magnet: HTMLElement | null = null;
    let pressed = false;
    let frame = 0;
    let last = performance.now();
    let seen = false;

    const setState = (next: CursorState, text?: string, external?: boolean) => {
      const r = root.current;
      if (!r) return;
      if (next !== state) {
        state = next;
        r.dataset.state = next;
      }
      if (external !== undefined) r.toggleAttribute("data-external", external);
      if (label.current && text !== undefined && label.current.textContent !== text)
        label.current.textContent = text;
    };

    /** The magnet lets go; its spring carries it home (with a little overshoot). */
    const releaseMagnet = () => {
      const s = magnet && springs.get(magnet);
      if (s) {
        s.tx = 0;
        s.ty = 0;
      }
      magnet = null;
    };
    const grab = (el: HTMLElement | null) => {
      if (el === magnet) return;
      releaseMagnet();
      magnet = el;
      if (el && !springs.has(el)) springs.set(el, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
    };
    const apply = (c: Classified) => {
      const magnetic =
        c.state === "hover" && c.el?.matches(".magnetic, [data-magnetic]") && !pressed
          ? c.el
          : null;
      grab(magnetic);
      setState(pressed && c.state === "drag" ? "drag" : c.state, c.label, c.external);
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // Frame-rate independent smoothing: same feel at 60Hz and 144Hz.
      const k = (base: number) => 1 - (1 - base) ** (dt / 16.67);

      if (magnet && !magnet.isConnected) releaseMagnet();

      let tx = pointer.x;
      let ty = pointer.y;
      let tw =
        state === "media"
          ? 78
          : state === "hover"
            ? 44
            : state === "link" || state === "drag"
              ? 40
              : 32;
      let th = tw;
      let radius = "999px";

      if (magnet) {
        const r = magnet.getBoundingClientRect();
        const s = springs.get(magnet)!;
        const cx = r.left - s.x + r.width / 2;
        const cy = r.top - s.y + r.height / 2;
        s.tx = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, (pointer.x - cx) * MAGNET_PULL));
        s.ty = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, (pointer.y - cy) * MAGNET_PULL));
        // The ring wraps the button it's attracted to.
        tx = cx + s.x;
        ty = cy + s.y;
        tw = r.width + 10;
        th = r.height + 10;
        radius = getComputedStyle(magnet).borderRadius === "0px" ? "4px" : "14px";
      }

      // Spring every pulled element toward its target; drop it once home and at rest.
      const sec = dt / 1000;
      let springing = false;
      for (const [el, s] of springs) {
        const ax = STIFFNESS * (s.tx - s.x) - DAMPING * s.vx;
        const ay = STIFFNESS * (s.ty - s.y) - DAMPING * s.vy;
        s.vx += ax * sec;
        s.vy += ay * sec;
        s.x += s.vx * sec;
        s.y += s.vy * sec;
        const resting =
          Math.abs(s.tx - s.x) < 0.05 &&
          Math.abs(s.ty - s.y) < 0.05 &&
          Math.abs(s.vx) < 0.5 &&
          Math.abs(s.vy) < 0.5;
        if (resting && s.tx === 0 && s.ty === 0 && el !== magnet) {
          el.style.translate = "";
          springs.delete(el);
          continue;
        }
        el.style.translate = `${s.x.toFixed(2)}px ${s.y.toFixed(2)}px`;
        if (!resting) springing = true;
      }

      const f = k(magnet ? 0.32 : 0.2);
      ringPos.x += (tx - ringPos.x) * f;
      ringPos.y += (ty - ringPos.y) * f;
      ringPos.w += (tw - ringPos.w) * k(0.25);
      ringPos.h += (th - ringPos.h) * k(0.25);

      let px = pointer.x;
      let py = pointer.y;
      trailPos.forEach((p, i) => {
        const tf = k(0.38 - i * 0.08);
        p.x += (px - p.x) * tf;
        p.y += (py - p.y) * tf;
        px = p.x;
        py = p.y;
        const el = trail.current[i];
        if (el) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      });

      if (ring.current) {
        const s = pressed ? 0.84 : 1;
        ring.current.style.transform = `translate3d(${ringPos.x - ringPos.w / 2}px, ${ringPos.y - ringPos.h / 2}px, 0) scale(${s})`;
        ring.current.style.width = `${ringPos.w}px`;
        ring.current.style.height = `${ringPos.h}px`;
        ring.current.style.borderRadius = radius;
      }

      const settled =
        !springing &&
        Math.abs(tx - ringPos.x) < 0.1 &&
        Math.abs(ty - ringPos.y) < 0.1 &&
        Math.abs(tw - ringPos.w) < 0.1 &&
        Math.abs(th - ringPos.h) < 0.1 &&
        trailPos.every((p) => Math.abs(p.x - pointer.x) < 0.1 && Math.abs(p.y - pointer.y) < 0.1);
      frame = settled ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!seen) {
        // First sighting: start everything on the pointer instead of flying in from a corner.
        seen = true;
        ringPos.x = pointer.x;
        ringPos.y = pointer.y;
        for (const p of trailPos) Object.assign(p, pointer);
      }
      if (dot.current)
        dot.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      apply(classify(e.target as Element));
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pressed = true;
      root.current?.setAttribute("data-pressed", "");
      if (state !== "text") {
        // A ripple and a few sparks from pooled elements: restart their animations.
        const fire = (el: HTMLElement | null | undefined, cls: string) => {
          if (!el) return;
          el.style.left = `${e.clientX}px`;
          el.style.top = `${e.clientY}px`;
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        };
        fire(root.current?.querySelector<HTMLElement>("[data-ripple]"), "cursor-ripple-go");
        sparks.current.forEach((sp) => fire(sp, "cursor-spark-go"));
      }
      if (state === "drag") root.current?.setAttribute("data-dragging", "");
      wake();
    };
    const onUp = () => {
      pressed = false;
      root.current?.removeAttribute("data-pressed");
      root.current?.removeAttribute("data-dragging");
      wake();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      releaseMagnet();
      setState("hidden");
      wake();
    };
    // Things change under a still pointer too: a button becomes busy, a dialog opens, the
    // page navigates away from the button the ring was wrapped around. Re-read what's under
    // the pointer, at most every 120ms however busy the page is.
    let lastCheck = 0;
    let queued: ReturnType<typeof setTimeout> | null = null;
    const recheck = () => {
      if (!seen || queued) return;
      queued = setTimeout(
        () => {
          queued = null;
          lastCheck = performance.now();
          if (state === "hidden") return;
          apply(classify(document.elementFromPoint(pointer.x, pointer.y)));
          wake();
        },
        Math.max(0, 120 - (performance.now() - lastCheck)),
      );
    };
    const observer = new MutationObserver(recheck);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy", "disabled", "aria-disabled"],
    });
    const onScroll = () => {
      releaseMagnet();
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("blur", onUp);
    document.addEventListener("pointerout", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      if (queued) clearTimeout(queued);
      observer.disconnect();
      for (const el of springs.keys()) el.style.translate = "";
      delete html.dataset.cursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onUp);
      document.removeEventListener("pointerout", onLeave);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [enabled, trailLength]);

  if (!enabled) return null;
  return (
    <div ref={root} className="qa-cursor" data-state="hidden" aria-hidden>
      {Array.from({ length: trailLength }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            trail.current[i] = el;
          }}
          className="qa-cursor-trail"
          style={{ opacity: 0.34 - i * 0.08, scale: 1 - i * 0.18 }}
        />
      ))}
      <div ref={ring} className="qa-cursor-ring">
        <span ref={label} className="qa-cursor-label" />
        {/* Link: a small arrow (turned to point out for external links). */}
        <svg viewBox="0 0 16 16" className="qa-cursor-arrow">
          <path
            d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* Drag: a six-dot grip. */}
        <svg viewBox="0 0 16 16" className="qa-cursor-grip">
          {[5, 11].flatMap((x) =>
            [3.5, 8, 12.5].map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />
            )),
          )}
        </svg>
      </div>
      <div ref={dot} className="qa-cursor-dot" />
      <div data-ripple className="qa-cursor-ripple" />
      {Array.from({ length: SPARKS }, (_, i) => {
        const a = (i / SPARKS) * Math.PI * 2 + 0.4;
        return (
          <div
            key={i}
            ref={(el) => {
              sparks.current[i] = el;
            }}
            className="qa-cursor-spark"
            style={
              {
                "--sx": `${(Math.cos(a) * 18).toFixed(1)}px`,
                "--sy": `${(Math.sin(a) * 18).toFixed(1)}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

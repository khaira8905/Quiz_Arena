"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The desktop cursor: a precise dot that sits exactly on the pointer, a ring that follows
 * with interpolation, and a short trail. The ring reads what's under the pointer and changes
 * shape: it wraps magnetic buttons, grows over media, spins while something is busy, and
 * steps aside for text fields (which keep the native I-beam).
 *
 * Only runs with a fine, hovering pointer and without "reduce motion"; never on the
 * projector (which hides its pointer) and never when the person turned it off. Everything
 * runs in one requestAnimationFrame loop that writes transforms only and sleeps when the
 * pointer is still.
 */

type CursorState =
  "default" | "hover" | "text" | "disabled" | "media" | "drag" | "loading" | "hidden";

const STORAGE_KEY = "qa-cursor";
const TRAIL = 4;
const MAGNET_PULL = 0.22; // share of the pointer's offset the element follows
const MAGNET_MAX = 8; // px

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

const TEXT_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"], iframe';
const INTERACTIVE_SELECTOR =
  'a[href], button, [role="button"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], label[for], summary, [data-cursor="hover"]';

/** Classify the element under the pointer. Cheap: a handful of closest() calls per move. */
function classify(target: Element | null): {
  state: CursorState;
  el: HTMLElement | null;
  label?: string;
} {
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
  return { state: "default", el: null };
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

  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const trail = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.dataset.cursor = "custom";

    const pointer = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100, w: 34, h: 34 };
    const trailPos = Array.from({ length: TRAIL }, () => ({ x: -100, y: -100 }));
    let state: CursorState = "hidden";
    let magnet: HTMLElement | null = null;
    let pressed = false;
    let frame = 0;
    let last = performance.now();
    let seen = false;

    const setState = (next: CursorState, text?: string) => {
      if (next !== state) {
        state = next;
        if (root.current) root.current.dataset.state = next;
      }
      if (label.current && text !== undefined && label.current.textContent !== text)
        label.current.textContent = text;
    };

    const releaseMagnet = () => {
      if (magnet) magnet.style.translate = "";
      magnet = null;
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // Frame-rate independent smoothing: same feel at 60Hz and 144Hz.
      const k = (base: number) => 1 - (1 - base) ** (dt / 16.67);

      let tx = pointer.x;
      let ty = pointer.y;
      let tw = state === "media" ? 76 : state === "hover" ? 44 : state === "drag" ? 46 : 34;
      let th = tw;
      let radius = "999px";

      if (magnet) {
        const r = magnet.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        const mx = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx * MAGNET_PULL));
        const my = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy * MAGNET_PULL));
        magnet.style.translate = `${mx.toFixed(2)}px ${my.toFixed(2)}px`;
        // The ring wraps the button it's attracted to.
        tx = cx + mx;
        ty = cy + my;
        tw = r.width + 10;
        th = r.height + 10;
        radius = getComputedStyle(magnet).borderRadius === "0px" ? "4px" : "12px";
      }

      const f = k(magnet ? 0.3 : 0.2);
      ringPos.x += (tx - ringPos.x) * f;
      ringPos.y += (ty - ringPos.y) * f;
      ringPos.w += (tw - ringPos.w) * k(0.25);
      ringPos.h += (th - ringPos.h) * k(0.25);

      let px = pointer.x;
      let py = pointer.y;
      trailPos.forEach((p, i) => {
        const tf = k(0.42 - i * 0.07);
        p.x += (px - p.x) * tf;
        p.y += (py - p.y) * tf;
        px = p.x;
        py = p.y;
        const el = trail.current[i];
        if (el) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      });

      if (ring.current) {
        const s = pressed ? 0.86 : 1;
        ring.current.style.transform = `translate3d(${ringPos.x - ringPos.w / 2}px, ${ringPos.y - ringPos.h / 2}px, 0) scale(${s})`;
        ring.current.style.width = `${ringPos.w}px`;
        ring.current.style.height = `${ringPos.h}px`;
        ring.current.style.borderRadius = radius;
      }

      const settled =
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

      const { state: next, el, label: text } = classify(e.target as Element);
      const magnetic =
        next === "hover" && el?.matches(".magnetic, [data-magnetic]") && !pressed ? el : null;
      if (magnetic !== magnet) {
        releaseMagnet();
        magnet = magnetic;
      }
      setState(pressed && next === "drag" ? "drag" : next, text);
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pressed = true;
      root.current?.setAttribute("data-pressed", "");
      // A click ripple from a pooled element: restart its animation.
      const ripple = root.current?.querySelector<HTMLElement>("[data-ripple]");
      if (ripple && state !== "text") {
        ripple.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        ripple.classList.remove("cursor-ripple-go");
        void ripple.offsetWidth;
        ripple.classList.add("cursor-ripple-go");
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
    };
    // Things change under a still pointer too (a button becomes busy, a dialog opens).
    const recheck = () => {
      if (!seen) return;
      const el = document.elementFromPoint(pointer.x, pointer.y);
      const { state: next, label: text } = classify(el);
      if (state !== "hidden") setState(next, text);
    };
    const observer = new MutationObserver(recheck);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-busy", "disabled", "aria-disabled"],
    });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("blur", onUp);
    document.addEventListener("pointerout", onLeave);
    window.addEventListener("scroll", releaseMagnet, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      releaseMagnet();
      delete html.dataset.cursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onUp);
      document.removeEventListener("pointerout", onLeave);
      window.removeEventListener("scroll", releaseMagnet, { capture: true });
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={root} className="qa-cursor" data-state="hidden" aria-hidden>
      {Array.from({ length: TRAIL }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            trail.current[i] = el;
          }}
          className="qa-cursor-trail"
          style={{ opacity: 0.32 - i * 0.07, scale: 1 - i * 0.16 }}
        />
      ))}
      <div ref={ring} className="qa-cursor-ring">
        <span ref={label} className="qa-cursor-label" />
      </div>
      <div ref={dot} className="qa-cursor-dot" />
      <div data-ripple className="qa-cursor-ripple" />
    </div>
  );
}

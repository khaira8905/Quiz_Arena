"use client";

import {
  ChevronDown,
  CirclePlay,
  FileSpreadsheet,
  ImagePlay,
  ListOrdered,
  Menu,
  PenLine,
  Projector,
  SlidersHorizontal,
  Smartphone,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";

/** The "Product" menu: everything links to a real part of this page. */
const MENU = [
  {
    heading: "Build",
    items: [
      {
        icon: PenLine,
        title: "Question editor",
        body: "Multiple choice and true/false, with a timer and points per question.",
        href: "#types",
      },
      {
        icon: ImagePlay,
        title: "Images and video",
        body: "Put a picture or a short clip on any question.",
        href: "#types",
        tag: "New",
      },
      {
        icon: FileSpreadsheet,
        title: "Spreadsheet import",
        body: "Bring questions in from CSV, Excel or a Google Sheets link.",
        href: "#pillars",
      },
    ],
  },
  {
    heading: "Run",
    items: [
      {
        icon: Projector,
        title: "Projector stage",
        body: "A big-screen view sized to read from the back row.",
        href: "#problems",
      },
      {
        icon: SlidersHorizontal,
        title: "Host controls",
        body: "Pace, timer and reveals from a separate host view.",
        href: "#pillars",
      },
      {
        icon: Smartphone,
        title: "Phones as buzzers",
        body: "Players join in the browser with a game PIN.",
        href: "#join",
      },
    ],
  },
  {
    heading: "Celebrate",
    items: [
      {
        icon: ListOrdered,
        title: "Live leaderboard",
        body: "Scores and rank changes the moment time is up.",
        href: "#replay",
      },
      {
        icon: Trophy,
        title: "3D podium",
        body: "Third, second, then first, revealed one by one.",
        href: "#finale",
        tag: "New",
      },
      {
        icon: CirclePlay,
        title: "Sample game",
        body: "Watch five rounds of a game play out.",
        href: "#replay",
      },
    ],
  },
];

const LINKS = [
  { label: "Question types", href: "#types" },
  { label: "Sample game", href: "#replay" },
];

/**
 * Announcement strip + navigation. Sticky at the top on every screen size; on phones it
 * slides away while you scroll down and comes back as soon as you scroll up. "Product" opens
 * a three-column menu on click (Escape or a click elsewhere closes it); phones get a
 * full-height sheet instead.
 */
export function LandingNav() {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuId = useId();
  const sheetId = useId();

  // Close on Escape, and the desktop menu on a click outside the header.
  useEffect(() => {
    if (!menu && !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setSheet(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menu, sheet]);

  // Phones: hide on scroll down, show on scroll up.
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 767px)");
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (!phone.matches || y < 120) setHidden(false);
      else if (y - last > 6) setHidden(true);
      else if (last - y > 6) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The sheet covers the page: stop it scrolling underneath.
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  const close = () => {
    setMenu(false);
    setSheet(false);
  };

  return (
    <header
      ref={header}
      className={cn(
        "sticky top-0 z-40 transition-transform duration-300 ease-[var(--lp-glide)]",
        hidden && !sheet && "-translate-y-full",
      )}
    >
      <div className="bg-fg px-4 py-2.5 text-center text-[13px] leading-snug text-bg">
        New: video questions and a 3D podium ceremony.{" "}
        <a href="#types" className="lp-link font-semibold">
          See what&apos;s new →
        </a>
      </div>

      <div className="lp-hairline border-b border-line bg-bg">
        <nav aria-label="Main" className="lp-frame flex h-[72px] items-center gap-6">
          <Link href="/" aria-label="QuizArena home" onClick={close}>
            <Logo size="sm" />
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            <li>
              <button
                type="button"
                aria-expanded={menu}
                aria-controls={menuId}
                onClick={() => setMenu((m) => !m)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full px-3 text-[15px] transition-[background-color,color] duration-200",
                  menu ? "bg-elevated text-fg" : "text-fg-2 hover:text-fg",
                )}
              >
                Product
                <ChevronDown
                  aria-hidden
                  className={cn("h-4 w-4 transition-transform duration-200", menu && "rotate-180")}
                />
              </button>
            </li>
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="flex h-9 items-center rounded-full px-3 text-[15px] text-fg-2 transition-colors duration-200 hover:text-fg"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle className="max-md:hidden" />
            <Link href="/play" className="lp-btn lp-btn-outline max-md:hidden">
              Join a game
            </Link>
            <Link href="/admin" className="lp-btn lp-btn-accent">
              Host a quiz
            </Link>
            <button
              type="button"
              aria-expanded={sheet}
              aria-controls={sheetId}
              aria-label={sheet ? "Close menu" : "Open menu"}
              onClick={() => setSheet((s) => !s)}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-[10px] border border-line transition-colors duration-200 md:hidden",
                sheet && "bg-elevated",
              )}
            >
              {sheet ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Product menu (desktop). */}
      <div
        id={menuId}
        hidden={!menu}
        className="lp-hairline absolute inset-x-0 top-full border-b border-line bg-bg shadow-[var(--shadow-lg)]"
      >
        <div className="lp-frame grid grid-cols-3 gap-8 py-8">
          {MENU.map((col) => (
            <div key={col.heading}>
              <p className="mb-3 text-[13px] text-fg-3">{col.heading}</p>
              <ul className="flex flex-col gap-1">
                {col.items.map((it) => (
                  <li key={it.title}>
                    <a
                      href={it.href}
                      onClick={close}
                      className="flex gap-3 rounded-2xl p-2.5 transition-colors duration-200 hover:bg-surface focus-visible:bg-surface"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                        <it.icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span>
                        <span className="flex items-center gap-2 text-[15px] font-medium text-fg">
                          {it.title}
                          {it.tag && (
                            <span className="rounded-full border border-accent px-2 text-[11px] leading-[18px] text-accent">
                              {it.tag}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-fg-3">
                          {it.body}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Full-height sheet (phones), below the header. */}
      <div
        id={sheetId}
        hidden={!sheet}
        className="absolute inset-x-0 top-full h-[calc(100dvh-100%)] overflow-y-auto bg-bg md:hidden"
      >
        <div className="flex flex-col gap-6 px-4 py-6">
          {MENU.map((col) => (
            <div key={col.heading}>
              <p className="mb-2 text-[13px] text-fg-3">{col.heading}</p>
              <ul className="flex flex-col">
                {col.items.map((it) => (
                  <li key={it.title}>
                    <a
                      href={it.href}
                      onClick={close}
                      className="flex items-center gap-3 border-b border-line py-3 text-[17px]"
                    >
                      <it.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                      {it.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Link href="/play" className="lp-btn lp-btn-outline flex-1" onClick={close}>
              Join a game
            </Link>
            <Link href="/admin" className="lp-btn lp-btn-accent flex-1" onClick={close}>
              Host a quiz
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

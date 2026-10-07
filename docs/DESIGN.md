# Design system: themes, motion and depth

How QuizArena looks and moves, and the rules to keep it that way. The code is the source of
truth; this page says where it lives and why it is the way it is.

## Two themes, one switch

| Theme   | Side  | Feel                         | Accent    |
| ------- | ----- | ---------------------------- | --------- |
| `BLACK` | Night | Dark, cinematic, competitive | `#ff7a1a` |
| `WHITE` | Day   | Bright, clean, fast          | `#1940dc` |

- **One table** of tokens drives everything: `THEME_TOKENS` in
  `packages/shared/src/appearance.ts`. The admin, the projector and the phones all read it,
  and its tests hold every text colour to WCAG AA.
- **The accent is a signal, not a paint.** Use it for what matters right now: the current
  question number, the live dot, the primary action, the correct answer. Never for large
  surfaces.
- **The switch** is `components/ui/theme-toggle.tsx`. It shows where a click takes you (a
  sun at night, a moon by day), and `uiThemeStore.set()` in `lib/ui-theme.ts` reveals the
  new theme as a circle growing from the button (View Transitions), with a colour crossfade
  where those aren't supported and an instant swap under reduced motion.
- A quiz's **arena theme** (projector and phones) is one of the same two and is set in
  Customize Arena; the day/night switch only changes the organiser's own screens.

### Tokens

Components never hard-code colours. Use the Tailwind names (`bg-surface`, `text-fg-2`,
`border-line`, `text-accent` …) or the CSS variables behind them:

| Token                                   | Use                                                  |
| --------------------------------------- | ---------------------------------------------------- |
| `--arena-bg`, `--arena-surface(-2)`     | page, cards, raised cards                            |
| `--arena-text`, `--arena-muted`         | body text, secondary text (both AA on every surface) |
| `--arena-border`                        | hairlines                                            |
| `--arena-accent`, `--arena-accent-soft` | signal colour and its tint                           |
| `--arena-answer-1…4`                    | answer colours, always paired with letters A–D       |
| `--arena-shadow`, `--arena-3d-shadow`   | cast shadows                                         |
| `--arena-3d-light`                      | rim light and highlights on raised or tilted faces   |

The one deliberate exception: QR codes are always black on white, because scanners need it.

## Motion

Durations, curves and springs come from `lib/motion.ts` (JS) and the `--motion-*` /
`--ease-*` variables in `globals.css` (CSS), never ad-hoc numbers.

| Name            | Value | For                                 |
| --------------- | ----- | ----------------------------------- |
| `instant`       | 90ms  | press feedback                      |
| `fast`          | 160ms | hover, small state changes          |
| `normal`        | 260ms | panels, tabs, menus                 |
| `slow`          | 520ms | screen changes, reveals             |
| `cinematic`     | 900ms | stage moments: reveals, podium      |
| `EASE.out`      |       | the default: quick start, soft land |
| `EASE.emphasis` |       | long dramatic settles               |
| `EASE.snap`     |       | a small overshoot that says "done"  |

Rules:

1. **Motion explains something**: an interaction, a state change, a hierarchy, progress or
   competition. If it explains nothing, it doesn't move.
2. **The server decides, the screen animates.** Timers, reveals and the podium are driven
   by server state. Animation never changes game timing.
3. **The projector is loud, the admin is quiet.** Stage moments use `cinematic` and depth;
   admin screens use `fast`/`normal` and small distances.
4. **Transforms and opacity only** for anything that runs every frame. One rAF loop per
   effect, asleep when nothing moves.
5. **Reduced motion** keeps every piece of information and drops the movement: no cursor,
   trail, tilt, parallax, particles or ambient loops; transitions become fades.

## The cursor

`components/ui/cursor.tsx`. Desktop pointers only, off for touch, reduced motion and the
projector, and switchable in Settings → Interface.

| What's under the pointer                        | Cursor                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| nothing interactive                             | dot + interpolated ring + short trail              |
| a button, tab, switch…                          | ring grows and tints                               |
| `.magnetic` (large buttons, the day/night icon) | ring wraps it; it springs ≤10px toward the pointer |
| a plain link                                    | arrow (turned outward for external links)          |
| `data-cursor="media"` + `data-cursor-label`     | filled disc reading VIEW / PLAY / EDIT             |
| a sortable item                                 | six-dot grip                                       |
| `aria-busy="true"` / disabled                   | spinning ring / dashed ring                        |
| a text field                                    | native I-beam                                      |

To opt an element in, add `data-cursor="media" data-cursor-label="Play"` (or `.magnetic`).

## Depth

CSS 3D and 2D canvas only; no WebGL. Each piece is cheap and self-contained:

- `components/motion/tilt.tsx`: leans media and cards toward the pointer (2–6°), with a
  tracking highlight and a shadow that falls away from it.
- `components/ambient/parallax.tsx`: layers pan with depth as a camera follows the pointer.
- `components/ambient/orbit-field.tsx`: string art projected in perspective.
- `components/ambient/parade.tsx` and `procession.tsx`: walkers in three depth rows; far
  rows are smaller, slower and fainter.
- Stage entrances use per-element `transformPerspective`, so each layer travels in its own
  depth without `preserve-3d` chains.

Budget: hold 60fps on a mid-range laptop with the landing page scrolled to the parade, and
on the projector with a full lobby. Measure with the browser's frame timing before adding
anything that animates continuously.

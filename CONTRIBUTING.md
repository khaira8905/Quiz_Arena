# Contributing to QuizArena

Thanks for helping. This page is the short version of how the project works; the
[README](README.md) has setup details and [docs/](docs) explains each area in depth.

## Getting set up

You need Node 22.12+, pnpm 10 and PostgreSQL 14+.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env      # DATABASE_URL, JWT_SECRET, SEED_ADMIN_*
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate && pnpm db:seed
pnpm dev                                          # web :3000, game server :4000
```

## Where things live

| Path              | What                                                           |
| ----------------- | -------------------------------------------------------------- |
| `packages/shared` | Types, schemas, theme tokens and game rules used by both apps  |
| `apps/server`     | Fastify REST API, Socket.IO game engine, Prisma, media storage |
| `apps/web`        | Next.js app: admin portal, control room, projector, phones     |
| `docs/`           | Architecture, deployment, media and the design system          |

## Before you open a pull request

Run the same checks CI cares about:

```bash
pnpm typecheck
pnpm lint
pnpm test            # server tests need DATABASE_URL; they skip without it
pnpm format:check    # or `pnpm format` to fix
```

If you change anything the projector or phones show, also try it in a browser: open a game,
the projector view and a phone at `/play`, in both the day and the night theme.

## Rules of the house

- **The server is the authority.** Timers, scoring, phases and what each screen may see are
  decided in `apps/server/src/game`. The web app renders state; it never invents it.
- **The projector shows nothing private.** No answers before the reveal, no host controls,
  no player connection details. `ProjectorView` is the contract; keep it audience-safe.
- **No hard-coded colours.** Use the theme tokens (see [docs/DESIGN.md](docs/DESIGN.md)).
  The only exception is the QR code, which is always black on white.
- **Motion has a reason and respects reduced motion.** Durations and curves come from
  `lib/motion.ts` and the CSS motion variables; animate transforms and opacity.
- **Never fake an integration.** If something needs credentials (S3, Google Drive), say so
  in the UI and the docs rather than pretending it works.
- **Secrets stay out of git and out of the browser.** `.env` files are ignored; the web app
  only ever knows public URLs.
- **Migrations are additive** where possible, so a deploy never breaks a running game's data.
  Don't deploy during a live event: games are held in memory.

## Commits

Small commits with a clear subject in the conventional style the history already uses
(`feat(stage): …`, `fix(media): …`, `test(server): …`, `docs: …`), and a body that says
why, not just what.

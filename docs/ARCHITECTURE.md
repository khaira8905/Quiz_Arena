# Architecture

## Repository layout and why

```
apps/web          one Next.js app — /admin, /host/[code], /play, landing
apps/server       Fastify + Socket.IO + Prisma — the only stateful process
packages/shared   the contract: socket events, views, Zod schemas, scoring, question types
```

The brief suggested separate `web`, `admin` and `host` apps. A single Next.js app is the better
fit: the three experiences share tokens, components, the socket client and the auth proxy; one
Vercel project serves the exact URL structure (`/admin`, `/host/QA482193`, `/play`); and route-level
code splitting already keeps the player bundle free of admin code (React Query, dnd-kit and the
editor only load under `/admin`). Separate visual hierarchy is a design decision, not a
deployment one.

`packages/shared` ships TypeScript source ("internal package"): Next transpiles it, tsup bundles
it into the server, and Vitest/tsx run it directly — no build step to forget. Subpath exports
(`@quizarena/shared/game`) let the player bundle import types and constants without Zod.

## The game engine

`apps/server/src/game/game-room.ts` — one `GameRoom` per live session, in memory, owned by a
single process. It is transport-agnostic: it talks to a `RoomOutput` (implemented with Socket.IO
rooms, or arrays in tests) and a `GamePersistence` (Prisma, or memory in tests).

### State machine

```
LOBBY ──START──► COUNTDOWN ──(4.5s)──► QUESTION_ACTIVE ──LOCK / timer / all answered──► QUESTION_LOCKED
                                           │  ▲ PAUSE/RESUME                                  │
                                           └──────────────── REVEAL ──────────────────────────┤
                                                                                              ▼
      FINISHED ◄──NEXT (last)── LEADERBOARD ◄──LEADERBOARD── ANSWER_REVEAL ──NEXT──► QUESTION_ACTIVE (next)
         ▲                                                                   SKIP (from ACTIVE/LOCKED) ─┘
         └──────────────────────────────── END (from any phase) ──────────────────────────────────
```

`availableCommands()` is the single source of truth for what a host may do; the server rejects
anything else with `COMMAND_NOT_ALLOWED`, and the UI renders buttons from the same list.

### Authority

| Concern         | Rule                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct answers | Never leave the server before reveal. Player views carry option ids and text only.                                                                                                                 |
| Timer           | `deadline` is server time. The `setTimeout` only triggers the UI transition; acceptance is `receivedAt ≤ deadline + 350ms grace`, where `receivedAt` is stamped first thing in the socket handler. |
| Pause           | Stores remaining time; resume sets a new deadline. Response time = `duration − (deadline − receivedAt)`, so paused time never counts. Answers are rejected while paused.                           |
| Duplicates      | One answer per participant per question, checked in memory and by a DB unique constraint.                                                                                                          |
| Scoring         | Computed at **reveal**, not at lock, so a player's score/rank can't leak correctness before the projector shows it. Skipped questions score nothing.                                               |
| Ranking         | Score desc → total response time asc → join order. Unique ranks for an unambiguous projector.                                                                                                      |
| Joining         | Phase, late-join setting, participant limit (reservations close the check-then-insert race), nickname rules and case-insensitive uniqueness.                                                       |

### Persistence

Write pattern per game: one insert per join (awaited, so answers always have a FK), a single
`createMany` of all answers per scored question, and one transaction for final results + session
status. The quiz is **snapshotted** into the session at creation (including the randomised order),
so editing or deleting a quiz never changes historical results.

## Realtime contract

Typed in `packages/shared/src/events.ts`; both ends compile against it.

| Direction | Event                                                       | Notes                                                            |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| C→S       | `session:join` `{code, nickname}`                           | → `{participantId, token, view}`                                 |
| C→S       | `player:reconnect` `{code, token}`                          | rebinds a seat; an older socket on the same seat is closed       |
| C→S       | `question:answer` `{questionId, optionId}`                  | → server receipt with `receivedAt`                               |
| C→S       | `timer:sync` `{clientTime}`                                 | NTP-style probe for display-only clock offset                    |
| C→S       | `host:attach` / `host:command` / `host:kick`                | require a valid socket ticket for the session's host             |
| S→C       | `session:state`                                             | full role-specific snapshot on every phase change and (re)attach |
| S→C       | `session:player_joined/left/status`, `session:player_count` | host deltas, throttled counts                                    |
| S→C       | `question:progress`                                         | answered count + live distribution (hosts only, ~7/s max)        |
| S→C       | `timer:sync`                                                | deadline moved (pause/resume)                                    |
| S→C       | `session:closed`                                            | kicked, replaced by another tab, or seat expired                 |

Session creation is REST (`POST /api/sessions`) because it is a normal authenticated write.

**Why snapshots instead of deltas for phases:** a player view is under 1 KB; sending the whole
truth on each transition makes reconnects, missed packets and out-of-order delivery non-issues.
Deltas are used only where frequency matters (joins, answer counts) and only to hosts.

**Fan-out cost:** each transition is 1 host emit + N small per-player emits to `p:<id>` rooms.
Measured at 500 players: slowest fan-out 134 ms end-to-end on one node.

## Connections

- Socket.IO heartbeats (`pingInterval` 10s, `pingTimeout` 15s) detect dead phones in ≤ 25s.
- In the lobby, a dropped seat is released after 30s (nickname freed). Mid-game, seats are kept
  so a player can return to their score.
- Players store `{code, token}` in `localStorage`; every new transport connection re-binds with
  `player:reconnect`. Only the SHA-256 of the token is stored server-side.
- A second tab/device using the same token takes the seat; the old one gets `REPLACED_BY_NEW_CONNECTION`.

## Security

- **Admin auth:** bcrypt passwords; HS256 JWT in an `httpOnly`, `SameSite=Lax`, `Secure` (prod)
  cookie. The browser calls `/api/*` on the web origin, which Next rewrites to the API, so the
  cookie is first-party (no third-party cookie problems in Safari).
- **Socket auth:** sockets can't see the web cookie, so hosts fetch a 60-second, audience-scoped
  ticket from `/api/auth/socket-ticket`. A session token is rejected as a ticket and vice versa.
- **Authorization:** every quiz/question/session query is scoped to the owner; foreign ids return
  404 (no existence leak). Host commands verify `room.hostId === ticket.sub`.
- **Validation:** Zod on every REST body/query and every socket payload; control characters are
  stripped; nicknames are NFKC-normalised, charset-restricted and optionally profanity-filtered.
- **Abuse:** global REST rate limit (300/min), stricter on login (10/min) and code lookup
  (30/min); per-socket token buckets (answers/commands, and joins separately); 16 KB socket
  payload cap; 256 KB body cap.
- **Output:** CSV export neutralises spreadsheet formula injection; security headers on both apps;
  the admin portal can't be framed.
- **Config:** the server refuses to boot in production with the development JWT secret. No secret
  is exposed via `NEXT_PUBLIC_*`.

## Frontend structure

```
src/app/            routes (admin/(portal) has the authenticated shell; preview is full-bleed)
src/components/ui   primitives (Button, Field, Switch/Segmented, Dialog, Badge, Skeleton, …)
src/components/game stage + phone building blocks (Countdown, AnswerTile, Leaderboard, …)
src/components/{admin,editor,live,host,play}  feature components
src/lib/            api client, React Query hooks, socket + clock sync, sound, formatting
src/lib/game/       useHostGame / usePlayerGame — the realtime state hooks
```

Design tokens live in `src/app/globals.css` (`:root` variables mapped into Tailwind's `@theme`):
semantic colours, the Flare/Ion/Sol/Nova answer palette, a fluid type scale including
projector-only sizes, and the notch / arena-floor motifs. Components never hardcode colours.

Motion rules: admin motion is short and calm; the stage uses larger, slower movement for
distance; answer feedback is fast enough for gameplay. Leaderboards use layout animation from the
previous order to the new one so overtakes are visible. `MotionConfig reducedMotion="user"` plus a
CSS fallback respect `prefers-reduced-motion`; confetti and shockwaves are disabled there.

## Scaling out

One node comfortably runs hundreds of players per game and many concurrent games: the engine does
O(players) work per transition and nothing per frame. To go beyond one node:

1. Set `REDIS_URL` → the Socket.IO Redis adapter makes every emit reach sockets on any node.
2. Route each game to the node that owns its room. Rooms are in memory, so a player for `QA482193`
   must land on the node that created `QA482193` — e.g. Fly.io `fly-replay` by game code, or a
   sticky load balancer keyed on a `game` query parameter, with a small registry
   (`code → node`) in Redis.
3. For crash tolerance, persist room state to Redis at each transition and rehydrate on boot
   (the snapshot-based design keeps this small: phase, question index, deadline, scores).

Until step 3, a server restart ends running games; on boot the server marks them `ABANDONED`
so dashboards stay truthful.

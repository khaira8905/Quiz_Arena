# Deployment

QuizArena is two deployables plus a database:

| Piece            | Where                                         | Why                                                                   |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web`       | **Vercel**                                    | Static + server-rendered Next.js; proxies `/api/*` to the game server |
| `apps/server`    | **Railway, Render or Fly.io**                 | Long-running Node process holding WebSockets and live game state      |
| PostgreSQL       | **Neon, Supabase** or the platform's Postgres | Content, sessions, answers, results                                   |
| Redis (optional) | Upstash / Railway / Fly                       | Multi-node Socket.IO fan-out                                          |

> Do not deploy the game server as Vercel serverless functions. Functions are short-lived and
> can't hold WebSocket connections or in-memory game rooms.

Target URLs (replace with yours):

```
https://quiz-arena.vercel.app/            landing + join
https://quiz-arena.vercel.app/admin       control room
https://quiz-arena.vercel.app/host/QA4821 projector
https://quiz-arena.vercel.app/play        players
https://quizarena-server.up.railway.app   game server (API + WebSocket)
```

## 1. Database

Create a Postgres database (Neon or Supabase free tiers work) and copy its connection string.
Use the **pooled** URL if your provider offers one; the server keeps a small pool (10).

## 2. Game server

The image is built from the repository root with `apps/server/Dockerfile`. On boot it runs
`prisma migrate deploy` and then starts the server, so migrations ship with each deploy.

Required environment:

```
DATABASE_URL=postgresql://…
JWT_SECRET=<openssl rand -base64 48>
WEB_ORIGIN=https://quiz-arena.vercel.app
NODE_ENV=production
TRUST_PROXY=true
```

### Railway

1. New project → Deploy from GitHub repo. `railway.json` selects the Dockerfile and health check.
2. Add a PostgreSQL plugin (or paste an external `DATABASE_URL`), then set the variables above.
3. Settings → Networking → Generate domain. Keep **1 replica** (see "Scaling" below).

### Render

1. New → Blueprint → select the repo. `render.yaml` creates the game server on the **free**
   instance type and generates `JWT_SECRET`. The database is external (e.g. Neon free plan).
2. When prompted, paste `DATABASE_URL` and `WEB_ORIGIN`.
3. Free instances sleep after ~15 minutes without traffic and take up to a minute to wake —
   open the site a few minutes before an event and keep it open. For always-on, change the
   instance type to Starter.

### Fly.io

```bash
fly launch --no-deploy --copy-config      # uses fly.toml
fly secrets set DATABASE_URL=… JWT_SECRET=… WEB_ORIGIN=https://quiz-arena.vercel.app
fly deploy
```

`fly.toml` disables auto-stop so a machine is never stopped mid-game.

### Create the first admin

Run the seed once against production (from your machine or a one-off shell on the platform):

```bash
DATABASE_URL=… SEED_ADMIN_EMAIL=you@org.edu SEED_ADMIN_PASSWORD='a long password' pnpm db:seed
```

(Or set `ALLOW_REGISTRATION=true` temporarily and call `POST /api/auth/register`.)

Check `https://<server>/health` → `{"ok":true,…}`.

## 3. Frontend on Vercel

1. Import the repo. **Root Directory: `apps/web`**. Framework preset: Next.js. Vercel detects pnpm
   workspaces and installs from the repo root.
2. Environment variables (Production and Preview):
   ```
   API_ORIGIN=https://quizarena-server.up.railway.app
   NEXT_PUBLIC_REALTIME_URL=https://quizarena-server.up.railway.app
   NEXT_PUBLIC_SITE_URL=https://quiz-arena.vercel.app
   ```
   `API_ORIGIN` is read by the rewrites at **build time**: redeploy after changing it.
3. Deploy, then add the final Vercel URL to the server's `WEB_ORIGIN` (comma-separate preview
   domains if you want previews to work) and redeploy the server.

## 4. Smoke test

1. `/admin` → sign in → **Go live** on the sample quiz.
2. Open the projector view; scan the QR with a phone; join.
3. Start, answer, reveal, leaderboard, end. Check results and CSV export in Sessions.

Optional load check from your machine against production:

```bash
SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… pnpm loadtest -- --api https://<server> --players 100
```

## Scaling

- A single instance handles 500 simulated players in one game with millisecond acks. Run **one
  instance** unless you also route by game code (live rooms are in memory).
- `REDIS_URL` enables the Socket.IO Redis adapter for multi-node fan-out; see
  [ARCHITECTURE.md → Scaling out](ARCHITECTURE.md#scaling-out) for game-code routing.
- Restarting the server ends live games (they're marked `ABANDONED`). Deploy between events.

## Security checklist

- [ ] `JWT_SECRET` is random and ≥ 32 characters (the server refuses the dev default in production)
- [ ] `WEB_ORIGIN` lists only your frontend domains
- [ ] `NODE_ENV=production` (secure cookies, JSON logs)
- [ ] `TRUST_PROXY=true` only when the server is behind the platform's proxy
- [ ] `ALLOW_REGISTRATION` is off unless you want open sign-up
- [ ] Database credentials are only in the server's environment, never in Vercel

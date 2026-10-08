# Attune

> **Not personalized content. Personalized engagement.**

Attune is an engagement intelligence layer for learners. It works out _why_ a learner has
disengaged (bored, stuck, tired, curious, or alone) and changes the next few minutes to fit. It
explains every decision, lets the learner overrule it, learns from what actually brings them back,
and runs on a cheap phone with no connection.

![Session: a bored, capable learner gets a real problem, with the reason and the engine trace](../../docs/attune/screenshots/session.png)

| "Too easy": strictly harder, with the reason            | "Explain differently": a new modality                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ![Too easy](../../docs/attune/screenshots/too-easy.png) | ![Explain differently](../../docs/attune/screenshots/explain-differently.png)        |
| **Check-in reflection**                                 | **Offline: events queue, then sync**                                                 |
| ![Check-in](../../docs/attune/screenshots/check-in.png) | ![Offline](../../docs/attune/screenshots/offline.png)                                |
| **Mentor view (labelled simulated class)**              | **Phone, dark mode**                                                                 |
| ![Educator](../../docs/attune/screenshots/educator.png) | <img src="../../docs/attune/screenshots/mobile-dark.png" alt="Mobile" width="280" /> |

- Product architecture and the reasoning behind it: [`docs/attune/PRODUCT.md`](../../docs/attune/PRODUCT.md)
- The engine (pure TypeScript, tested): [`packages/engine`](../../packages/engine)

## Run it

```bash
pnpm install
pnpm --filter @attune/web dev      # http://localhost:3100
```

Production build:

```bash
pnpm --filter @attune/web build && pnpm --filter @attune/web start
```

Optional: set `ANTHROPIC_API_KEY` to enable the AI gateway, which rewrites explanations around a
learner's interests. Without it, everything works and the UI says the gateway isn't configured.

### Deploy

It's a standard Next.js app with three route handlers. On Vercel, set the project's root directory
to `apps/attune` (the install picks up the pnpm workspace). On any Node 22 host, run
`next build && next start`. No database is needed for the prototype, because the sync store is
in-memory behind an interface.

## The 4-minute judge demo

Open the app, then pick a scenario on the home page or from **Demo** in the top bar. All four
learners are fictional, and they're labelled as such.

1. **Aarav: bored but capable.** The first move is a real cricket problem, not a lecture, and the
   reason is on screen. Open **Why this?**.
2. Press **Too easy**. The level steps 3 → 4 → 5, and an "Adapted" ribbon shows exactly what changed.
3. Press **Explain differently**. The presentation changes completely: a visual you can play with,
   then a worked example, then plain words.
4. Under **I'm feeling**, press **Bored**. It switches from explaining to an interactive challenge.
5. Watch the **engine trace** (Detect → Understand → Intervene → Observe → Adapt): the signals,
   the state probabilities, each option's `prior × learned × context × novelty` score, and the
   model updates after each activity.
6. **End session**, then **Fast-forward to tomorrow**. Day 2 starts where the evidence points and
   quotes yesterday's result, with a "Recognised pattern" badge. The **Twin** shows what changed
   since yesterday.
7. **Ishita: overwhelmed, on a shared phone, on 3G.** Same topic, the opposite strategy: guided
   steps on the prerequisite, in Light mode with the payload size shown. Set the connection control
   to **Offline**, keep working, switch back, and watch the outbox sync.
8. **Meera** gets a curiosity path that ends at logarithms. **Kabir** gets a peer mission.
9. **Educator** shows class-level patterns with no individual surveillance. It's computed by running
   the real engine over a labelled simulated class.

**Autoplay** in the Demo panel lets a simulated learner drive one step at a time, with narration.

## How it's built

```
packages/engine   @attune/engine: the intelligence, with no I/O
  signals.ts          Detect: events → named features, each with plain-language evidence
  state-engine.ts     Understand: weighted evidence → softmax over 11 interaction states
  policy.ts           Intervene: rule prior × learned effectiveness × context × novelty
  activity-engine.ts  Calibrated difficulty (logistic ability model) + content selection
  why.ts              The Why layer: one-sentence reason, evidence, what's being watched
  learner-model.ts    Observe/Adapt: outcome evaluation, ability, traits, effectiveness table
  orchestrator.ts     The loop as a pure reducer: startSession / dispatch / endSession / nextDay
  metrics.ts          Recovery, calibration, persistence, return to learning, growth moments
  simulator.ts        Persona simulator: autoplay, end-to-end tests, the demo cohort
  cohort.ts           Educator analytics, computed by running the engine on a simulated class
  content/            One topic in depth: 5 levels, 5 explanation modalities, paths, missions

apps/attune       @attune/web: Next.js app
  lib/store.tsx         Session state, device persistence, sync outbox
  lib/connectivity.tsx  FULL / LIGHT / OFFLINE resolution, health probe
  public/sw.js          Offline app shell (the activity library ships in the bundle)
  app/api/sync          zod-validated, idempotent event ingestion
  app/api/ai            AI gateway (Claude): rewrites words, never decides
  components/session    Activity renderers, engagement arc, engine trace, controls
```

### Principles enforced in code

- **Controls are constraints.** "Too easy" sets `minDifficulty = current + 1`. "Explain differently"
  excludes the current modality. Tests pin both.
- **No diagnosis.** States describe the interaction, never the person, and the UI says so where
  states appear.
- **Data minimisation.** Free text becomes keywords on the device. Reflection notes never sync, and
  the sync schema rejects them. Shared-device mode keeps data for the tab only.
- **Honest data.** Personas, peers and the educator cohort are labelled as simulated wherever they
  appear.
- **No time-on-app metric.** The engine recognises when the right move is to stop.

## Tests

```bash
pnpm --filter @attune/engine test   # state engine, policy, controls, learning loop, scenarios, schemas
pnpm --filter @attune/web test      # intake keyword extraction
```

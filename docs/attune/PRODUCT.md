# Attune: product architecture

> **Not personalized content. Personalized engagement.**
>
> Attune is an engagement intelligence layer for learners. It does not try to make students spend
> more time learning. It tries to understand what is stopping them from wanting to learn right now,
> and to change the next few minutes accordingly.

This document is the reasoning that came before the code. It covers the problem, the people, the
states, the interventions, the decision loop, the architecture, the data model, the journeys, and
the minimum build that proves the idea.

---

## 1. The problem being solved

Learning platforms personalize **content**: what to study next and at what level. They assume the
learner is already willing and only needs the right material. But the most common failure in a
student's evening isn't that the wrong worksheet was shown. The student stopped engaging, and the
reasons for that vary:

| What it looks like      | What is actually going on                    | What a content engine does  | What actually helps              |
| ----------------------- | -------------------------------------------- | --------------------------- | -------------------------------- |
| Scrolling past the work | It is too easy and feels pointless           | Shows another explanation   | A harder, real problem           |
| Scrolling past the work | It is too hard and feels hopeless            | Shows another explanation   | Smaller steps and an early win   |
| Rereading the same page | The explanation format doesn't work for them | Shows the same text again   | A different modality             |
| Short, careless answers | They are exhausted                           | Assigns more practice       | Something light, or a real break |
| Opening other tabs      | They are curious about something adjacent    | Pulls them back on syllabus | A curiosity path that loops back |
| Not asking for help     | They feel alone with it                      | Nothing                     | A small mission with peers       |

**Disengagement is a symptom with several causes.** Attune is built to tell those causes apart and
respond to each one differently.

The product loop is:

```
Detect → Understand → Intervene → Observe → Adapt
  ↑                                           │
  └───────────────────────────────────────────┘
```

Personalization is never a one-time questionnaire. Each interaction updates the learner model, and
the model changes the next decision.

## 2. Personas

The four demo personas share **the same topic** (Class 11 exponents and logarithms), so the demo
shows the same content producing four different interventions.

| Persona    | Context                                                                 | Underlying cause                      | What Attune should do                                                    |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| **Aarav**  | Strong at maths, avoiding a logs assignment, into cricket and startups  | Under-challenged; difficulty mismatch | Skip the lecture, give a real-world challenge, then raise the difficulty |
| **Ishita** | Fell behind after illness, on a shared family phone on 3G               | Overwhelmed; too much at once         | Reduce complexity, guided steps, early wins, light mode                  |
| **Meera**  | Keeps opening tabs about space and why paper can't be folded many times | Curious, exploring off-syllabus       | Open a curiosity path that returns to the syllabus                       |
| **Kabir**  | Moved schools mid-year, works alone in the evenings, capable but flat   | Socially disconnected                 | A small peer mission where his part matters                              |

Secondary users:

- **Mentor or educator**: needs to know what is happening across the class, why, and what to do,
  without surveilling individuals.
- **Parent or guardian on a shared device**: needs the learner's data not to leak between users.

## 3. Engagement states

These are **interaction states**: descriptions of how someone is interacting right now. They are
not psychological or medical diagnoses, and the product never presents them as such.

| State             | Family           | Typical evidence                                                           |
| ----------------- | ---------------- | -------------------------------------------------------------------------- |
| `FOCUSED`         | Engaged          | Steady completions, accuracy near the calibrated target, no switching      |
| `CURIOUS`         | Engaged          | Self-reported curiosity, follows "why" links, "aha" reactions              |
| `EXPLORATORY`     | Engaged          | Asks to explore, completes curiosity paths, wanders productively           |
| `UNDERCHALLENGED` | Under-stimulated | Fast correct streaks, "Too easy", high mastery on the current concept      |
| `BORED`           | Under-stimulated | Self-report, abandoned passive activities, "meh" reactions                 |
| `UNMOTIVATED`     | Under-stimulated | "Not interested", activity switching, low perceived relevance              |
| `CONFUSED`        | Overloaded       | Wrong answers on one concept, "Explain differently", "lost" reactions      |
| `OVERWHELMED`     | Overloaded       | Slow answers, hint requests, "Too hard", self-report                       |
| `FRUSTRATED`      | Overloaded       | Repeated misses plus fast guessing, a sign the learner is giving up        |
| `LOW_ENERGY`      | Depleted         | Low self-reported energy, running past the learner's own time budget       |
| `DISCONNECTED`    | Social           | Self-report ("on my own with this"), high social affinity, no peer contact |

The engine combines **self-report** (the check-in, quick reactions, the "How are you?" control),
**interaction behaviour** (latency, accuracy, attempts, hints, abandonment, switching), **controls**
(Too easy, Too hard, and so on), and **history** (the learner model's traits and what has worked
before). Recent evidence counts more than old evidence. The output is a probability distribution
over states with an evidence list, not a single label, and the UI always shows the evidence.

## 4. Intervention taxonomy

| Intervention        | Purpose                                          | Activity form                                     |
| ------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `CONTINUE`          | Don't interrupt flow                             | Calibrated practice at the current level          |
| `RAISE_CHALLENGE`   | Fix "too easy"                                   | A harder question (difficulty strictly increases) |
| `STRETCH_CHALLENGE` | Give a capable learner something to push against | A timed, multi-part real-world problem            |
| `REAL_WORLD_HOOK`   | Fix "why does this matter"                       | A problem framed in the learner's own interests   |
| `GUIDED_STEPS`      | Reduce complexity                                | One problem broken into checked steps             |
| `SWITCH_MODALITY`   | Fix "this explanation isn't working"             | Visual, analogy, worked example or dialogue       |
| `MODALITY_CHOICE`   | Hand control back                                | Learner picks how to explore next                 |
| `MICRO_WIN`         | Restart momentum with almost no effort           | A one-tap, near-certain success                   |
| `CURIOSITY_PATH`    | Turn wandering into learning                     | A branching path that returns to the syllabus     |
| `PEER_MISSION`      | Reconnect                                        | A three-person mission where your part matters    |
| `REFLECTION`        | Consolidate                                      | One line: "what would you tell a friend?"         |
| `BREAK`             | Stop, honestly                                   | A short reset, or "this is a good place to stop"  |

**Most of these are not "more content".** A break, a peer mission or a change of modality is a
legitimate answer. The goal is meaningful engagement, not screen time.

## 5. The adaptive decision loop

```
          ┌───────────── events (answers, controls, reactions, check-ins) ─────────────┐
          ▼                                                                             │
   Signal extraction ──► Engagement State Engine ──► Adaptive Intervention Engine ──► Activity Engine
   (features + evidence)  (state distribution)        (scored candidates + why)       (calibrated activity)
          ▲                                                                             │
          │                                                                             ▼
   Learner Model ◄──────────── Feedback Processor (did engagement recover?) ◄──── learner responds
```

**Selection.** Each candidate intervention for the detected state gets a score:

```
score = policy prior(state, intervention, learner traits)
      × learned effectiveness (this learner's recovery rate for state × intervention, Beta-smoothed)
      × context fit (energy, time left, connectivity mode)
      × novelty (penalize repeating the same thing when it isn't working)
```

The best candidate wins. The others are kept as "considered, and why not", which feeds the Why
layer.

**Human control overrides the policy.** Too easy, Too hard, Explain differently, Challenge me,
Let me explore, Not interested, Change activity and Take a break each attach a hard constraint to
the next decision. For example, Too easy means the next difficulty must be strictly higher, and
Explain differently means the next modality must differ from the current one. Each control is also
evidence for the state engine. User feedback becomes a system adaptation, which produces a better
intervention.

**Observation.** When an activity ends, the Feedback Processor compares the engagement index before
the decision with the index after the learner's response. It also takes completion and reactions
into account. The result, recovered or not, updates the learner's effectiveness table, their
modality affinities and their traits. The next time the same state appears, the decision draws on
this history, and the Why layer says so: "Last time you felt like this, a challenge brought you
back 2 out of 2 times."

**Difficulty calibration.** Each concept has an ability estimate θ on the 1–5 difficulty scale.
The model is logistic: P(correct) = σ(1.4·(θ − d)). Target success depends on state: 70% when
focused, 90% when overwhelmed, 50% when under-challenged. Target difficulty is solved from θ, then
the control constraints are applied.

## 6. System architecture

Every box is a module behind a typed interface, so any of them can be replaced: a learned policy
for the rule-plus-bandit selector, another database behind the account repository
(`lib/cloud.ts`), a different model behind the AI gateway.

```
┌──────────────────────────── Client (Next.js, works offline) ────────────────────────────┐
│  Onboarding · Session · Twin · Progress · Community · Educator · Story · Account        │
│        │                                                                                 │
│  Session Orchestrator ── @attune/engine (pure TypeScript, no I/O)                        │
│        │                   ├─ Signal extraction    ├─ Engagement State Engine            │
│        │                   ├─ Intervention Engine  ├─ Activity Engine + content library  │
│        │                   ├─ Feedback Processor   ├─ Learner Model (+ merge)            │
│        │                   ├─ Why layer            └─ Analytics / metrics / model story  │
│        │                                                                                 │
│  Connectivity manager ─ device store + event outbox ─ sync status machine                │
│  Service worker (app shell + activity pack cache)                                        │
└───────┬───────────────────────────────┬───────────────────────────────┬─────────────────┘
        │ signed in: supabase-js, RLS    │ guest: POST /api/sync         │ POST /api/ai (optional)
┌───────▼────────────────────────┐ ┌────▼─────────────────────┐ ┌───────▼──────────────────┐
│ Supabase (Free)                │ │ Demo sync server          │ │ AI Gateway               │
│ Auth: email + password, PKCE   │ │ idempotent, in-memory,    │ │ rewrites explanations;   │
│ Postgres: events → trigger →   │ │ labelled as a demo        │ │ never decides; falls back│
│ attempts / progress / feedback │ └──────────────────────────┘ │ to the library           │
│ learner_models (revisioned)    │                              └──────────────────────────┘
│ learning_sessions (resumable)  │
└────────────────────────────────┘
```

**Why the engine runs on the client.** Low-resource environments are a first-class requirement.
The decision loop has to work with no network, on an old phone, in under a millisecond per
decision. So the intelligence is deterministic TypeScript that runs anywhere, and the network is an
enhancement. The same package runs on the server to build the educator analytics and could run
inside a sync worker.

**Where the LLM fits.** Generation is one component, not the product. The AI gateway can rewrite an
explanation in a requested modality, or frame a problem in a learner's interest. It never chooses
the intervention. If it is slow, unavailable, or the device is in light or offline mode, the
curated library is used and the UI says which source it used.

### Connectivity modes

| Mode        | Trigger                                                   | Behaviour                                                                                             |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **FULL**    | Online on a good connection                               | AI gateway on, interactive visuals, motion                                                            |
| **LIGHT**   | `saveData`, 2G/3G effective type, or the learner's choice | Text-first rendering of the same activity, no charts or motion, no AI calls, payload size shown       |
| **OFFLINE** | `offline` event, a failed probe, or the learner's choice  | Cached activity pack, the full engine runs locally, events queue in an outbox                         |
| **SYNC**    | Connectivity returns                                      | Outbox drains in idempotent batches with visible progress; a failure backs off and offers "Retry now" |

The sync state is always visible as one of six: **Online**, **Offline**, **Reconnecting** (the
network is back but the server isn't answering yet), **Syncing**, **Synced**, **Sync failed**.

All four are working behaviour in the prototype that you can switch between, not slides.

## 7. Data model

All boundary data is validated with zod schemas in `@attune/engine`.

- **`LearnerEvent`** (append-only, syncable, carries an `id` for idempotency):
  `checkin`, `activity_started`, `answer`, `hint`, `control`, `reaction`,
  `activity_completed`, `activity_abandoned`, `reflection`.
- **`LearnerModel`**: a pseudonymous id and display name; goals; interests; the traits
  `curiosity`, `challengePreference`, `momentum`, `consistency`, `socialAffinity` and
  `difficultyTolerance` (0–1 each); per-concept ability θ; modality affinities as Beta counts; an
  intervention effectiveness table keyed by `state × intervention`; daily snapshots for
  "Yesterday / Today"; and consent flags.
- **`Decision`**: the state distribution and evidence, the chosen intervention, the scored
  alternatives, the constraints applied, the activity, and the Why rationale.
- **`TimelineEntry`**: the engagement index before and after each decision, plus the outcome. This
  drives the engagement arc.

**In Postgres** (with an account; see `apps/attune/supabase/migrations`): `profiles`,
`user_settings`, `learner_models` (JSON model + `revision` for optimistic concurrency),
`learning_sessions` (resumable snapshot), `events` (append-only, unique per user and client event
id), the derived `attempts`, `activity_progress` and `feedback` (written only by a trigger),
`activities` (the catalogue, for foreign keys) and `milestones`. Every table has Row Level Security
with own-row policies. Progress and metrics on the Progress page are counted from these rows, and
never estimated.

Things that are deliberately **not stored**: real names (only a display name the learner chooses),
free-text check-ins (kept in memory for the session, reduced to keywords), location, contacts, and
any mental-health inference.

## 8. Core user journey

1. **Check-in (about 40 seconds, conversational).** "What's on your mind right now?", "What are you
   supposed to be doing?", "How are you actually feeling about it?", "What would make the next 20
   minutes worthwhile?" Answers are chips, text or voice. Connection quality is detected, not
   asked.
2. **Reflection back.** "Here's what I'm picking up": a plain-language read of the situation with
   its evidence and a "Not quite" correction.
3. **Adaptive session.** A dynamically chosen sequence of micro-experiences. Each comes with a
   one-line reason and a "Why this?" link, and controls are always visible.
4. **Engagement arc.** A live curve of the session showing each intervention and its effect.
5. **A good place to stop.** The session ends by recognising effort and naming what changed,
   without streaks.
6. **Twin.** The learner sees what the system believes about them, where each belief came from, and
   can correct, pause or delete it.

## 9. Judge demonstration journey (3–5 minutes)

1. **Open Demo mode and pick Scenario A, Aarav.** The check-in is pre-filled. Click through it in
   about 15 seconds and see the read: "Less 'can't do this', more 'this isn't asking enough of
   you.'"
2. The first decision is **a real-world challenge, not a lecture**, with its reason on screen.
3. Answer quickly and correctly, then press **Too easy**. The difficulty visibly rises (2 → 3 → 4)
   and the reason cites the fast streak.
4. Press **Explain differently**. The presentation changes completely (text → visual → analogy).
5. Say **"I'm bored"**. The modality changes from passive to interactive.
6. Open the **engine trace**. Signals, state probabilities, scored candidates and model deltas are
   all visible.
7. Click **Fast-forward to tomorrow**. A new session opens _already_ at challenge level, and the
   reason quotes yesterday's evidence. This is the Adapt step working.
8. Switch to **Scenario B (Ishita)**. Same topic, completely different strategy: guided steps,
   light mode, early wins. Toggle **offline**, keep working, reconnect, and watch it sync.
9. Glance at **Scenarios C and D** (a curiosity path and a peer mission), then the **Educator view**:
   class-level patterns with no individual surveillance.

## 10. Minimum viable implementation

Built in this prototype:

- `@attune/engine`, a tested pure package covering the state engine, intervention engine, activity
  engine with calibrated difficulty, feedback processor, learner model, Why layer, metrics and a
  persona simulator.
- A curated activity library for one topic, done in depth: questions at five difficulty levels,
  explanations in five modalities, guided steps, interest-framed challenges, a curiosity path, a
  peer mission, micro wins, reflection and a break.
- The app: onboarding, adaptive session, engine trace, digital twin with privacy controls,
  community missions, educator view (computed by running the real engine over a labelled simulated
  cohort), and the story page.
- The FULL, LIGHT, OFFLINE and SYNC modes, a service worker, a sync API and an optional AI gateway.

Deliberately out of scope: accounts, a production database, real peer networking, and multi-topic
authoring tools. The interfaces for each exist so they can be added without touching the engine.

## Principles we hold ourselves to

- **Explain every decision.** If we can't say why in one sentence, we shouldn't do it.
- **The learner can always override.** Controls are constraints, not suggestions.
- **No diagnosis.** We describe interaction states, never minds.
- **Data minimization.** Store derived signals, not transcripts. Everything is visible and
  deletable from the Twin.
- **Recognize when to stop.** A good session can end early.
- **Honest data.** Anything simulated is labelled as simulated, in the UI and in the docs.

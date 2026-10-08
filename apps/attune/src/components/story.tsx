import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { INTERVENTION_META, SCENARIOS, STATE_META, startSession } from "@attune/engine";
import storyMedia from "../../public/media/story/chapters.json";
import { Eyebrow } from "./ui";
import { VoxelStoryVideoCard } from "./ui/voxel-story-video-card";

/** The 26-second story, recorded from the real app by `scripts/record-story.mjs`. */
export function AttuneStoryVideo({
  className,
  autoPlayInView = false,
}: {
  className?: string;
  autoPlayInView?: boolean;
}) {
  return (
    <VoxelStoryVideoCard
      eyebrow="The wow moment · recorded from the app"
      title="“I'm bored” → a harder, real problem, in one tap"
      description="Before → Detection → Intervention → Response → Adaptation. A fictional demo learner, real engine."
      sources={[{ src: "/media/story/attune-story.webm", type: "video/webm" }]}
      poster="/media/story/poster.jpg"
      captions="/media/story/captions.vtt"
      chapters={storyMedia.chapters}
      durationLabel={`0:${String(storyMedia.duration).padStart(2, "0")}`}
      autoPlayInView={autoPlayInView}
      className={className}
    />
  );
}

/**
 * The pitch, as a page: problem → insight → model → how it works → live demo → adaptation →
 * learner model → infrastructure → privacy → impact → scale.
 */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-line py-14">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="type-h1 mt-3 max-w-3xl text-ink">{title}</h2>
      <div className="mt-6 max-w-3xl space-y-4 text-[16.5px] leading-relaxed text-ink-2">
        {children}
      </div>
    </section>
  );
}

const CAUSES = [
  ["Too easy", "Another explanation", "A harder, real problem"],
  ["Too hard", "Another explanation", "Smaller steps, an early win"],
  ["Explanation isn't landing", "The same text again", "A different modality"],
  ["Exhausted", "More practice", "Something light, or a real break"],
  ["Curious about something else", "Back to the syllabus", "A tangent that loops back"],
  ["Alone with it", "Nothing", "A small mission with peers"],
];

export function Story() {
  // The table below is computed live by the engine from each scenario's check-in, not written by hand.
  const firstMoves = SCENARIOS.map((s) => {
    const d = startSession({
      id: `story-${s.id}`,
      learner: s.learner(),
      checkin: s.checkin,
      now: 0,
    }).current!;
    return {
      s,
      state: d.reading.primary,
      kind: d.kind,
      title: d.activity.title,
      summary: d.rationale.summary,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-12 sm:px-6">
      <Eyebrow>The story</Eyebrow>
      <h1 className="type-display mt-4 max-w-4xl text-ink">
        We&apos;re not trying to make students spend more time learning.
      </h1>
      <p className="type-h2 mt-5 max-w-3xl text-ink-2">
        We&apos;re trying to understand what stops them from wanting to learn in the first place.
      </p>

      <AttuneStoryVideo className="mt-10" />

      <Section
        id="problem"
        eyebrow="01 · The problem"
        title="Students don't disengage for one reason. Platforms respond as if they do."
      >
        <p>
          Learning platforms personalise <em>content</em>: what to study next, and at what level.
          They assume the student is willing and just needs the right worksheet. But the evening
          usually goes wrong earlier than that: the student has stopped engaging, and the reason
          varies from student to student and from hour to hour.
        </p>
      </Section>

      <Section
        id="hidden"
        eyebrow="02 · The hidden problem"
        title="Disengagement is a symptom with several causes."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14.5px]">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 font-normal">What&apos;s actually going on</th>
                <th className="py-2 font-normal">What a content engine does</th>
                <th className="py-2 font-normal">What actually helps</th>
              </tr>
            </thead>
            <tbody>
              {CAUSES.map(([cause, bad, good]) => (
                <tr key={cause} className="border-b border-line/60">
                  <td className="py-2.5 pr-3 text-ink">{cause}</td>
                  <td className="py-2.5 pr-3 text-muted line-through decoration-line-strong">
                    {bad}
                  </td>
                  <td className="py-2.5 text-ink">{good}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="insight"
        eyebrow="03 · Our insight"
        title="The intelligence is in choosing the intervention, not generating the content."
      >
        <p>
          A chatbot can write an explanation for anything. That was never the bottleneck. The hard
          part is knowing that <em>this</em> student, right now, needs a harder problem rather than
          a clearer explanation, or a break rather than more practice, and being able to say why.
        </p>
      </Section>

      <Section
        id="model"
        eyebrow="04 · The engagement intelligence model"
        title="Eleven interaction states. Twelve interventions. One loop."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(STATE_META).map(([key, meta]) => (
            <div key={key} className="rounded-xl border border-line bg-surface px-3 py-2">
              <p className="text-[14px] font-medium text-ink">{meta.label}</p>
              <p className="text-[12.5px] text-muted">{meta.describe}</p>
            </div>
          ))}
        </div>
        <p>
          States are readings of the interaction, not of the person: no psychological labels, ever.
          Each comes from a weighted blend of self-report, behaviour (pace, accuracy, hints,
          abandonment, switching), the learner&apos;s own controls and their history, as a
          probability distribution with its evidence attached.
        </p>
      </Section>

      <Section
        id="how"
        eyebrow="05 · How it works"
        title="Detect → Understand → Intervene → Observe → Adapt."
      >
        <Architecture />
        <p>
          Each candidate intervention is scored as{" "}
          <span className="font-mono text-[14px] text-ink">
            prior × learned × context × novelty
          </span>
          . The prior is a readable rule table. The learned part is this learner&apos;s own recovery
          rate for that state and intervention. Context covers energy, time and connectivity, and
          novelty stops the engine repeating what isn&apos;t working. The learner&apos;s controls
          are hard constraints: &ldquo;Too easy&rdquo; always means harder.
        </p>
      </Section>

      <Section
        id="live"
        eyebrow="06 · Live"
        title="Same topic, four learners: the engine's first move for each."
      >
        <p className="text-[14px] text-muted">
          Computed by the engine as this page renders, from each scenario&apos;s check-in.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {firstMoves.map(({ s, state, kind, title, summary }) => (
            <div key={s.id} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-[13px] text-muted">
                {s.name} · {s.label}
              </p>
              <p className="mt-2 text-[14px] text-ink">
                Reads <strong>{STATE_META[state].label}</strong> → chooses{" "}
                <strong>{INTERVENTION_META[kind].label.toLowerCase()}</strong>
              </p>
              <p className="type-h3 mt-2 text-ink">{title}</p>
              <p className="mt-2 text-[13.5px] text-ink-2">{summary}</p>
            </div>
          ))}
        </div>
        <Link href="/" className="inline-flex items-center gap-2 font-medium text-accent">
          Try it yourself <ArrowRight className="size-4" />
        </Link>
      </Section>

      <Section
        id="adapt"
        eyebrow="07 · Adaptive intervention"
        title="It reacts to the learner, not to a lesson plan."
      >
        <p>
          Bored → a harder real problem. &ldquo;Too easy&rdquo; → level 3 becomes 4, then 5.
          &ldquo;Explain differently&rdquo; → text becomes a picture you can play with, then an
          analogy. &ldquo;I&apos;m bored&rdquo; mid-explanation → it switches to something
          interactive. Every change comes with a one-line reason and a &ldquo;Why this?&rdquo;.
        </p>
        <p>
          The next day, it starts where the evidence points, and says so: &ldquo;Last time you were
          bored, a stretch challenge brought you back 1 of 1 time.&rdquo;
        </p>
      </Section>

      <Section
        id="twin"
        eyebrow="08 · Learner model"
        title="A digital twin that shows its working."
      >
        <p>
          Curiosity, challenge appetite, momentum, consistency, social energy, difficulty tolerance;
          ability per concept; which explanation formats land; and a table of what has brought this
          learner back, state by state. Shown as yesterday versus today, with patterns stated only
          when there&apos;s evidence, and the evidence alongside them.
        </p>
      </Section>

      <Section
        id="infra"
        eyebrow="09 · Infrastructure adaptability"
        title="Built for a shared phone on a 3G connection."
      >
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ["Full", "AI gateway, interactive visuals, motion"],
            ["Light", "Same activities, text-first, payload shown in KB"],
            ["Offline", "The whole engine and library run on the device"],
            ["Sync", "Idempotent outbox drains when a connection returns"],
          ].map(([m, d]) => (
            <div key={m} className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[14px] font-medium text-ink">{m}</p>
              <p className="text-[12.5px] text-muted">{d}</p>
            </div>
          ))}
        </div>
        <p>
          The engine is deterministic TypeScript with no I/O, so it decides in under a millisecond
          on an old phone with no network. The language model is an optional enhancement that
          rewrites words; it never decides what happens next.
        </p>
      </Section>

      <Section id="privacy" eyebrow="10 · Privacy by design" title="Minimal, visible, deletable.">
        <p>
          No accounts. Free text is reduced to keywords on the device. Reflections never sync.
          Shared-device mode forgets everything when the tab closes. Every belief in the twin shows
          where it came from, and can be corrected, exported or wiped. Mentors see aggregates, and
          names only for learners who opt in.
        </p>
      </Section>

      <Section id="impact" eyebrow="11 · Impact" title="We measure recovery, not screen time.">
        <p>
          Recovery from disengagement · successful intervention rate · task completion · challenge
          calibration · persistence after a miss · return to learning · curiosity paths followed ·
          learner-reported usefulness. Each is computed from the event log, in the session summary
          and the mentor view. The engine also knows when the right answer is to stop.
        </p>
      </Section>

      <Section id="scale" eyebrow="12 · Scale" title="Every box is replaceable.">
        <p>
          The rule-plus-bandit policy can be swapped for a learned policy trained on real outcomes;
          the in-memory sync store for Postgres; the content library for any curriculum that follows
          the same activity schema; the AI gateway for any model. The event schema is the contract,
          so each part can improve on its own.
        </p>
      </Section>
    </div>
  );
}

function Architecture() {
  const box = "rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink";
  return (
    <figure className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">On the device</p>
          <div className={box}>Frontend: check-in · session · twin · community · mentor</div>
          <div className={box}>Session Orchestrator</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              "Signal extraction",
              "Engagement State Engine",
              "Intervention Engine",
              "Activity Engine",
              "Feedback Processor",
              "Learner Model",
              "Why layer",
              "Analytics",
            ].map((b) => (
              <div
                key={b}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink-2"
              >
                {b}
              </div>
            ))}
          </div>
          <div className={box}>Connectivity manager · outbox · service worker cache</div>
        </div>
        <div className="flex items-center justify-center font-mono text-[12px] text-muted md:flex-col">
          <span>⇄</span>
          <span className="mx-2 md:mx-0 md:my-2">HTTPS, optional</span>
          <span>⇄</span>
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">On the server</p>
          <div className={box}>
            <strong className="font-medium">/api/sync</strong>: zod-validated, idempotent event
            ingestion
          </div>
          <div className={box}>
            <strong className="font-medium">/api/ai</strong>: AI gateway; rewrites explanations,
            never decides
          </div>
          <div className={box}>
            <strong className="font-medium">/api/health</strong>: connectivity probe
          </div>
          <div className={box}>Cohort analytics: the same engine, run over aggregate data</div>
        </div>
      </div>
      <figcaption className="mt-3 text-[12.5px] text-muted">
        The decision loop needs no network. The server adds sync, aggregate analytics and optional
        generation.
      </figcaption>
    </figure>
  );
}

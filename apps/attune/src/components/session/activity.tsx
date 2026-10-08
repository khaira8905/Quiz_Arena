"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Coffee,
  Lightbulb,
  LoaderCircle,
  RotateCcw,
  Share2,
  Sparkles,
  Square,
  Users,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import {
  CONCEPT_META,
  MODALITY_META,
  type Activity,
  type BreakActivity,
  type ChallengeActivity,
  type Choice,
  type ChoiceActivity,
  type ConnectivityMode,
  type CuriosityActivity,
  type Decision,
  type ExplanationActivity,
  type GuidedActivity,
  type LearnerEventInput,
  type MicroActivity,
  type MissionActivity,
  type QuestionActivity,
  type ReflectionActivity,
} from "@attune/engine";
import { reframeExplanation } from "@/lib/ai-client";
import { useSpeechOutput } from "@/lib/voice";
import { Badge, Button, cn, Eyebrow, SimulatedTag } from "../ui";
import { Visual } from "./visuals";

export interface ActivityProps {
  decision: Decision;
  mode: ConnectivityMode;
  interests: string[];
  aiAvailable: boolean;
  onEvent: (input: LearnerEventInput) => void;
  onEnd: () => void;
  onResume: () => void;
  onShare: (title: string, text: string) => void;
}

const LETTERS = ["A", "B", "C", "D", "E"];
const FRAME_LABEL: Record<string, string> = {
  cricket: "Cricket",
  startups: "Startups",
  music: "Music",
  gaming: "Gaming",
  space: "Space",
  everyday: "Everyday",
};

/** Time since the activity (or part) appeared. Latency is a signal; it's measured, not guessed. */
function useClock() {
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  return {
    elapsed: () => (started.current ? Date.now() - started.current : 0),
    reset: () => {
      started.current = Date.now();
    },
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Choice block: the shared answer mechanic.                                                   */
/* ------------------------------------------------------------------------------------------ */

const MAX_TRIES = 3;

function ChoiceBlock({
  choice,
  onAnswer,
  onHint,
  onDone,
  allowRetry = false,
  offerRetry = false,
  promptSize = "lg",
  feedback = "grade",
}: {
  choice: Choice;
  onAnswer: (correct: boolean, latencyMs: number, usedHint: boolean, attempt: number) => void;
  onHint?: () => void;
  /** Called once the question is settled: solved, revealed, or out of tries. */
  onDone?: (correct: boolean, attempts: number) => void;
  /** Guided steps: keep picking until right, no prompt in between. */
  allowRetry?: boolean;
  /** After a miss, offer "Try again" or "Show me the answer" before revealing anything. */
  offerRetry?: boolean;
  promptSize?: "lg" | "md";
  /** "grade" marks right and wrong; "reveal" just reveals (for guesses that aren't tested). */
  feedback?: "grade" | "reveal";
}) {
  const clock = useClock();
  const [picked, setPicked] = useState<number[]>([]);
  const [hint, setHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const solved = picked.includes(choice.answerIndex);
  const missed = picked.length > 0 && !solved;
  const done =
    solved ||
    revealed ||
    (missed && !allowRetry && !offerRetry) ||
    (missed && offerRetry && picked.length >= MAX_TRIES);
  // A miss with tries left: the learner decides whether to try again or see the answer.
  const deciding = offerRetry && missed && !done && !retrying;

  const settle = (correct: boolean, attempts: number) => onDone?.(correct, attempts);

  const pick = (i: number) => {
    if (done || deciding || picked.includes(i)) return;
    const attempt = picked.length + 1;
    const correct = i === choice.answerIndex;
    setPicked((p) => [...p, i]);
    setRetrying(false);
    onAnswer(correct, clock.elapsed(), hint, attempt);
    if (correct || !(allowRetry || offerRetry) || (offerRetry && attempt >= MAX_TRIES)) {
      settle(correct, attempt);
    }
  };

  return (
    <div>
      <p className={cn("text-ink", promptSize === "lg" ? "type-h2" : "type-h3")}>{choice.prompt}</p>
      <div className={cn("mt-4 grid gap-2", choice.options.length > 2 && "sm:grid-cols-2")}>
        {choice.options.map((option, i) => {
          const isAnswer = i === choice.answerIndex;
          const wasPicked = picked.includes(i);
          const showRight = done && isAnswer && feedback === "grade";
          const showWrong = wasPicked && !isAnswer && feedback === "grade";
          const revealed = done && feedback === "reveal" && (isAnswer || wasPicked);
          return (
            <button
              key={option}
              type="button"
              disabled={done || deciding || wasPicked}
              onClick={() => pick(i)}
              className={cn(
                "group flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[15px] transition-colors",
                showRight && "border-good bg-good-soft text-ink",
                showWrong && "border-danger/60 bg-danger-soft text-ink",
                revealed &&
                  (isAnswer ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2"),
                !showRight &&
                  !showWrong &&
                  !revealed &&
                  "border-line bg-surface hover:border-ink disabled:opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[12px]",
                  showRight
                    ? "bg-good text-white"
                    : showWrong
                      ? "bg-danger text-white"
                      : "bg-surface-2 text-muted group-hover:text-ink",
                )}
                aria-hidden
              >
                {showRight ? (
                  <Check className="size-3.5" />
                ) : showWrong ? (
                  <X className="size-3.5" />
                ) : (
                  LETTERS[i]
                )}
              </span>
              <span>{option}</span>
              <span className="sr-only">
                {showRight ? "(correct)" : showWrong ? "(incorrect)" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-6" aria-live="polite">
        {!done && choice.hint && !hint && (
          <button
            type="button"
            onClick={() => {
              setHint(true);
              onHint?.();
            }}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
          >
            <Lightbulb className="size-3.5" /> Show a hint
          </button>
        )}
        {!done && hint && choice.hint && (
          <p className="flex items-start gap-1.5 text-[14px] text-ink-2">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent" /> {choice.hint}
          </p>
        )}
        {allowRetry && !done && picked.length > 0 && (
          <p className="text-[14px] text-ink-2">Not that one. Have another go.</p>
        )}
        {deciding && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-2"
          >
            <p className="mr-1 text-[14px] text-ink-2">
              <strong className="text-ink">Not quite.</strong>{" "}
              {MAX_TRIES - picked.length === 1 ? "One more try?" : "Want another go?"}
            </p>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                clock.reset();
                setRetrying(true);
              }}
            >
              <RotateCcw className="size-3.5" /> Try again
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRevealed(true);
                settle(false, picked.length);
              }}
            >
              Show me the answer
            </Button>
          </motion.div>
        )}
        {offerRetry && retrying && !done && (
          <p className="text-[14px] text-ink-2">
            Attempt {picked.length + 1} of {MAX_TRIES}. The ones you&apos;ve ruled out are greyed.
          </p>
        )}
        {done && choice.explanation && (
          <p className="rise text-[14.5px] leading-relaxed text-ink-2">
            {feedback === "grade" && (
              <strong className={solved ? "text-good" : "text-ink"}>
                {solved
                  ? picked.length > 1
                    ? `Got it on try ${picked.length}. `
                    : "Right. "
                  : "Here's how it works. "}
              </strong>
            )}
            {choice.explanation}
          </p>
        )}
      </div>
    </div>
  );
}

function answerInput(a: { id: string; conceptId: Activity["conceptId"] }, difficulty: number) {
  return (
    correct: boolean,
    latencyMs: number,
    usedHint: boolean,
    attempt = 1,
  ): LearnerEventInput => ({
    type: "answer",
    activityId: a.id,
    conceptId: a.conceptId,
    difficulty,
    correct,
    latencyMs: Math.round(latencyMs),
    usedHint,
    ...(attempt > 1 ? { attempt } : {}),
  });
}

/** Full marks first time; partial credit for getting there on a retry. */
function scoreFor(result: { correct: boolean; attempts: number }): number {
  if (!result.correct) return 0;
  return result.attempts <= 1 ? 1 : 0.5;
}

/* ------------------------------------------------------------------------------------------ */

export function ActivityView(props: ActivityProps) {
  const a = props.decision.activity;
  switch (a.type) {
    case "question":
      return <QuestionView activity={a} {...props} />;
    case "micro":
      return <MicroView activity={a} {...props} />;
    case "challenge":
      return <ChallengeView activity={a} {...props} />;
    case "guided":
      return <GuidedView activity={a} {...props} />;
    case "explanation":
      return <ExplanationView activity={a} {...props} />;
    case "curiosity":
      return <CuriosityView activity={a} {...props} />;
    case "mission":
      return <MissionView activity={a} {...props} />;
    case "choice":
      return <ModalityChoiceView activity={a} {...props} />;
    case "reflection":
      return <ReflectionView activity={a} {...props} />;
    case "break":
      return <BreakView activity={a} {...props} />;
  }
}

function useDwell() {
  const clock = useClock();
  return clock.elapsed;
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      {children}
    </div>
  );
}

/* Question ---------------------------------------------------------------------------------- */

function QuestionView({ activity, onEvent }: ActivityProps & { activity: QuestionActivity }) {
  const dwell = useDwell();
  const [result, setResult] = useState<{ correct: boolean; attempts: number } | null>(null);
  const toInput = answerInput(activity, activity.difficulty);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Badge>Level {activity.difficulty}</Badge>
        <Badge>{CONCEPT_META[activity.conceptId].short}</Badge>
      </div>
      <ChoiceBlock
        choice={activity}
        offerRetry
        onHint={() => onEvent({ type: "hint", activityId: activity.id })}
        onAnswer={(correct, latency, hint, attempt) =>
          onEvent(toInput(correct, latency, hint, attempt))
        }
        onDone={(correct, attempts) => setResult({ correct, attempts })}
      />
      {result !== null && (
        <Footer>
          <Button
            variant="primary"
            onClick={() =>
              onEvent({
                type: "activity_completed",
                activityId: activity.id,
                dwellMs: dwell(),
                score: scoreFor(result),
              })
            }
          >
            Continue <ArrowRight className="size-4" />
          </Button>
        </Footer>
      )}
    </div>
  );
}

function MicroView({ activity, onEvent }: ActivityProps & { activity: MicroActivity }) {
  const dwell = useDwell();
  const [result, setResult] = useState<{ correct: boolean; attempts: number } | null>(null);
  return (
    <div>
      <ChoiceBlock
        choice={{ ...activity, explanation: activity.cheer }}
        offerRetry
        onAnswer={(correct, latency, hint, attempt) =>
          onEvent(answerInput(activity, 1)(correct, latency, hint, attempt))
        }
        onDone={(correct, attempts) => setResult({ correct, attempts })}
      />
      {result !== null && (
        <Footer>
          <Button
            variant="primary"
            onClick={() =>
              onEvent({
                type: "activity_completed",
                activityId: activity.id,
                dwellMs: dwell(),
                score: scoreFor(result),
              })
            }
          >
            Keep going <ArrowRight className="size-4" />
          </Button>
        </Footer>
      )}
    </div>
  );
}

/* Challenge --------------------------------------------------------------------------------- */

function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3" aria-label={`Optional clock: ${left} seconds left`}>
      <Clock className="size-3.5 text-muted" aria-hidden />
      <div className="h-1 w-28 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
      <span className="tabular text-[12.5px] text-muted">
        {left > 0 ? `${left}s · optional` : "Time's up. Take your time anyway."}
      </span>
    </div>
  );
}

function ChallengeView({ activity, onEvent }: ActivityProps & { activity: ChallengeActivity }) {
  const dwell = useDwell();
  const [part, setPart] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const answered = results.length > part;
  const last = part === activity.parts.length - 1;
  const toInput = answerInput(activity, activity.difficulty);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{FRAME_LABEL[activity.frame] ?? activity.frame}</Badge>
        <Badge>Level {activity.difficulty}</Badge>
        <span className="text-[12.5px] text-muted">
          Part {part + 1} of {activity.parts.length}
        </span>
        {activity.timeLimitSec && (
          <span className="ml-auto">
            <Countdown seconds={activity.timeLimitSec} />
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-medium text-ink">{activity.title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{activity.scenario}</p>
      <div className="mt-5">
        <ChoiceBlock
          key={part}
          promptSize="md"
          choice={activity.parts[part]!}
          onHint={() => onEvent({ type: "hint", activityId: activity.id })}
          onAnswer={(correct, latency, hint) => {
            setResults((r) => [...r, correct]);
            onEvent(toInput(correct, latency, hint));
          }}
        />
      </div>
      <Footer>
        {answered && !last && (
          <Button variant="primary" onClick={() => setPart((p) => p + 1)}>
            Next part <ArrowRight className="size-4" />
          </Button>
        )}
        {answered && last && (
          <Button
            variant="primary"
            onClick={() =>
              onEvent({
                type: "activity_completed",
                activityId: activity.id,
                dwellMs: dwell(),
                score: results.filter(Boolean).length / activity.parts.length,
              })
            }
          >
            Finish <ArrowRight className="size-4" />
          </Button>
        )}
        {!answered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEvent({ type: "control", action: "TOO_HARD" })}
          >
            Stuck? Break it into steps
          </Button>
        )}
      </Footer>
    </div>
  );
}

/* Guided steps ------------------------------------------------------------------------------ */

function GuidedView({ activity, onEvent }: ActivityProps & { activity: GuidedActivity }) {
  const dwell = useDwell();
  const [step, setStep] = useState(0);
  const [solved, setSolved] = useState<boolean[]>([]);
  const [firstTry, setFirstTry] = useState<boolean[]>([]);
  const current = activity.steps[step]!;
  const done = solved[step] === true;
  const last = step === activity.steps.length - 1;
  const toInput = answerInput(activity, activity.difficulty);

  return (
    <div>
      <div
        className="mb-3 flex items-center gap-2"
        aria-label={`Step ${step + 1} of ${activity.steps.length}`}
      >
        {activity.steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-8 rounded-full",
              i < step || solved[i] ? "bg-accent" : i === step ? "bg-ink/40" : "bg-surface-3",
            )}
          />
        ))}
        <span className="ml-1 text-[12.5px] text-muted">
          Step {step + 1} of {activity.steps.length}
        </span>
      </div>
      {step === 0 && (
        <p className="mb-4 text-[15px] leading-relaxed text-ink-2">{activity.intro}</p>
      )}
      <ChoiceBlock
        key={step}
        allowRetry
        promptSize="md"
        choice={{ ...current, explanation: current.reveal }}
        onHint={() => onEvent({ type: "hint", activityId: activity.id })}
        onAnswer={(correct, latency, hint, attempt) => {
          if (firstTry[step] === undefined)
            setFirstTry((f) => Object.assign([...f], { [step]: correct }));
          if (correct) setSolved((s) => Object.assign([...s], { [step]: true }));
          onEvent(toInput(correct, latency, hint, attempt));
        }}
      />
      {done && (
        <Footer>
          {!last ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              Next step <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() =>
                onEvent({
                  type: "activity_completed",
                  activityId: activity.id,
                  dwellMs: dwell(),
                  score: firstTry.filter(Boolean).length / activity.steps.length,
                })
              }
            >
              Done <ArrowRight className="size-4" />
            </Button>
          )}
        </Footer>
      )}
    </div>
  );
}

/* Explanation ------------------------------------------------------------------------------- */

function ExplanationView({
  activity,
  mode,
  interests,
  aiAvailable,
  onEvent,
}: ActivityProps & { activity: ExplanationActivity }) {
  const dwell = useDwell();
  const voice = useSpeechOutput();
  const [revealed, setRevealed] = useState(1);
  const [ai, setAi] = useState<{
    status: "idle" | "loading" | "done" | "error";
    text?: string;
    note?: string;
  }>({ status: "idle" });
  const body = activity.body;
  const rich = mode === "full";

  const steps =
    body.modality === "worked"
      ? body.steps.length
      : body.modality === "dialogue"
        ? body.lines.length
        : 0;
  const stepped = steps > 0 && revealed < steps;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{MODALITY_META[activity.modality].label}</Badge>
        <Badge>{CONCEPT_META[activity.conceptId].short}</Badge>
        <span className="ml-auto flex items-center gap-1">
          {voice.supported && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (voice.speaking ? voice.stop() : voice.speak(activity.textFallback))}
            >
              {voice.speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
              {voice.speaking ? "Stop" : "Listen"}
            </Button>
          )}
        </span>
      </div>
      <h3 className="type-h2 text-ink">{activity.title}</h3>

      <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-2">
        {(body.modality === "text" || body.modality === "analogy") &&
          body.paragraphs.map((p) => <p key={p}>{p}</p>)}

        {body.modality === "visual" && (
          <>
            {rich ? (
              <figure className="rich-only rounded-2xl border border-line bg-surface-2/60 p-3 sm:p-4">
                <Visual kind={body.visual} />
                <figcaption className="mt-2 text-[13px] text-muted">{body.caption}</figcaption>
              </figure>
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong p-3 text-[13.5px] text-muted">
                Interactive picture hidden in {mode} mode to save data. Same idea, in words:
              </p>
            )}
            {body.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </>
        )}

        {body.modality === "worked" && (
          <>
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-ink">{body.problem}</p>
            <ol className="space-y-2">
              {body.steps.slice(0, revealed).map((s, i) => (
                <li key={s.label} className="rise flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[12px] text-inverse">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-medium text-ink">{s.label}.</span>{" "}
                    <span className="font-mono text-[14.5px] text-ink">{s.work}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {body.modality === "dialogue" && (
          <div className="space-y-2">
            {body.lines.slice(0, revealed).map((line, i) => (
              <p
                key={i}
                className={cn(
                  "rise max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px]",
                  line.speaker === "guide"
                    ? "bg-surface-2 text-ink"
                    : "ml-auto bg-ink text-inverse",
                )}
              >
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>

      {stepped && (
        <Button className="mt-4" onClick={() => setRevealed((r) => r + 1)}>
          {body.modality === "worked" ? "Next step" : "Continue"} <ArrowRight className="size-4" />
        </Button>
      )}

      {!stepped && (
        <p className="rise mt-5 rounded-xl border-l-2 border-accent bg-accent-soft px-4 py-3 text-[15px] text-ink">
          {activity.takeaway}
        </p>
      )}

      {rich && aiAvailable && !stepped && (
        <div className="rich-only mt-4">
          {ai.status === "idle" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                setAi({ status: "loading" });
                const r = await reframeExplanation(activity, interests);
                setAi(
                  r.ok
                    ? { status: "done", text: r.text, note: r.model }
                    : { status: "error", note: r.message },
                );
              }}
            >
              <WandSparkles className="size-3.5" /> Reframe it around{" "}
              {interests[0] ?? "something I like"}
            </Button>
          )}
          {ai.status === "loading" && (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <LoaderCircle className="size-3.5 animate-spin" /> Asking the AI gateway…
            </p>
          )}
          {ai.status === "done" && (
            <div className="rise rounded-xl border border-line p-4">
              <div className="mb-2 flex items-center gap-2">
                <SimulatedTag>AI-written</SimulatedTag>
                <span className="text-[12px] text-muted">
                  Rewritten by the AI gateway from the library text. The worked maths above is the
                  reference.
                </span>
              </div>
              {ai.text!.split(/\n+/).map((p) => (
                <p key={p} className="mt-2 text-[15px] leading-relaxed text-ink-2">
                  {p}
                </p>
              ))}
            </div>
          )}
          {ai.status === "error" && <p className="text-[13px] text-muted">{ai.note}</p>}
        </div>
      )}

      <Footer>
        <Button
          variant="primary"
          disabled={stepped}
          onClick={() =>
            onEvent({ type: "activity_completed", activityId: activity.id, dwellMs: dwell() })
          }
        >
          <Check className="size-4" /> Got it
        </Button>
        <Button
          onClick={() => {
            onEvent({ type: "reaction", reaction: "lost" });
            onEvent({ type: "control", action: "EXPLAIN_DIFFERENTLY" });
          }}
        >
          Still unclear
        </Button>
      </Footer>
    </div>
  );
}

/* Curiosity path ---------------------------------------------------------------------------- */

function CuriosityView({
  activity,
  onEvent,
  onShare,
}: ActivityProps & { activity: CuriosityActivity }) {
  const dwell = useDwell();
  const [trail, setTrail] = useState<string[]>([activity.startNodeId]);
  const [guessed, setGuessed] = useState<Record<string, boolean>>({});
  const [shared, setShared] = useState(false);
  const nodeId = trail[trail.length - 1]!;
  const node = activity.nodes.find((n) => n.id === nodeId)!;
  const atEnd = node.next.length === 0 || node.returnsToSyllabus;
  const canMove = !node.check || guessed[node.id];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">Curiosity path</Badge>
        <Badge>{FRAME_LABEL[activity.frame]}</Badge>
        <nav
          aria-label="Path so far"
          className="ml-auto flex items-center gap-1 text-[12px] text-muted"
        >
          {trail.map((id, i) => (
            <span key={`${id}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>→</span>}
              {activity.nodes.find((n) => n.id === id)?.title}
            </span>
          ))}
        </nav>
      </div>
      {nodeId === activity.startNodeId && <p className="type-h2 mb-2 text-ink">{activity.hook}</p>}
      <div key={nodeId} className="rise">
        <h3 className="text-[15px] font-medium text-ink">{node.title}</h3>
        <p className="mt-1 text-[16px] leading-relaxed text-ink-2">{node.body}</p>
        {node.check && (
          <div className="mt-5">
            <ChoiceBlock
              promptSize="md"
              feedback="reveal"
              choice={node.check}
              onAnswer={() => setGuessed((g) => ({ ...g, [node.id]: true }))}
            />
          </div>
        )}
      </div>
      {node.returnsToSyllabus && canMove && (
        <p className="rise mt-4 flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-[14.5px] text-ink">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" /> This is your assignment topic:{" "}
          {CONCEPT_META[activity.conceptId].label.toLowerCase()}. You got here by following a
          question you actually had.
        </p>
      )}
      <Footer>
        {!atEnd &&
          canMove &&
          node.next.map((n) => (
            <Button key={n.nodeId} onClick={() => setTrail((t) => [...t, n.nodeId])}>
              {n.label}
            </Button>
          ))}
        {atEnd && canMove && (
          <>
            <Button
              variant="primary"
              onClick={() =>
                onEvent({
                  type: "activity_completed",
                  activityId: activity.id,
                  dwellMs: dwell(),
                  score: 1,
                })
              }
            >
              Back to the assignment <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              disabled={shared}
              onClick={() => {
                setShared(true);
                onShare(activity.title, node.body);
              }}
            >
              <Share2 className="size-3.5" />{" "}
              {shared ? "Shared with your circle" : "Share this discovery"}
            </Button>
          </>
        )}
      </Footer>
    </div>
  );
}

/* Peer mission ------------------------------------------------------------------------------ */

function MissionView({ activity, mode, onEvent }: ActivityProps & { activity: MissionActivity }) {
  const dwell = useDwell();
  const [visible, setVisible] = useState(mode === "full" ? 0 : activity.peers.length);
  const [partDone, setPartDone] = useState<boolean | null>(null);
  const [taught, setTaught] = useState(false);

  useEffect(() => {
    if (visible >= activity.peers.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), 1100);
    return () => clearTimeout(t);
  }, [visible, activity.peers.length]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">
          <Users className="size-3" /> Peer mission
        </Badge>
        <SimulatedTag>Demo peers</SimulatedTag>
      </div>
      <h3 className="type-h2 text-ink">{activity.title}</h3>
      <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{activity.brief}</p>
      {mode === "offline" && (
        <p className="mt-3 rounded-xl border border-dashed border-line-strong px-3 py-2 text-[13px] text-muted">
          You&apos;re offline. You can still do your part; the team sees it when you reconnect.
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {activity.peers.map((peer, i) => (
          <div
            key={peer.name}
            className={cn(
              "rounded-xl border border-line p-3",
              i < visible ? "rise bg-surface" : "bg-surface-2/60",
            )}
          >
            <p className="text-[13px] text-muted">
              <span className="font-medium text-ink">{peer.name}</span> · likes {peer.interest} ·{" "}
              {peer.role}
            </p>
            <p className="mt-1 text-[14.5px] text-ink-2">
              {i < visible ? peer.contribution : <span className="text-muted">working on it…</span>}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-ink/80 p-4">
        <Eyebrow className="mb-2">Your part</Eyebrow>
        <ChoiceBlock
          promptSize="md"
          choice={activity.yourPart}
          onAnswer={(correct, latency, hint) => {
            setPartDone(correct);
            onEvent(answerInput(activity, activity.difficulty)(correct, latency, hint));
          }}
        />
      </div>
      {partDone !== null && (
        <div className="rise mt-4 rounded-2xl border border-line p-4">
          <Eyebrow className="mb-2">Help a teammate</Eyebrow>
          <ChoiceBlock
            promptSize="md"
            allowRetry
            choice={activity.teachBack}
            onAnswer={(correct) => {
              if (correct && !taught) {
                setTaught(true);
                onEvent({ type: "assist", activityId: activity.id });
              }
            }}
          />
        </div>
      )}
      {taught && (
        <p className="rise mt-4 rounded-xl bg-accent-soft px-4 py-3 text-[15px] text-ink">
          <strong>Team verdict:</strong> {activity.verdict}
        </p>
      )}
      <Footer>
        <Button
          variant="primary"
          disabled={partDone === null}
          onClick={() =>
            onEvent({
              type: "activity_completed",
              activityId: activity.id,
              dwellMs: dwell(),
              score: partDone ? 1 : 0,
            })
          }
        >
          Finish mission <ArrowRight className="size-4" />
        </Button>
      </Footer>
    </div>
  );
}

/* Modality choice --------------------------------------------------------------------------- */

function ModalityChoiceView({ activity, onEvent }: ActivityProps & { activity: ChoiceActivity }) {
  return (
    <div>
      <p className="type-h2 text-ink">{activity.prompt}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {activity.options.map((o) => (
          <button
            key={o.choice}
            type="button"
            onClick={() => onEvent({ type: "choice", choice: o.choice })}
            className="rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-ink"
          >
            <span className="text-[15px] font-medium text-ink">{o.label}</span>
            <span className="mt-1 block text-[13.5px] text-muted">{o.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Reflection -------------------------------------------------------------------------------- */

function ReflectionView({ activity, onEvent }: ActivityProps & { activity: ReflectionActivity }) {
  const [note, setNote] = useState("");
  const [useful, setUseful] = useState<number | null>(null);
  return (
    <div>
      <label htmlFor="reflection" className="type-h2 block text-ink">
        {activity.prompt}
      </label>
      <textarea
        id="reflection"
        value={note}
        maxLength={280}
        onChange={(e) => setNote(e.target.value)}
        placeholder={activity.placeholder}
        rows={3}
        className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-3 text-[16px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
      />
      <p className="mt-1 text-[12.5px] text-muted">
        Your words stay on this device. Only the rating below is synced.
      </p>
      <fieldset className="mt-4">
        <legend className="text-[14px] text-ink-2">Was this session useful?</legend>
        <div className="mt-2 flex gap-2">
          {["Not really", "Somewhat", "Yes"].map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={useful === i + 1}
              onClick={() => setUseful(i + 1)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm",
                useful === i + 1
                  ? "border-ink bg-ink text-inverse"
                  : "border-line text-ink-2 hover:border-line-strong",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <Footer>
        <Button
          variant="primary"
          disabled={useful === null}
          onClick={() =>
            onEvent({ type: "reflection", usefulness: useful ?? 2, note: note || undefined })
          }
        >
          Save and continue <ArrowRight className="size-4" />
        </Button>
      </Footer>
    </div>
  );
}

/* Break ------------------------------------------------------------------------------------- */

function BreakView({
  activity,
  onEvent,
  onEnd,
  onResume,
}: ActivityProps & { activity: BreakActivity }) {
  const dwell = useDwell();
  const [left, setLeft] = useState(activity.minutes * 60);
  useEffect(() => {
    if (activity.stopHere) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [activity.stopHere]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="text-center sm:text-left">
      <Coffee className="mx-auto size-6 text-accent sm:mx-0" aria-hidden />
      <h3 className="type-h2 mt-3 text-ink">{activity.title}</h3>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{activity.body}</p>
      {!activity.stopHere && (
        <p className="tabular mt-4 font-mono text-[40px] text-ink">{`${mm}:${ss}`}</p>
      )}
      <ul className="mt-4 space-y-1.5 text-left text-[15px] text-ink-2">
        {activity.suggestions.map((s) => (
          <li key={s} className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ·
            </span>
            {s}
          </li>
        ))}
      </ul>
      <Footer>
        {activity.stopHere ? (
          <>
            <Button variant="primary" onClick={onEnd}>
              End here and see the summary
            </Button>
            <Button onClick={onResume}>Keep going anyway</Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() =>
              onEvent({ type: "activity_completed", activityId: activity.id, dwellMs: dwell() })
            }
          >
            I&apos;m back
          </Button>
        )}
      </Footer>
    </div>
  );
}

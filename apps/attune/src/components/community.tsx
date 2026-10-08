"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Compass, HandHeart, MessageCircleQuestion, Telescope, Users } from "lucide-react";
import { CURIOSITY_PATHS, MISSIONS, type InterventionKind } from "@attune/engine";
import { useAttune } from "@/lib/store";
import { Badge, Button, cn, Eyebrow, SimulatedTag } from "./ui";

/**
 * Community, with a job to do: find peers who share an interest, work a short mission together,
 * share what you discovered, ask a question. No feed, no likes, no follower counts.
 */

const PEERS = [
  {
    name: "Riya",
    interests: ["music", "space"],
    working: "Compound growth, via streaming numbers",
  },
  { name: "Dev", interests: ["cricket", "gaming"], working: "Rule of 70, using IPL viewership" },
  { name: "Arjun", interests: ["startups", "cricket"], working: "Modelling a D2C brand's revenue" },
  { name: "Sana", interests: ["space"], working: "Why decibels are logarithmic" },
  { name: "Tanvi", interests: ["gaming", "music"], working: "XP curves and logarithms" },
  { name: "Neel", interests: ["startups", "space"], working: "Half-lives and carbon dating" },
];

const DEMO_DISCOVERIES = [
  {
    id: "d1",
    who: "Sana",
    title: "Folding paper to the Moon",
    text: "42 folds of ordinary paper would pass the Moon. That's just log₂ of a very big number.",
  },
  {
    id: "d2",
    who: "Dev",
    title: "Rule of 70 in the IPL",
    text: "Audience growing 20% a season doubles in about 3.5 seasons. 70 ÷ 20 is a log in disguise.",
  },
];

export function CommunityView() {
  const router = useRouter();
  const { session, request, discoveries, questions, askCircle, hydrated } = useAttune();
  const [question, setQuestion] = useState("");
  const interests = session?.learner.interests ?? [];
  const helped = session?.events.filter((e) => e.type === "assist").length ?? 0;
  const matched = [...PEERS]
    .map((p) => ({ ...p, shared: p.interests.filter((i) => interests.includes(i)) }))
    .sort((a, b) => b.shared.length - a.shared.length);

  const go = (kind: InterventionKind) => {
    if (!session || session.endedAt) {
      router.push("/begin");
      return;
    }
    request(kind);
    router.push("/session");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6">
      <Eyebrow>Community</Eyebrow>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <h1 className="voice text-[36px] leading-tight text-ink sm:text-[42px]">
          Learning with people who care about the same things
        </h1>
        <SimulatedTag>Demo peers</SimulatedTag>
      </div>
      <p className="mt-2 max-w-2xl text-ink-2">
        Every connection here is attached to something to learn. Peers are matched by interest, not
        popularity. In this prototype the peers are fictional, and nothing you post leaves your
        device.
      </p>

      {hydrated && helped > 0 && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[14px] text-ink">
          <HandHeart className="size-4 text-accent" /> You&apos;ve helped {helped}{" "}
          {helped === 1 ? "peer" : "peers"} this session. That counts more than any score.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section>
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Users className="size-4" /> Your circle
          </h2>
          <p className="text-[12.5px] text-muted">
            {interests.length
              ? `Matched on ${interests.join(", ")}`
              : "Tell Attune what you're into during check-in to get matched"}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {matched.map((p) => (
              <li key={p.name} className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-[15px] font-medium text-ink">{p.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.interests.map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[12px]",
                        p.shared.includes(i)
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-2 text-muted",
                      )}
                    >
                      {i}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[13px] text-ink-2">Working on: {p.working}</p>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 flex items-center gap-2 text-[15px] font-medium text-ink">
            <Telescope className="size-4" /> Discoveries
          </h2>
          <p className="text-[12.5px] text-muted">
            Shared from curiosity paths: things people found out, not things people posted
          </p>
          <ul className="mt-3 space-y-2">
            {discoveries.map((d) => (
              <li key={d.id} className="rounded-2xl border border-ink/70 bg-surface p-4">
                <p className="text-[12.5px] text-muted">
                  You · {new Date(d.at).toLocaleDateString()}
                </p>
                <p className="mt-0.5 text-[15px] font-medium text-ink">{d.title}</p>
                <p className="mt-1 text-[13.5px] text-ink-2">{d.text}</p>
              </li>
            ))}
            {DEMO_DISCOVERIES.map((d) => (
              <li key={d.id} className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-[12.5px] text-muted">{d.who} · demo peer</p>
                <p className="mt-0.5 text-[15px] font-medium text-ink">{d.title}</p>
                <p className="mt-1 text-[13.5px] text-ink-2">{d.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <Users className="size-4" /> Missions open now
            </h2>
            <p className="text-[12.5px] text-muted">
              Three people, ten minutes, one real question. Your part matters.
            </p>
            <ul className="mt-3 space-y-2">
              {MISSIONS.map((m) => (
                <li key={m.id} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-[15px] font-medium text-ink">{m.title}</p>
                  <p className="mt-1 text-[13px] text-ink-2">{m.brief}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="primary" onClick={() => go("PEER_MISSION")}>
                      Join a mission
                    </Button>
                    <Badge>with {m.peers.map((p) => p.name).join(" & ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <Compass className="size-4" /> Explore together
            </h2>
            <ul className="mt-3 space-y-2">
              {CURIOSITY_PATHS.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
                >
                  <div>
                    <p className="text-[14.5px] font-medium text-ink">{p.title}</p>
                    <p className="text-[12.5px] text-muted">{p.hook}</p>
                  </div>
                  <Button size="sm" onClick={() => go("CURIOSITY_PATH")}>
                    Start
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <MessageCircleQuestion className="size-4" /> Ask the circle
            </h2>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim()) {
                  askCircle(question.trim().slice(0, 240));
                  setQuestion("");
                }
              }}
            >
              <label htmlFor="ask" className="sr-only">
                Your question
              </label>
              <textarea
                id="ask"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                maxLength={240}
                placeholder="e.g. Why does ln 2 show up in the rule of 70?"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[14.5px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[12px] text-muted">
                  Goes to matched peers. In this prototype it stays on your device.
                </p>
                <Button size="sm" type="submit" variant="primary" disabled={!question.trim()}>
                  Ask
                </Button>
              </div>
            </form>
            {questions.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {questions.map((q) => (
                  <li
                    key={q.id}
                    className="rounded-xl bg-surface-2 px-3 py-2 text-[13.5px] text-ink-2"
                  >
                    {q.text} <span className="text-[12px] text-muted">· waiting for a peer</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {!session && hydrated && (
        <p className="mt-8 text-[14px] text-ink-2">
          <Link href="/begin" className="font-medium text-accent">
            Do a check-in
          </Link>{" "}
          to get matched by interest.
        </p>
      )}
    </div>
  );
}

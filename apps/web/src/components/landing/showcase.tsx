import { Marquee } from "@/components/ambient/marquee";
import { Tilt } from "@/components/motion/tilt";

/* Example content for the landing page's moving strips: illustrations of what a game
   looks like, not live data. */
const QUESTIONS = [
  { q: "Which planet has the shortest day?", a: ["Jupiter", "Mars", "Earth", "Venus"], t: 20 },
  { q: "What is 1010 in binary, in decimal?", a: ["8", "10", "12", "5"], t: 15 },
  { q: "Which river runs through Cairo?", a: ["Tigris", "Nile", "Niger", "Indus"], t: 20 },
  { q: "Who painted The Starry Night?", a: ["Monet", "Van Gogh", "Dalí", "Klimt"], t: 30 },
  { q: "What does the H in HTTP stand for?", a: ["Hyper", "Host", "Hash", "Home"], t: 10 },
  { q: "How many sides does a hexagon have?", a: ["5", "6", "7", "8"], t: 10 },
  { q: "Which gas do plants take in?", a: ["Oxygen", "Nitrogen", "CO₂", "Helium"], t: 20 },
];

const MOMENTS = [
  { k: "Everyone's in", v: "42 / 42" },
  { k: "Fastest answer", v: "1.2 s" },
  { k: "Streak", v: "×4" },
  { k: "Climbs to", v: "#2" },
  { k: "Correct", v: "68%" },
  { k: "Points", v: "+940" },
  { k: "Answers locked", v: "0:00" },
  { k: "Podium", v: "1 · 2 · 3" },
];

const LETTERS = ["A", "B", "C", "D"];

export function Showcase() {
  return (
    <div className="flex flex-col gap-4">
      <Marquee duration={70} label="Example questions">
        {QUESTIONS.map((q, i) => (
          <Tilt key={i} max={6} className="w-[19rem] shrink-0 rounded-lg">
            <article className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between text-caption text-fg-3">
                <span className="label">Question {i + 1}</span>
                <span className="numeric font-semibold text-fg-2">{q.t}s</span>
              </div>
              <p className="font-display text-h3 leading-snug">{q.q}</p>
              <ul className="grid grid-cols-2 gap-1.5">
                {q.a.map((a, j) => (
                  <li
                    key={a}
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm font-semibold"
                    style={{
                      background: `var(--answer-${j + 1})`,
                      color: `var(--answer-ink-${j + 1})`,
                    }}
                  >
                    <span className="numeric text-caption opacity-70">{LETTERS[j]}</span>
                    {a}
                  </li>
                ))}
              </ul>
            </article>
          </Tilt>
        ))}
      </Marquee>
      <Marquee duration={48} reverse gap={12}>
        {MOMENTS.map((m) => (
          <div
            key={m.k}
            className="flex shrink-0 items-baseline gap-3 rounded-full border border-line-strong bg-elevated px-5 py-2.5"
          >
            <span className="text-body-sm text-fg-2">{m.k}</span>
            <span className="numeric text-h3 font-bold text-accent">{m.v}</span>
          </div>
        ))}
      </Marquee>
    </div>
  );
}

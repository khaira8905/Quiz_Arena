"use client";

import { useEffect, useRef, useState } from "react";
import {
  FAMILY_META,
  INTERVENTION_META,
  STATE_META,
  TUNING,
  type StateFamily,
  type TimelineEntry,
} from "@attune/engine";
import { familyColor } from "../ui";

/**
 * The engagement arc: Before → Intervention → Response → Adaptation, as one line.
 * Each point is the engagement index when a decision was made; the last point is how the latest
 * activity ended. Marker colour shows the state family and is always backed by the legend and
 * the tooltip text.
 */

const FAMILIES: StateFamily[] = ["engaged", "understimulated", "overloaded", "depleted", "social"];

export function EngagementArc({
  timeline,
  height = 132,
}: {
  timeline: TimelineEntry[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([e]) => e && setWidth(Math.max(280, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = timeline.map((t) => ({ index: t.indexBefore, entry: t, final: false }));
  const last = timeline[timeline.length - 1];
  if (last?.outcome) points.push({ index: last.outcome.indexAfter, entry: last, final: true });

  const pad = { l: 30, r: 16, t: 10, b: 22 };
  const n = Math.max(points.length - 1, 1);
  const x = (i: number) => pad.l + (i / n) * (width - pad.l - pad.r);
  const y = (v: number) => height - pad.b - (v / 100) * (height - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.index)}`).join("");
  const area = points.length > 1 ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const families = [...new Set(timeline.map((t) => STATE_META[t.state].family))];
  const hp = hover !== null ? points[hover] : undefined;

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Engagement index across ${timeline.length} decisions, from ${points[0]?.index ?? 0} to ${points[points.length - 1]?.index ?? 0}.`}
        onMouseLeave={() => setHover(null)}
      >
        <rect
          x={pad.l}
          y={y(100)}
          width={width - pad.l - pad.r}
          height={y(TUNING.recovery.engagedIndex) - y(100)}
          fill="var(--accent-soft)"
          opacity={0.6}
        />
        <text
          x={width - pad.r - 4}
          y={y(100) + 12}
          textAnchor="end"
          fontSize={10.5}
          fill="var(--muted)"
        >
          engaged zone
        </text>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
            />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        {area && <path d={area} fill="var(--series-1)" opacity={0.08} />}
        {points.length > 1 && (
          <path
            d={line}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.map((p, i) => (
          <g
            key={`${p.entry.decisionId}-${p.final}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={0}
            role="img"
            aria-label={describe(p.entry, p.final, p.index)}
          >
            <circle cx={x(i)} cy={y(p.index)} r={12} fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(p.index)}
              r={p.final ? 4 : 5}
              fill={p.final ? "var(--surface)" : familyColor(STATE_META[p.entry.state].family)}
              stroke={p.final ? "var(--ink-2)" : "var(--surface)"}
              strokeWidth={2}
            />
          </g>
        ))}
        {hp && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={pad.t}
            y2={height - pad.b}
            stroke="var(--line-strong)"
            pointerEvents="none"
          />
        )}
        <text x={pad.l} y={height - 6} fontSize={10.5} fill="var(--muted)">
          start
        </text>
        <text x={width - pad.r} y={height - 6} textAnchor="end" fontSize={10.5} fill="var(--muted)">
          now
        </text>
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-soft"
          style={{ left: Math.min(Math.max(x(hover!) - 120, 0), width - 240), top: 0 }}
        >
          {describe(hp.entry, hp.final, hp.index)}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        {FAMILIES.filter((f) => families.includes(f)).map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: familyColor(f) }}
              aria-hidden
            />
            {FAMILY_META[f].label}
          </span>
        ))}
        {timeline.length <= 1 && !last?.outcome && (
          <span>· The arc fills in as you go: one point per decision, and how each landed.</span>
        )}
      </div>
    </div>
  );
}

function describe(entry: TimelineEntry, final: boolean, index: number): string {
  if (final) {
    const o = entry.outcome!;
    return `After "${entry.title}": index ${index} (${o.delta >= 0 ? "+" : ""}${o.delta}). ${o.recovered ? "Engagement recovered." : o.status === "completed" ? "Finished, no clear lift." : `Activity ${o.status}.`}`;
  }
  const outcome = entry.outcome
    ? entry.outcome.recovered
      ? " → recovered"
      : ` → ${entry.outcome.status}, no lift`
    : " → in progress";
  return `${STATE_META[entry.state].label} (index ${index}) → ${INTERVENTION_META[entry.kind].label}: "${entry.title}"${outcome}`;
}

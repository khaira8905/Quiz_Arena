"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualKind } from "@attune/engine";

/**
 * Interactive explanations. Each is a small, honest chart: one job, thin marks, labels in text
 * colours, a legend whenever there are two series, and a readout that works without hover.
 */

export function Visual({ kind }: { kind: VisualKind }) {
  switch (kind) {
    case "growth-compare":
      return <GrowthCompare />;
    case "doubling-ladder":
      return <DoublingLadder />;
    case "compound-bars":
      return <CompoundBars />;
  }
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([entry]) => entry && setWidth(Math.max(260, Math.round(entry.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmt = (n: number) =>
  n >= 10_000
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="mt-3 flex items-center gap-3 text-[13px] text-ink-2">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <span className="tabular w-14 shrink-0 text-right font-mono text-ink">
        {value}
        {suffix}
      </span>
    </label>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-[12.5px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ background: i.color, height: 3 }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* Adding vs multiplying --------------------------------------------------------------------- */

function GrowthCompare() {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [steps, setSteps] = useState(8);
  const [hover, setHover] = useState<number | null>(null);
  const h = 220;
  const pad = { l: 44, r: 92, t: 12, b: 26 };
  const ks = Array.from({ length: steps + 1 }, (_, k) => k);
  const lin = (k: number) => 3 + 3 * k;
  const exp = (k: number) => 3 * 2 ** k;
  const maxY = Math.max(exp(steps), lin(steps));
  const x = (k: number) => pad.l + (k / steps) * (width - pad.l - pad.r);
  const y = (v: number) => h - pad.b - (v / maxY) * (h - pad.t - pad.b);
  const path = (f: (k: number) => number) =>
    ks.map((k, i) => `${i ? "L" : "M"}${x(k)},${y(f(k))}`).join("");
  const at = hover ?? steps;

  return (
    <div ref={ref}>
      <Legend
        items={[
          { label: "Doubling (×2 each step)", color: "var(--series-1)" },
          { label: "Adding (+3 each step)", color: "var(--series-2)" },
        ]}
      />
      <svg
        width={width}
        height={h}
        role="img"
        aria-label={`After ${at} steps, adding gives ${lin(at)} and doubling gives ${fmt(exp(at))}.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const k = Math.round(((e.clientX - rect.left - pad.l) / (width - pad.l - pad.r)) * steps);
          setHover(Math.max(0, Math.min(steps, k)));
        }}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y(maxY * f)}
              y2={y(maxY * f)}
              stroke="var(--chart-grid)"
            />
            <text
              x={pad.l - 6}
              y={y(maxY * f) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
            >
              {fmt(Math.round(maxY * f))}
            </text>
          </g>
        ))}
        <line
          x1={pad.l}
          x2={width - pad.r}
          y1={h - pad.b}
          y2={h - pad.b}
          stroke="var(--chart-axis)"
        />
        <text x={pad.l} y={h - 8} fontSize={11} fill="var(--muted)">
          step 0
        </text>
        <text x={width - pad.r} y={h - 8} fontSize={11} fill="var(--muted)" textAnchor="end">
          step {steps}
        </text>
        <path
          d={`${path(exp)}L${x(steps)},${y(0)}L${x(0)},${y(0)}Z`}
          fill="var(--series-1)"
          opacity={0.08}
        />
        <path
          d={path(lin)}
          fill="none"
          stroke="var(--series-2)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={path(exp)}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover !== null && (
          <line x1={x(at)} x2={x(at)} y1={pad.t} y2={h - pad.b} stroke="var(--line-strong)" />
        )}
        <circle
          cx={x(at)}
          cy={y(exp(at))}
          r={4.5}
          fill="var(--series-1)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
        <circle
          cx={x(at)}
          cy={y(lin(at))}
          r={4.5}
          fill="var(--series-2)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
        <text x={x(steps) + 8} y={y(exp(steps)) + 4} fontSize={12} fill="var(--ink)">
          {fmt(exp(steps))}
        </text>
        <text
          x={x(steps) + 8}
          y={Math.min(y(lin(steps)) + 4, h - pad.b - 2)}
          fontSize={12}
          fill="var(--ink-2)"
        >
          {lin(steps)}
        </text>
      </svg>
      <p className="tabular text-[13.5px] text-ink-2" aria-live="polite">
        After <strong className="text-ink">{at}</strong> steps: adding reaches{" "}
        <strong className="text-ink">{lin(at)}</strong>; doubling reaches{" "}
        <strong className="text-ink">{fmt(exp(at))}</strong>.
      </p>
      <Slider label="Steps" value={steps} min={2} max={20} onChange={setSteps} />
    </div>
  );
}

/* Doubling ladder --------------------------------------------------------------------------- */

function DoublingLadder() {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [target, setTarget] = useState(40);
  const rungs = 8; // 1 .. 128
  const h = 200;
  const pad = { l: 16, r: 16, t: 28, b: 34 };
  const x = (k: number) => pad.l + (k / (rungs - 1)) * (width - pad.l - pad.r);
  const y = (k: number) => h - pad.b - (k / (rungs - 1)) * (h - pad.t - pad.b);
  const log = Math.log2(target);
  const barW = Math.min(24, (width - pad.l - pad.r) / rungs - 6);

  return (
    <div ref={ref}>
      <svg
        width={width}
        height={h}
        role="img"
        aria-label={`log base 2 of ${target} is about ${log.toFixed(2)}: ${target} is ${log.toFixed(2)} doublings up from 1.`}
      >
        <line
          x1={pad.l}
          x2={width - pad.r}
          y1={h - pad.b}
          y2={h - pad.b}
          stroke="var(--chart-axis)"
        />
        {Array.from({ length: rungs }, (_, k) => {
          const top = y(k);
          const reached = k <= Math.floor(log);
          return (
            <g key={k}>
              <path
                d={`M${x(k) - barW / 2},${h - pad.b} L${x(k) - barW / 2},${top + 4} Q${x(k) - barW / 2},${top} ${x(k) - barW / 2 + 4},${top} L${x(k) + barW / 2 - 4},${top} Q${x(k) + barW / 2},${top} ${x(k) + barW / 2},${top + 4} L${x(k) + barW / 2},${h - pad.b} Z`}
                fill={reached ? "var(--series-1)" : "var(--seq-1)"}
              />
              <text
                x={x(k)}
                y={h - pad.b + 14}
                textAnchor="middle"
                fontSize={11}
                fill="var(--muted)"
              >
                {k}
              </text>
              <text x={x(k)} y={top - 6} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
                {2 ** k}
              </text>
            </g>
          );
        })}
        <line
          x1={x(log)}
          x2={x(log)}
          y1={pad.t - 10}
          y2={h - pad.b}
          stroke="var(--ink)"
          strokeDasharray="0"
          strokeWidth={1.5}
        />
        <circle
          cx={x(log)}
          cy={y(log)}
          r={5}
          fill="var(--ink)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
        <text x={pad.l} y={h - 4} fontSize={11} fill="var(--muted)">
          rung number (doublings from 1) →
        </text>
      </svg>
      <p className="tabular text-[13.5px] text-ink-2" aria-live="polite">
        {target} sits <strong className="text-ink">{log.toFixed(2)}</strong> rungs up, so{" "}
        <strong className="text-ink">
          log₂ {target} ≈ {log.toFixed(2)}
        </strong>
        .
      </p>
      <Slider label="Number" value={target} min={1} max={128} onChange={setTarget} />
    </div>
  );
}

/* Simple vs compound ------------------------------------------------------------------------ */

function CompoundBars() {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [rate, setRate] = useState(10);
  const [hover, setHover] = useState<number | null>(null);
  const years = 10;
  const h = 220;
  const pad = { l: 52, r: 10, t: 12, b: 26 };
  const simple = (n: number) => 1000 + 1000 * (rate / 100) * n;
  const compound = (n: number) => 1000 * (1 + rate / 100) ** n;
  const maxY = compound(years);
  const band = (width - pad.l - pad.r) / years;
  const barW = Math.min(14, band / 2 - 3);
  const y = (v: number) => h - pad.b - (v / maxY) * (h - pad.t - pad.b);
  const at = hover ?? years;

  const bar = (cx: number, v: number, color: string) => {
    const top = y(v);
    const r = Math.min(4, (h - pad.b - top) / 2);
    const l = cx - barW / 2;
    const rr = cx + barW / 2;
    return (
      <path
        d={`M${l},${h - pad.b} L${l},${top + r} Q${l},${top} ${l + r},${top} L${rr - r},${top} Q${rr},${top} ${rr},${top + r} L${rr},${h - pad.b} Z`}
        fill={color}
      />
    );
  };

  return (
    <div ref={ref}>
      <Legend
        items={[
          { label: "Compound", color: "var(--series-1)" },
          { label: "Simple", color: "var(--series-2)" },
        ]}
      />
      <svg
        width={width}
        height={h}
        role="img"
        aria-label={`At ${rate}% for ${at} years, simple interest gives ₹${fmt(simple(at))} and compound gives ₹${fmt(compound(at))}.`}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y(maxY * f)}
              y2={y(maxY * f)}
              stroke="var(--chart-grid)"
            />
            <text
              x={pad.l - 6}
              y={y(maxY * f) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
            >
              ₹{fmt(Math.round(maxY * f))}
            </text>
          </g>
        ))}
        {Array.from({ length: years }, (_, i) => {
          const n = i + 1;
          const cx = pad.l + band * i + band / 2;
          return (
            <g
              key={n}
              onMouseEnter={() => setHover(n)}
              opacity={hover === null || hover === n ? 1 : 0.45}
            >
              <rect
                x={cx - band / 2}
                y={pad.t}
                width={band}
                height={h - pad.t - pad.b}
                fill="transparent"
              />
              {bar(cx - barW / 2 - 1, compound(n), "var(--series-1)")}
              {bar(cx + barW / 2 + 1, simple(n), "var(--series-2)")}
              <text x={cx} y={h - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {n}
              </text>
            </g>
          );
        })}
        <line
          x1={pad.l}
          x2={width - pad.r}
          y1={h - pad.b}
          y2={h - pad.b}
          stroke="var(--chart-axis)"
        />
      </svg>
      <p className="tabular text-[13.5px] text-ink-2" aria-live="polite">
        Year <strong className="text-ink">{at}</strong> at {rate}%: simple ₹{fmt(simple(at))},
        compound <strong className="text-ink">₹{fmt(compound(at))}</strong> (+₹
        {fmt(compound(at) - simple(at))}).
      </p>
      <Slider label="Rate" value={rate} min={2} max={20} onChange={setRate} suffix="%" />
    </div>
  );
}

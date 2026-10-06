import { cn } from "@/lib/cn";

const COLORS = ["var(--answer-1)", "var(--answer-2)", "var(--answer-3)", "var(--answer-4)"];

/** Small, stable hash so a player keeps the same look across renders and screens. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * One competitor: a capsule body, round head and swinging limbs, drawn in SVG and animated
 * entirely with CSS (see .competitor in globals.css). `walking` swings the limbs; otherwise
 * they stand and breathe. `seed` picks a colour, height and whether they carry a pennant.
 */
export function Competitor({
  seed,
  walking,
  facing = "right",
  className,
  style,
}: {
  seed: number;
  walking: boolean;
  facing?: "right" | "left";
  className?: string;
  style?: React.CSSProperties;
}) {
  const color = COLORS[seed % COLORS.length];
  const pennant = seed % 5 === 0;
  const tall = (seed >> 3) % 3; // 0, 1, 2: three heights so a crowd isn't uniform
  // Different stride speeds keep a group from marching in lockstep.
  const step = 0.46 + ((seed >> 5) % 5) * 0.03;
  return (
    <svg
      viewBox="0 0 28 44"
      aria-hidden
      className={cn("competitor overflow-visible", className)}
      data-walking={walking || undefined}
      style={
        {
          ...style,
          "--step": `${step}s`,
          "--body": color,
          scale: facing === "left" ? "-1 1" : undefined,
        } as React.CSSProperties
      }
    >
      <g className="competitor-bob">
        {/* back arm and leg sit behind the body */}
        <line className="limb leg-b" x1="15" y1="29" x2="15" y2="42" />
        <line className="limb arm-b" x1="16" y1="17" x2="17" y2="26" />
        <rect
          className="competitor-body"
          x="9"
          y={15 - tall}
          width="12"
          height={16 + tall}
          rx="6"
        />
        <circle className="competitor-head" cx="15" cy={9 - tall} r="5.2" />
        <line className="limb leg-a" x1="13" y1="29" x2="13" y2="42" />
        <g className="arm-a">
          <line className="limb" x1="13" y1="17" x2="11" y2="26" />
          {pennant && (
            <>
              <line className="pennant-pole" x1="11" y1="26" x2="11" y2={4 - tall} />
              <path className="pennant" d={`M11 ${4 - tall} l9 3 l-9 3 z`} />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}

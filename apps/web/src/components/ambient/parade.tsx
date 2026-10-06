import { Competitor } from "./competitor";

/**
 * Three rows of competitors crossing toward the arena, for depth: the far row is small,
 * slow, faint and near the horizon; the near row large, quicker and full contrast. Every
 * walker in a row is evenly spaced, so nobody bunches up. CSS only (no JS per frame); with
 * reduced motion they stand where they are.
 */
const ROWS = [
  { count: 7, duration: 78, scale: 0.46, bottom: 46, opacity: 0.4, seed: 3 },
  { count: 8, duration: 58, scale: 0.7, bottom: 22, opacity: 0.7, seed: 17 },
  { count: 10, duration: 44, scale: 1, bottom: 0, opacity: 1, seed: 29 },
] as const;

export function Parade({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="relative h-full overflow-hidden">
        {ROWS.map((row, r) => (
          <div
            key={r}
            className="absolute inset-x-0"
            style={{
              bottom: `${row.bottom}%`,
              height: `${row.scale * 100}%`,
              opacity: row.opacity,
            }}
          >
            {Array.from({ length: row.count }, (_, i) => {
              const phase = (i + r * 0.37) / row.count;
              return (
                <div
                  key={i}
                  className="parade-walker"
                  style={
                    {
                      "--parade-duration": `${row.duration}s`,
                      // Negative delay: everyone is already mid-crossing on first paint.
                      "--parade-delay": `${-phase * row.duration}s`,
                      "--parade-rest": `${((phase % 1) * 100).toFixed(1)}%`,
                    } as React.CSSProperties
                  }
                >
                  <Competitor
                    seed={(row.seed + i * 7) * 41}
                    walking
                    className="absolute bottom-0 left-0 h-full w-auto"
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

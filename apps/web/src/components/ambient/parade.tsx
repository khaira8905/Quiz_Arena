import { Competitor } from "./competitor";

const WALKERS = 11;
const DURATION = 46; // seconds for one crossing

/**
 * A loop of competitors crossing a band, evenly spaced so they never bunch. CSS-only (no
 * JS per frame). With reduced motion they stand still where they are.
 */
export function Parade({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="relative h-full overflow-hidden">
        {Array.from({ length: WALKERS }, (_, i) => {
          const phase = i / WALKERS;
          return (
            <div
              key={i}
              className="parade-walker"
              style={
                {
                  "--parade-duration": `${DURATION}s`,
                  // Negative delay: everyone is already mid-crossing on first paint.
                  "--parade-delay": `${-phase * DURATION}s`,
                  "--parade-rest": `${(phase * 100).toFixed(1)}%`,
                } as React.CSSProperties
              }
            >
              <Competitor
                // Fixed seeds: a varied, repeatable crowd.
                seed={[5, 9, 2, 15, 7, 20, 3, 12, 6, 25, 11][i]! * 41}
                walking
                className="absolute bottom-0 left-0 h-full w-auto"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

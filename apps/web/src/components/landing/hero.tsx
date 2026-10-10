import Link from "next/link";
import { CodePill } from "./code-pill";
import { ProjectorScene } from "./projector-scene";

/**
 * Split hero: the promise and the game-PIN entry on the left, the looping big-screen scene on
 * the right, divided by the frame's centre hairline. Static on load: the scene is the only
 * thing that moves. Phones stack the scene first.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="lp-frame grid px-0! md:grid-cols-2">
      <div className="order-2 flex flex-col justify-center px-[var(--lp-pad)] py-10 md:order-1 md:py-16 lg:py-20">
        <h1 id="hero-title" className="lp-h1 max-w-[12ch]">
          Turn any room into a quiz show.
        </h1>
        <p className="mt-5 text-[18px] text-fg">One big screen. Every phone a buzzer.</p>
        <p className="lp-body mt-3 max-w-[30rem]">
          Players join from their phone&apos;s browser with a game PIN: no app, no account. You run
          the questions on the big screen, and scores land the moment time runs out.
        </p>
        <div id="join" className="mt-8">
          <CodePill />
        </div>
        <p className="mt-3 text-[13px] text-fg-3">
          Hosting instead?{" "}
          <Link href="/admin" className="lp-link font-medium text-fg">
            Host a quiz →
          </Link>
        </p>
      </div>
      <div className="lp-hairline order-1 p-4 md:order-2 md:border-l md:border-line">
        <ProjectorScene />
      </div>
    </section>
  );
}

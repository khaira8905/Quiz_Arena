import { Fraunces } from "next/font/google";
import { Band } from "@/components/landing/band";
import { QuestionTypes, Replay } from "@/components/landing/carousels";
import { FinalCta, Stats } from "@/components/landing/finale";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { Capabilities, Crowd, Footer, Pillars } from "@/components/landing/sections";
import "@/components/landing/landing.css";

/**
 * Landing-page serif: soft, bookish headlines. Variable, with its "softness" and optical-size
 * axes; loaded here rather than in the root layout so only this page pays for it.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
  display: "swap",
});

/**
 * The landing page. Calm and editorial: native scrolling, nothing scroll-linked, one hard
 * colour beat (the band) a third of the way down, one accent block two thirds down, the
 * game-PIN entry three times (hero, band, finale), and four gentle loops (the hero scene,
 * the crowd, the phone ticker and the sample-game replay). See components/landing/landing.css.
 */
export default function Home() {
  return (
    <main id="top" className={`lp ${fraunces.variable} min-h-dvh overflow-x-clip bg-bg text-fg`}>
      <LandingNav />
      <Hero />
      <Band />
      <Pillars />
      <Capabilities />
      <QuestionTypes />
      <Crowd />
      <Stats />
      <Replay />
      <FinalCta />
      <Footer />
    </main>
  );
}

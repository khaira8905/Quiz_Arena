"use client";

import { GAME_CODE_PATTERN, normalizeGameCode } from "@quizarena/shared/constants";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = normalizeGameCode(code);
  const complete = GAME_CODE_PATTERN.test(clean);

  return (
    <form
      className="mt-6 flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/play?game=${encodeURIComponent(clean)}`);
      }}
    >
      <label htmlFor="landing-code" className="sr-only">
        Game code
      </label>
      <input
        id="landing-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="QA000000"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={8}
        className="numeric h-14 min-w-0 flex-1 rounded-md border border-line-strong bg-sunken px-4 text-center text-2xl font-bold tracking-[0.12em] text-fg placeholder:text-fg-3/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft sm:text-left"
      />
      <Button type="submit" size="lg" className="h-14" disabled={!complete}>
        Join <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </form>
  );
}

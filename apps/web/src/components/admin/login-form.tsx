"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { isApiError } from "@/lib/api";
import { useLogin } from "@/lib/queries";
import { pokeServer } from "@/lib/server-wake";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Start waking the free-tier server while the host types their password.
  useEffect(pokeServer, []);
  const waking = login.isPending && login.failureCount > 0;
  const error = login.error
    ? isApiError(login.error)
      ? login.error.message
      : "Sign-in failed."
    : null;

  return (
    <form
      className="mt-8 flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate({ email, password }, { onSuccess: () => router.replace(next) });
      }}
      noValidate
    >
      <Field label="Email">
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Field label="Password">
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {waking && (
        <p role="status" className="text-body-sm text-fg-2">
          Waking up the server. This takes up to a minute after a quiet period.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-body-sm text-fg"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        loading={login.isPending}
        disabled={!email || !password}
        className="mt-2"
      >
        Enter control room <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </form>
  );
}

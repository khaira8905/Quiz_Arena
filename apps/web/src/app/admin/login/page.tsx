import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/brand/logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only allow internal admin redirects.
  const safeNext = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <section className="arena-floor relative hidden flex-col justify-between overflow-hidden border-r border-line p-10 lg:flex">
        <Logo />
        <div>
          <p className="label text-accent">Control room</p>
          <p
            className="mt-5 font-display text-display font-extrabold uppercase leading-[0.9]"
            aria-hidden
          >
            Build it.
            <br />
            Run it.
            <br />
            <span className="text-accent">Own the room.</span>
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-6 border-t border-line pt-6">
          {[
            ["100+", "players per arena"],
            ["< 50ms", "answer receipt"],
            ["4K", "projector ready"],
          ].map(([v, l]) => (
            <div key={l}>
              <dt className="label text-fg-3">{l}</dt>
              <dd className="numeric mt-2 text-h1 font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <ThemeSwitcher className="absolute right-6 top-6" />
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="font-display text-h1">Sign in</h1>
          <p className="mt-2 text-body text-fg-2">
            Organisers and hosts only. Players join at the home page.
          </p>
          <LoginForm next={safeNext} />
        </div>
      </section>
    </main>
  );
}

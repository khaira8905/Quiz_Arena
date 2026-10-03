"use client";

import type { TeamMemberDto, UserRole } from "@quizarena/shared/dto";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/switch";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useCreateMember, useDeleteMember, useMe, useTeam, useUpdateMember } from "@/lib/queries";

/** Easy to read aloud or type from a phone: no 0/O, 1/l/I. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

interface Shared {
  name: string;
  email: string;
  password: string;
  reset?: boolean;
}

/**
 * TEAM: create sign-ins (email + password) for the people who run quizzes with you and
 * share them however you like. There's no email verification; accounts work at once. Each
 * person only ever sees their own quizzes, media and results.
 */
export function Team() {
  const me = useMe();
  const isAdmin = me.data?.role === "ADMIN";
  const team = useTeam(isAdmin);
  const [adding, setAdding] = useState(false);
  const [shared, setShared] = useState<Shared | null>(null);

  if (me.data && !isAdmin) {
    return (
      <>
        <PageHeader eyebrow="Account" title="Team" />
        <EmptyState
          className="mt-8"
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Admins only"
          description="Ask an admin if you need a sign-in for someone else."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Team"
        description="Create sign-ins for the people who run quizzes with you. They can sign in straight away (there's no email verification), and each person only sees their own quizzes."
        actions={
          <Button notch onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" /> Add person
          </Button>
        }
      />

      <div className="mt-6">
        {team.isError ? (
          <EmptyState
            title="Couldn't load the team"
            description="The server didn't respond."
            action={<Button onClick={() => team.refetch()}>Retry</Button>}
          />
        ) : team.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : team.data.length <= 1 ? (
          <>
            <MemberList members={team.data} meId={me.data?.id} onShare={setShared} />
            <EmptyState
              className="mt-4"
              icon={<Users className="h-6 w-6" />}
              title="Just you so far"
              description="Add a person to give them their own email and password."
              action={
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  <UserPlus className="h-4 w-4" /> Add person
                </Button>
              }
            />
          </>
        ) : (
          <MemberList members={team.data} meId={me.data?.id} onShare={setShared} />
        )}
      </div>

      {adding && (
        <AddPersonDialog
          onClose={() => setAdding(false)}
          onCreated={(s) => {
            setAdding(false);
            setShared(s);
          }}
        />
      )}
      {shared && <ShareDialog shared={shared} onClose={() => setShared(null)} />}
    </>
  );
}

function MemberList({
  members,
  meId,
  onShare,
}: {
  members: TeamMemberDto[];
  meId?: string;
  onShare: (s: Shared) => void;
}) {
  return (
    <ul className="border-t border-line" aria-label="Team members">
      {members.map((m) => (
        <MemberRow key={m.id} m={m} isMe={m.id === meId} onShare={onShare} />
      ))}
    </ul>
  );
}

function MemberRow({
  m,
  isMe,
  onShare,
}: {
  m: TeamMemberDto;
  isMe: boolean;
  onShare: (s: Shared) => void;
}) {
  const update = useUpdateMember();
  const del = useDeleteMember();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);

  const patch = async (p: Parameters<typeof update.mutateAsync>[0]["patch"], done: string) => {
    setMenu(false);
    try {
      await update.mutateAsync({ id: m.id, patch: p });
      toast.success(done);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't update");
    }
  };

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3.5",
        m.disabled && "opacity-70",
      )}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-elevated font-display font-bold"
        aria-hidden
      >
        {m.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{m.name}</span>
          {isMe && <span className="text-body-sm text-fg-3">(you)</span>}
          <Badge tone={m.role === "ADMIN" ? "accent" : "neutral"}>
            {m.role === "ADMIN" ? "Admin" : "Organiser"}
          </Badge>
          {m.disabled && <Badge tone="warning">Disabled</Badge>}
        </div>
        <div className="mt-0.5 truncate text-body-sm text-fg-2">{m.email}</div>
      </div>
      <div className="text-right text-body-sm text-fg-3">
        <div>
          {m.quizCount} {m.quizCount === 1 ? "quiz" : "quizzes"}
        </div>
        <div title={m.lastLoginAt ? formatDateTime(m.lastLoginAt) : undefined}>
          {m.lastLoginAt ? `Signed in ${timeAgo(m.lastLoginAt)}` : "Hasn't signed in yet"}
        </div>
      </div>
      {!isMe && (
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${m.name}`}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 top-10 z-20 w-56 border border-line-strong bg-elevated p-1 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)]"
              onMouseLeave={() => setMenu(false)}
            >
              <MenuItem icon={KeyRound} onClick={() => (setMenu(false), setConfirm("reset"))}>
                Reset password
              </MenuItem>
              <MenuItem
                icon={ShieldCheck}
                onClick={() =>
                  void patch(
                    { role: m.role === "ADMIN" ? "ORGANISER" : "ADMIN" },
                    m.role === "ADMIN"
                      ? `${m.name} is now an organiser`
                      : `${m.name} is now an admin`,
                  )
                }
              >
                {m.role === "ADMIN" ? "Make organiser" : "Make admin"}
              </MenuItem>
              <MenuItem
                icon={m.disabled ? Check : EyeOff}
                onClick={() =>
                  void patch(
                    { disabled: !m.disabled },
                    m.disabled
                      ? `${m.name} can sign in again`
                      : `${m.name} is disabled and signed out`,
                  )
                }
              >
                {m.disabled ? "Enable account" : "Disable account"}
              </MenuItem>
              <MenuItem icon={Trash2} danger onClick={() => (setMenu(false), setConfirm("delete"))}>
                Delete account
              </MenuItem>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === "reset"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Reset ${m.name}'s password?`}
        description="They'll be signed out everywhere, and you'll get a new password to share with them."
        confirmLabel="Reset password"
        onConfirm={async () => {
          const password = generatePassword();
          try {
            await update.mutateAsync({ id: m.id, patch: { password } });
            onShare({ name: m.name, email: m.email, password, reset: true });
          } catch (err) {
            toast.error(isApiError(err) ? err.message : "Couldn't reset");
          }
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${m.name}'s account?`}
        description={
          m.quizCount
            ? `Their ${m.quizCount} ${m.quizCount === 1 ? "quiz" : "quizzes"}, results and images go with it. This can't be undone — disabling keeps everything.`
            : "They won't be able to sign in. This can't be undone."
        }
        confirmLabel="Delete account"
        onConfirm={async () => {
          try {
            await del.mutateAsync(m.id);
            toast.success(`${m.name}'s account was deleted`);
          } catch (err) {
            toast.error(isApiError(err) ? err.message : "Couldn't delete");
          }
        }}
      />
    </li>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-body-sm hover:bg-sunken",
        danger ? "text-danger" : "text-fg",
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

function AddPersonDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: Shared) => void;
}) {
  const create = useCreateMember();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [show, setShow] = useState(true);
  const [role, setRole] = useState<UserRole>("ORGANISER");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const member = await create.mutateAsync({ name, email, password, role });
      onCreated({ name: member.name, email: member.email, password });
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't create the account");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a person"
      description="They can sign in as soon as you share these details. No email is sent."
    >
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field label="Name">
          {(p) => (
            <Input
              {...p}
              required
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Email">
          {(p) => (
            <Input
              {...p}
              required
              type="email"
              autoComplete="off"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password" hint="At least 10 characters. A strong one is filled in for you.">
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                required
                minLength={10}
                maxLength={200}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="numeric flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-11"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-11"
                aria-label="Generate a new password"
                title="Generate a new password"
                onClick={() => setPassword(generatePassword())}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Field>
        <div>
          <div className="mb-1.5 text-body-sm font-medium text-fg-2">Role</div>
          <Segmented<UserRole>
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: "ORGANISER", label: "Organiser" },
              { value: "ADMIN", label: "Admin" },
            ]}
          />
          <p className="mt-1.5 text-caption text-fg-3">
            {role === "ADMIN"
              ? "Admins can also add, reset and remove people here."
              : "Organisers create and run their own quizzes."}
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="border border-danger/40 bg-danger-soft px-3 py-2 text-body-sm text-danger"
          >
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={password.length < 10}>
            Create account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The one moment the password is visible: copy it now, it's stored only as a hash. */
function ShareDialog({ shared, onClose }: { shared: Shared; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${typeof window === "undefined" ? "" : window.location.origin}/admin/login`;
  const text = [
    `QuizArena sign-in for ${shared.name}`,
    `Link: ${link}`,
    `Email: ${shared.email}`,
    `Password: ${shared.password}`,
    "",
    "You can change your password in Settings after signing in.",
  ].join("\n");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={shared.reset ? "New password ready" : "Account created"}
      description="Share these details with them. The password is shown only now: it's stored securely and can't be looked up later (you can always reset it)."
    >
      <dl className="mt-5 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border border-line bg-sunken p-4 text-body-sm">
        <dt className="text-fg-3">Link</dt>
        <dd className="break-all">{link}</dd>
        <dt className="text-fg-3">Email</dt>
        <dd className="break-all font-medium">{shared.email}</dd>
        <dt className="text-fg-3">Password</dt>
        <dd className="numeric break-all text-body font-bold">{shared.password}</dd>
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
        <Button
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => {
                setCopied(true);
                toast.success("Sign-in details copied");
              },
              () => toast.error("Couldn't copy — select the details and copy them"),
            )
          }
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy sign-in details"}
        </Button>
      </div>
    </Dialog>
  );
}

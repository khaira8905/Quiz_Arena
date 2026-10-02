"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useMe, useUpdateProfile } from "@/lib/queries";

export default function ProfilePage() {
  const me = useMe();
  const update = useUpdateProfile();
  const [name, setName] = useState<string | null>(null);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const currentName = name ?? me.data?.name ?? "";

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description={
          me.data
            ? `Signed in as ${me.data.email} · member since ${formatDateTime(me.data.createdAt)}`
            : undefined
        }
      />
      <div className="mt-8 grid max-w-3xl gap-10 md:grid-cols-2">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              { name: currentName },
              {
                onSuccess: () => toast.success("Name updated"),
                onError: (err) => toast.error(isApiError(err) ? err.message : "Update failed"),
              },
            );
          }}
        >
          <h2 className="label text-fg-2">Display name</h2>
          <Field label="Name">
            {(p) => (
              <Input
                {...p}
                value={currentName}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="secondary"
            loading={update.isPending && !newPassword}
            disabled={!currentName.trim()}
            className="self-start"
          >
            Save name
          </Button>
        </form>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              { currentPassword, newPassword },
              {
                onSuccess: () => {
                  toast.success("Password changed");
                  setCurrent("");
                  setNext("");
                },
                onError: (err) => toast.error(isApiError(err) ? err.message : "Update failed"),
              },
            );
          }}
        >
          <h2 className="label text-fg-2">Password</h2>
          <Field label="Current password">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>
          <Field label="New password" hint="At least 10 characters.">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={newPassword}
                onChange={(e) => setNext(e.target.value)}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="secondary"
            loading={update.isPending && !!newPassword}
            disabled={!currentPassword || newPassword.length < 10}
            className="self-start"
          >
            Change password
          </Button>
        </form>
      </div>
    </>
  );
}

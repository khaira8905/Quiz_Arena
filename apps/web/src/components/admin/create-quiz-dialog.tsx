"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { isApiError } from "@/lib/api";
import { useCreateQuiz } from "@/lib/queries";

export function CreateQuizDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateQuiz();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New quiz"
      description="Name it now — everything else can be set in the editor."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { title, description },
            {
              onSuccess: (quiz) => {
                onOpenChange(false);
                setTitle("");
                setDescription("");
                router.push(`/admin/quizzes/${quiz.id}`);
              },
              onError: (err) =>
                toast.error(isApiError(err) ? err.message : "Couldn't create the quiz."),
            },
          );
        }}
      >
        <Field label="Title">
          {(p) => (
            <Input
              {...p}
              autoFocus
              maxLength={120}
              placeholder="e.g. Systems Design Sprint"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field label="Description" hint="Optional. Shown to you in the dashboard.">
          {(p) => (
            <Textarea
              {...p}
              maxLength={1000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!title.trim()}>
            Create &amp; open editor
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

"use client";

import { Layers, Plus, Search } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { CreateQuizDialog } from "@/components/admin/create-quiz-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { QuizCard } from "@/components/admin/quiz-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/switch";
import { useQuizzes } from "@/lib/queries";

type Filter = "ALL" | "DRAFT" | "PUBLISHED";

export default function QuizzesPage() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, isPending, isError, refetch } = useQuizzes();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (quiz) =>
        (filter === "ALL" || quiz.status === filter) &&
        (!q || quiz.title.toLowerCase().includes(q)),
    );
  }, [data, filter, query]);

  const counts = {
    ALL: data?.length ?? 0,
    DRAFT: data?.filter((q) => q.status === "DRAFT").length ?? 0,
    PUBLISHED: data?.filter((q) => q.status === "PUBLISHED").length ?? 0,
  };

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Quizzes"
        description="Everything you've built. Drafts can be edited freely; publish when every question is ready."
        actions={
          <Button onClick={() => setCreating(true)} notch>
            <Plus className="h-4 w-4" /> New quiz
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          className="sm:w-96"
          options={[
            { value: "ALL", label: `All ${counts.ALL}` },
            { value: "DRAFT", label: `Drafts ${counts.DRAFT}` },
            { value: "PUBLISHED", label: `Published ${counts.PUBLISHED}` },
          ]}
        />
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3"
            aria-hidden
          />
          <Input
            aria-label="Search quizzes"
            placeholder="Search by title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
      </div>

      <div className="mt-6">
        {isError ? (
          <EmptyState
            title="Couldn't load quizzes"
            description="The server didn't respond."
            action={<Button onClick={() => refetch()}>Retry</Button>}
          />
        ) : isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        ) : counts.ALL === 0 ? (
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="No quizzes yet"
            description="Create a quiz, add a few questions, and you can open an arena in minutes."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Create your first quiz
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <p className="border border-dashed border-line-strong p-8 text-center text-fg-3">
            Nothing matches that filter.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {visible.map((q, i) => (
                <QuizCard key={q.id} quiz={q} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <CreateQuizDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

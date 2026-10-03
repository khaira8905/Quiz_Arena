"use client";

import { IMPORT_TEMPLATE_CSV, type ImportResult } from "@quizarena/shared/import";
import type { QuizDto } from "@quizarena/shared/dto";
import { AlertTriangle, Check, Download, FileSpreadsheet, Link2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { answerStyle } from "@/components/game/answer-style";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/switch";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCreateQuiz, useImportQuestions } from "@/lib/queries";
import { readGoogleLink, readQuestionFile, templateHref } from "@/lib/question-file";
import { uiThemeStore } from "@/lib/ui-theme";

type Source = "device" | "google";

/**
 * Import questions from a spreadsheet on this device or a Google Sheets / Drive link.
 * Works in two places: inside a quiz (adds to it) and on the quiz library (creates a new
 * quiz from the file). Nothing is saved until the organiser has seen the preview.
 */
export function ImportQuestionsDialog({
  open,
  onOpenChange,
  quizId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Add to this quiz; without it, the import creates a new quiz. */
  quizId?: string;
  onImported?: (quiz: QuizDto) => void;
}) {
  const router = useRouter();
  const [source, setSource] = useState<Source>("device");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importInto = useImportQuestions(quizId ?? "");
  const create = useCreateQuiz();
  const saving = importInto.isPending || create.isPending;
  const fileInputId = useId();

  const reset = () => {
    setResult(null);
    setError(null);
    setFileName("");
    setLink("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = (o: boolean) => {
    if (saving) return;
    onOpenChange(o);
    if (!o) reset();
  };

  const load = async (task: () => Promise<ImportResult>, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await task();
      if (r.questions.length === 0) {
        setError(
          "No questions found. The first row should name the columns: Question, Option A, Option B… Correct answer. Download the template to see the layout.",
        );
        return;
      }
      setResult(r);
      setFileName(name);
      setTitle(name.replace(/\.[^.]+$/, "").slice(0, 120) || "Imported quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (file) void load(() => readQuestionFile(file, file.name), file.name);
  };

  const commit = () => {
    if (!result) return;
    const questions = result.questions.map((q) => q.question);
    const done = (quiz: QuizDto) => {
      toast.success(`Imported ${questions.length} question${questions.length === 1 ? "" : "s"}`, {
        description:
          needsWork > 0
            ? `${needsWork} need attention. They're marked in the question list.`
            : undefined,
      });
      onOpenChange(false);
      reset();
      onImported?.(quiz);
    };
    const fail = (e: unknown) =>
      toast.error("Import failed", {
        description: isApiError(e) ? e.message : "Nothing was imported. Try again.",
      });
    if (quizId) {
      importInto.mutate(questions, { onSuccess: (r) => done(r.quiz), onError: fail });
    } else {
      create.mutate(
        { title: title.trim() || "Imported quiz", theme: uiThemeStore.get(), questions },
        {
          onSuccess: (quiz) => {
            done(quiz);
            router.push(`/admin/quizzes/${quiz.id}`);
          },
          onError: fail,
        },
      );
    }
  };

  const needsWork = result?.questions.filter((q) => q.issues.length > 0).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      size="lg"
      title={quizId ? "Import questions" : "Import a quiz"}
      description={
        quizId
          ? "Add questions from a spreadsheet. You'll see everything before it's saved."
          : "Create a quiz from a spreadsheet. You'll see everything before it's saved."
      }
    >
      {!result ? (
        <div className="flex flex-col gap-5">
          <Segmented<Source>
            label="Import from"
            value={source}
            onChange={(s) => {
              setSource(s);
              setError(null);
            }}
            options={[
              {
                value: "device",
                label: (
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" aria-hidden /> This device
                  </span>
                ),
              },
              {
                value: "google",
                label: (
                  <span className="inline-flex items-center gap-2">
                    <Link2 className="h-4 w-4" aria-hidden /> Google Drive
                  </span>
                ),
              },
            ]}
          />

          {source === "device" ? (
            <label
              htmlFor={fileInputId}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging ? "border-accent bg-accent-soft" : "border-line-strong hover:border-fg-3",
              )}
            >
              {busy ? (
                <Spinner className="h-7 w-7" />
              ) : (
                <FileSpreadsheet className="h-8 w-8 text-accent" aria-hidden />
              )}
              <span className="font-display text-h3">
                {busy ? "Reading…" : "Drop a spreadsheet here, or choose a file"}
              </span>
              <span className="text-body-sm text-fg-3">
                CSV or Excel (.xlsx), up to 2 MB and 100 questions.
              </span>
              <input
                ref={inputRef}
                id={fileInputId}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (link.trim()) void load(() => readGoogleLink(link.trim()), "Google sheet");
              }}
            >
              <Field
                label="Share link"
                hint="In Google Sheets or Drive: Share → General access → “Anyone with the link” → Copy link. Works with Google Sheets and with CSV/Excel files stored in Drive."
              >
                {(p) => (
                  <div className="flex gap-2">
                    <Input
                      {...p}
                      type="url"
                      inputMode="url"
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                    />
                    <Button type="submit" loading={busy} disabled={!link.trim()}>
                      Fetch
                    </Button>
                  </div>
                )}
              </Field>
            </form>
          )}

          {error && (
            <p
              role="alert"
              className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-body-sm text-fg"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-body-sm text-fg-2">
            <span>
              Columns: Question, Option A–D, Correct answer, and optionally Time limit, Points,
              Explanation, Image URL. Kahoot spreadsheets work as they are.
            </span>
            <a
              href={templateHref(IMPORT_TEMPLATE_CSV)}
              download="quizarena-questions-template.csv"
              className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-accent hover:underline"
            >
              <Download className="h-4 w-4" aria-hidden /> Download template
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Check className="h-4 w-4 text-success" aria-hidden />
              {result.questions.length} question{result.questions.length === 1 ? "" : "s"} from{" "}
              <span className="max-w-[16rem] truncate text-fg-2">{fileName}</span>
            </span>
            {needsWork > 0 && (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden /> {needsWork} need attention
              </span>
            )}
            {result.skipped.length > 0 && (
              <span className="text-fg-3">{result.skipped.length} rows skipped</span>
            )}
          </div>

          {!quizId && (
            <Field label="Quiz title">
              {(p) => (
                <Input
                  {...p}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
          )}

          <ol
            className="scrollbar-thin flex max-h-[44dvh] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line"
            aria-label="Questions to import"
          >
            {result.questions.map((q, i) => (
              <li key={q.row} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="numeric w-8 shrink-0 pt-0.5 text-body-sm font-bold text-fg-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-body font-medium",
                        !q.question.text && "italic text-fg-3",
                      )}
                    >
                      {q.question.text || "No question text"}
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-fg-2">
                      {q.question.options.map((o, k) => (
                        <li
                          key={k}
                          className={cn(
                            "inline-flex items-center gap-1.5",
                            o.isCorrect && "font-semibold text-fg",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-5 w-5 place-items-center text-[11px] font-extrabold",
                              answerStyle(k).bg,
                              answerStyle(k).ink,
                            )}
                            aria-hidden
                          >
                            {answerStyle(k).letter}
                          </span>
                          {o.text || <em className="text-fg-3">empty</em>}
                          {o.isCorrect && (
                            <Check className="h-3.5 w-3.5 text-success" aria-label="correct" />
                          )}
                        </li>
                      ))}
                    </ul>
                    {q.issues.length > 0 && (
                      <ul className="mt-1.5 text-body-sm text-warning">
                        {q.issues.map((issue) => (
                          <li key={issue}>
                            Row {q.row}: {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span className="label shrink-0 text-fg-3">
                    {q.question.type === "TRUE_FALSE" ? "T/F" : "Choice"}
                    {q.question.timeLimitSec ? ` · ${q.question.timeLimitSec}s` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {result.skipped.length > 0 && (
            <details className="text-body-sm text-fg-2">
              <summary className="cursor-pointer">Skipped rows</summary>
              <ul className="mt-2 list-inside list-disc text-fg-3">
                {result.skipped.map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-body-sm text-fg-3">
            Questions that need attention are imported anyway and marked in the editor; the quiz
            can&apos;t go live until they&apos;re fixed.
          </p>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={reset} disabled={saving}>
              Choose another file
            </Button>
            <Button onClick={commit} loading={saving} notch>
              {quizId
                ? `Add ${result.questions.length} question${result.questions.length === 1 ? "" : "s"}`
                : "Create quiz"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

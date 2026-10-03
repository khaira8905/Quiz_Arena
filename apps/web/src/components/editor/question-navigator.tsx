"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { questionIssues } from "@quizarena/shared/schemas";
import type { QuestionDto } from "@quizarena/shared/dto";
import { GripVertical, ListChecks, Plus, ToggleLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function QuestionNavigator({
  questions,
  selectedId,
  onSelect,
  onReorder,
  onAdd,
  adding,
  defaultTimerSec,
}: {
  questions: QuestionDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: (type: QuestionDto["type"]) => void;
  adding: boolean;
  defaultTimerSec: number;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = questions.map((q) => q.id);
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };

  return (
    <nav aria-label="Questions" className="flex min-h-0 flex-col lg:max-h-full">
      <div className="flex items-center justify-between px-1 pb-3">
        <h2 className="label text-fg-2">Questions</h2>
        <span className="numeric text-body-sm font-bold text-fg-3">
          {String(questions.length).padStart(2, "0")}
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <ol className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
            {questions.map((q, i) => (
              <NavItem
                key={q.id}
                q={q}
                index={i}
                selected={q.id === selectedId}
                onSelect={onSelect}
                defaultTimerSec={defaultTimerSec}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onAdd("MULTIPLE_CHOICE")}
          disabled={adding}
          className="flex h-10 items-center justify-center gap-1.5 border border-dashed border-line-strong text-body-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Choice
        </button>
        <button
          onClick={() => onAdd("TRUE_FALSE")}
          disabled={adding}
          className="flex h-10 items-center justify-center gap-1.5 border border-dashed border-line-strong text-body-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> True/False
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  q,
  index,
  selected,
  onSelect,
  defaultTimerSec,
}: {
  q: QuestionDto;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  defaultTimerSec: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });
  const issues = questionIssues(q);
  const Icon = q.type === "TRUE_FALSE" ? ToggleLeft : ListChecks;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative w-56 shrink-0 lg:w-auto", isDragging && "z-10")}
    >
      <div
        className={cn(
          "group flex items-stretch border bg-surface transition-[border-color,background-color,box-shadow]",
          selected ? "border-accent bg-elevated" : "border-line hover:border-line-strong",
          isDragging && "shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)]",
        )}
      >
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder question ${index + 1}`}
          className="flex w-7 cursor-grab touch-none items-center justify-center text-fg-3 hover:text-fg active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={() => onSelect(q.id)}
          aria-current={selected ? "true" : undefined}
          className="min-w-0 flex-1 py-3 pr-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "numeric text-body-sm font-extrabold",
                selected ? "text-accent" : "text-fg-3",
              )}
            >
              Q{String(index + 1).padStart(2, "0")}
            </span>
            <Icon className="h-3.5 w-3.5 text-fg-3" aria-hidden />
            <span className="label ml-auto text-fg-3">{q.timeLimitSec ?? defaultTimerSec}s</span>
            {issues.length > 0 && (
              <span
                role="img"
                className="grid h-4 w-4 place-items-center rounded-full bg-warning text-[10px] font-extrabold leading-none text-black"
                title={issues.join(" · ")}
                aria-label={`Needs attention: ${issues.join(", ")}`}
              >
                !
              </span>
            )}
          </div>
          <p
            className={cn(
              "mt-1.5 line-clamp-2 text-body-sm",
              q.text ? "text-fg" : "italic text-fg-3",
            )}
          >
            {q.text || "Untitled question"}
          </p>
        </button>
      </div>
    </li>
  );
}

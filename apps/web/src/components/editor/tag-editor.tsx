"use client";

import { TAG_MAX, TAGS_MAX } from "@quizarena/shared/constants";
import { X } from "lucide-react";
import { useId, useState } from "react";

/** Tags as removable chips; type and press Enter or comma to add. */
export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const add = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim().toLowerCase().slice(0, TAG_MAX))
      .filter(Boolean);
    if (!next.length) return;
    onChange([...new Set([...tags, ...next])].slice(0, TAGS_MAX));
    setValue("");
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-body-sm font-medium text-fg-2">
        Tags
      </label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-sunken px-2 py-1.5 focus-within:border-accent">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-sm bg-elevated px-2 py-0.5 text-body-sm"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-fg-3 hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length < TAGS_MAX && (
          <input
            id={id}
            value={value}
            maxLength={TAG_MAX * 2}
            placeholder={tags.length ? "" : "Add tags…"}
            onChange={(e) =>
              e.target.value.endsWith(",") ? add(e.target.value) : setValue(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(value);
              } else if (e.key === "Backspace" && !value && tags.length) {
                onChange(tags.slice(0, -1));
              }
            }}
            onBlur={() => add(value)}
            className="min-w-20 flex-1 bg-transparent text-body-sm outline-none placeholder:text-fg-3"
          />
        )}
      </div>
    </div>
  );
}

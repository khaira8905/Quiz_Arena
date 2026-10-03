"use client";

import type { MediaAssetDto } from "@quizarena/shared/media";
import { Check, Search } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/media-upload";
import { useMedia } from "@/lib/queries";

/** Choose an image already in the media library (reuse instead of re-uploading). */
export function MediaPickerDialog({
  open,
  onOpenChange,
  selectedId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: string | null;
  onPick: (asset: MediaAssetDto) => void;
}) {
  const [q, setQ] = useState("");
  const { data, isPending } = useMedia({ q: q.trim() }, open);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Media library"
      description="Pick an image you've already uploaded."
      size="lg"
    >
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
        <Input
          aria-label="Search images"
          placeholder="Search by name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="mt-4 max-h-[55dvh] overflow-y-auto">
        {isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3]" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="py-10 text-center text-body-sm text-fg-3">
            {q ? "No images match that name." : "Your library is empty. Upload an image first."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(a);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "group block w-full overflow-hidden rounded-md border text-left transition-colors",
                    a.id === selectedId
                      ? "border-accent ring-2 ring-accent"
                      : "border-line hover:border-fg-3",
                  )}
                >
                  <span className="relative block aspect-[4/3] bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails */}
                    <img
                      src={a.variants["480"] ?? a.url}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {a.id === selectedId && (
                      <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-ink">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </span>
                  <span className="block truncate px-2 pt-1.5 text-body-sm font-medium">
                    {a.name}
                  </span>
                  <span className="block px-2 pb-1.5 text-caption text-fg-3">
                    {a.width}×{a.height} · {formatBytes(a.bytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

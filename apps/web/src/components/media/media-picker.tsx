"use client";

import type { MediaAssetDto } from "@quizarena/shared/media";
import { Check, Film, Search } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/media-upload";
import { useMedia } from "@/lib/queries";
import { formatDuration } from "@/lib/video-upload";

/** Choose an image (or video) already in the media library, instead of re-uploading. */
export function MediaPickerDialog({
  open,
  onOpenChange,
  selectedId,
  onPick,
  kind = "image",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: string | null;
  onPick: (asset: MediaAssetDto) => void;
  kind?: "image" | "video";
}) {
  const [q, setQ] = useState("");
  const { data, isPending } = useMedia({ q: q.trim(), kind }, open);
  const noun = kind === "video" ? "video" : "image";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Media library"
      description={`Pick ${kind === "video" ? "a video" : "an image"} you've already uploaded.`}
      size="lg"
    >
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
        <Input
          aria-label={`Search ${noun}s`}
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
            {q
              ? `No ${noun}s match that name.`
              : `No ${noun}s in your library yet. Upload one first.`}
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
                    <AssetThumb asset={a} />
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
                    {a.kind === "VIDEO" ? `${formatDuration(a.durationMs)} · ` : ""}
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

/** A library tile's picture: the image, or a video's poster with a play badge and length. */
export function AssetThumb({ asset, className }: { asset: MediaAssetDto; className?: string }) {
  const src =
    asset.kind === "VIDEO"
      ? (asset.variants["480"] ?? asset.posterUrl)
      : (asset.variants["480"] ?? asset.url);
  return (
    <>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- library thumbnails
        <img
          src={src}
          alt=""
          loading="lazy"
          className={cn("absolute inset-0 h-full w-full object-cover", className)}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-fg-3">
          <Film className="h-8 w-8" aria-hidden />
        </span>
      )}
      {asset.kind === "VIDEO" && (
        <span className="numeric absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-sm bg-black/75 px-1.5 py-0.5 text-caption font-semibold text-white">
          <Film className="h-3 w-3" aria-hidden />
          {formatDuration(asset.durationMs)}
        </span>
      )}
    </>
  );
}

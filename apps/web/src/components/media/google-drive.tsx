"use client";

import type { MediaAssetDto } from "@quizarena/shared/media";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { api, isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/media-upload";
import { invalidateMedia } from "@/lib/queries";

interface DriveStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  width: number | null;
  height: number | null;
}

export function useGoogleStatus(enabled = true) {
  return useQuery({
    queryKey: ["google-status"],
    queryFn: () => api<DriveStatus>("/google/status"),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Opens Google's consent screen in a popup (the editor stays put) and resolves when the
 * server reports back. Real OAuth: the browser never sees a Google token.
 */
export function connectGoogle(): Promise<boolean> {
  return new Promise((resolve) => {
    const w = 520;
    const h = 640;
    const popup = window.open(
      "/api/google/connect",
      "qa-google",
      `width=${w},height=${h},left=${Math.round(screenX + (outerWidth - w) / 2)},top=${Math.round(screenY + (outerHeight - h) / 2)}`,
    );
    if (!popup) {
      // Pop-ups blocked: do the same flow in this tab; the server returns to the library.
      // An API redirect (to Google), not a Next.js page, so the router doesn't apply.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/google/connect";
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== popup) return;
      const data = e.data as { type?: string; ok?: boolean; message?: string } | null;
      if (data?.type !== "qa:google") return;
      cleanup();
      if (!data.ok) toast.error(data.message ?? "Couldn't connect Google Drive.");
      resolve(!!data.ok);
    };
    const closed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve(false);
      }
    }, 500);
    const cleanup = () => {
      clearInterval(closed);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
  });
}

/** "Google Drive" source button: connects on first use, then opens the Drive picker. */
export function DriveImageButton({
  onPick,
  size = "sm",
}: {
  onPick: (asset: MediaAssetDto) => void;
  size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const status = useGoogleStatus();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  if (status.data && !status.data.configured) return null;

  const start = async () => {
    if (status.data?.connected) return setOpen(true);
    setConnecting(true);
    const ok = await connectGoogle();
    setConnecting(false);
    await qc.invalidateQueries({ queryKey: ["google-status"] });
    if (ok) {
      toast.success("Google Drive connected");
      setOpen(true);
    }
  };

  return (
    <>
      <Button size={size} variant="secondary" onClick={() => void start()} loading={connecting}>
        <DriveMark /> Google Drive
      </Button>
      {open && (
        <DrivePickerDialog
          email={status.data?.email ?? null}
          onClose={() => setOpen(false)}
          onPick={(a) => {
            onPick(a);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function DrivePickerDialog({
  email,
  onClose,
  onPick,
}: {
  email: string | null;
  onClose: () => void;
  onPick: (asset: MediaAssetDto) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const files = useInfiniteQuery({
    queryKey: ["google-files", debounced],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      if (pageParam) params.set("pageToken", pageParam);
      return api<{ files: DriveFile[]; nextPageToken: string | null }>(`/google/files?${params}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    retry: false,
  });

  useEffect(() => {
    const err = files.error;
    if (isApiError(err) && err.code === "GOOGLE_NOT_CONNECTED") {
      toast.error(err.message);
      void qc.invalidateQueries({ queryKey: ["google-status"] });
      onClose();
    }
  }, [files.error, qc, onClose]);

  const choose = async (f: DriveFile) => {
    setImporting(f.id);
    try {
      const { asset } = await api<{ asset: MediaAssetDto }>("/google/import", {
        method: "POST",
        json: { fileId: f.id },
      });
      void invalidateMedia(qc);
      onPick(asset);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't import that image.");
    } finally {
      setImporting(null);
    }
  };

  const list = files.data?.pages.flatMap((p) => p.files) ?? [];

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Google Drive"
      description={
        email
          ? `Images in ${email}'s Drive. Picking one copies it into your media library.`
          : "Picking an image copies it into your media library."
      }
      size="lg"
    >
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
        <Input
          aria-label="Search Drive"
          placeholder="Search your Drive images"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="mt-4 max-h-[55dvh] overflow-y-auto">
        {files.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3]" />
            ))}
          </div>
        ) : files.isError ? (
          <p className="py-10 text-center text-body-sm text-danger">
            {isApiError(files.error) ? files.error.message : "Couldn't load your Drive."}
          </p>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-body-sm text-fg-3">
            {debounced ? "No images match that name." : "No PNG, JPG or WEBP images in this Drive."}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {list.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={importing !== null}
                    onClick={() => void choose(f)}
                    className={cn(
                      "group relative block w-full overflow-hidden rounded-md border border-line text-left transition-colors hover:border-fg-3 disabled:opacity-60",
                      importing === f.id && "border-accent",
                    )}
                  >
                    <span className="relative block aspect-[4/3] bg-sunken">
                      {/* eslint-disable-next-line @next/next/no-img-element -- proxied Drive thumbnail */}
                      <img
                        src={`/api/google/thumbnail/${encodeURIComponent(f.id)}`}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                      />
                      {importing === f.id && (
                        <span className="absolute inset-0 grid place-items-center bg-black/50">
                          <Spinner className="h-6 w-6 text-white" />
                        </span>
                      )}
                    </span>
                    <span className="block truncate px-2 pt-1.5 text-body-sm font-medium">
                      {f.name}
                    </span>
                    <span className="block px-2 pb-1.5 text-caption text-fg-3">
                      {f.width && f.height
                        ? `${f.width}×${f.height}`
                        : f.mimeType.replace("image/", "").toUpperCase()}
                      {f.size ? ` · ${formatBytes(f.size)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {files.hasNextPage && (
              <div className="mt-4 text-center">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={files.isFetchingNextPage}
                  onClick={() => void files.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Generic "drive" glyph (not Google's logo). */
function DriveMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 3h8l6 11-4 7H6l-4-7z" />
      <path d="M8 3l6 11H2M16 3l-6 11 4 7" />
    </svg>
  );
}

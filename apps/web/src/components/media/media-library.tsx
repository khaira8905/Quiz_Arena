"use client";

import { MEDIA_ACCEPT, MEDIA_ACCEPT_LABEL, type MediaAssetDto } from "@quizarena/shared/media";
import { Check, Copy, ImageIcon, Pencil, Search, Trash2, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/media-upload";
import { useDeleteMedia, useMedia, useMediaConfig, useRenameMedia } from "@/lib/queries";
import { DriveImageButton } from "./google-drive";
import { useImageUpload } from "./image-field";
import { QuestionImage } from "./question-image";

/**
 * MEDIA LIBRARY: every image the organiser has uploaded, with size, dimensions, date and
 * where it's used. Upload, preview, rename, delete, and reuse from the question editor.
 */
export function MediaLibrary() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "size">("recent");
  const [unused, setUnused] = useState(false);
  const { data, isPending, isError, refetch } = useMedia({ q: q.trim(), sort, unused });
  const { data: config } = useMediaConfig();
  const { upload, state, cancel } = useImageUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MediaAssetDto | null>(null);
  const [dragging, setDragging] = useState(false);

  // Back from a full-page Google sign-in (when the popup was blocked).
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google");
    if (!result) return;
    if (result === "connected") toast.success("Google Drive connected");
    else toast.error("Couldn't connect Google Drive");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const uploadAll = async (files: FileList | null) => {
    if (!files?.length) return;
    if (config && !config.enabled) return void toast.error(config.reason ?? "Uploads are off.");
    let done = 0;
    for (const f of Array.from(files)) if (await upload(f)) done++;
    if (done) toast.success(done === 1 ? "Image uploaded" : `${done} images uploaded`);
  };

  const totalBytes = data?.reduce((n, a) => n + a.bytes, 0) ?? 0;

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void uploadAll(e.dataTransfer.files);
      }}
      className={cn(
        "relative",
        dragging && "rounded-lg ring-2 ring-accent ring-offset-4 ring-offset-bg",
      )}
    >
      <PageHeader
        eyebrow="Library"
        title="Media"
        description="Images for your questions. Upload once, reuse in any quiz."
        actions={
          <>
            {config?.googleDrive && (
              <DriveImageButton
                onPick={(a) => {
                  toast.success(`“${a.name}” added from Google Drive`);
                  setPreview(a);
                }}
              />
            )}
            <Button
              notch
              onClick={() => fileInput.current?.click()}
              disabled={config ? !config.enabled : false}
            >
              <Upload className="h-4 w-4" /> Upload images
            </Button>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={MEDIA_ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void uploadAll(e.target.files);
          e.target.value = "";
        }}
      />

      {config && !config.enabled && (
        <p className="mt-6 border border-warning/40 bg-warning-soft px-4 py-3 text-body-sm text-warning">
          {config.reason}
        </p>
      )}

      {state && (
        <div className="mt-6 flex items-center gap-3 border border-line bg-surface p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={state.preview} alt="" className="h-10 w-14 rounded-sm object-cover" />
          <span className="min-w-0 flex-1 truncate text-body-sm">{state.name}</span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full origin-left bg-accent"
              animate={{ scaleX: state.phase === "preparing" ? 0.04 : state.progress }}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <Input
            aria-label="Search images"
            placeholder="Search by name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="w-44"
        >
          <option value="recent">Newest first</option>
          <option value="name">Name</option>
          <option value="size">Largest first</option>
        </Select>
        <label className="flex items-center gap-2 text-body-sm text-fg-2">
          <input
            type="checkbox"
            checked={unused}
            onChange={(e) => setUnused(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Unused only
        </label>
        {data && (
          <span className="ml-auto text-body-sm text-fg-3">
            {data.length} {data.length === 1 ? "image" : "images"} · {formatBytes(totalBytes)}
          </span>
        )}
      </div>

      <div className="mt-6">
        {isError ? (
          <EmptyState
            title="Couldn't load your images"
            description="The server didn't respond."
            action={<Button onClick={() => refetch()}>Retry</Button>}
          />
        ) : isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3]" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="h-6 w-6" />}
            title={q || unused ? "No images match" : "No images yet"}
            description={
              q || unused
                ? "Try another name or filter."
                : `Upload ${MEDIA_ACCEPT_LABEL} images, or drop them anywhere on this page.`
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {data.map((a, i) => (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.025 }}
              >
                <button
                  type="button"
                  onClick={() => setPreview(a)}
                  className="group block w-full overflow-hidden rounded-md border border-line bg-surface text-left transition-colors hover:border-fg-3"
                >
                  <span className="relative block aspect-[4/3] overflow-hidden bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnail */}
                    <img
                      src={a.variants["480"] ?? a.url}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <span
                      className={cn(
                        "label absolute left-2 top-2 rounded-sm px-1.5 py-0.5",
                        a.usageCount ? "bg-accent text-accent-ink" : "bg-elevated/90 text-fg-3",
                      )}
                    >
                      {a.usageCount ? `Used ×${a.usageCount}` : "Unused"}
                    </span>
                  </span>
                  <span className="block truncate px-3 pt-2 text-body-sm font-medium">
                    {a.name}
                  </span>
                  <span className="block px-3 pb-2.5 text-caption text-fg-3">
                    {a.width}×{a.height} · {formatBytes(a.bytes)}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      {preview && (
        <AssetDialog
          // Keep the dialog showing fresh data after a rename.
          asset={data?.find((a) => a.id === preview.id) ?? preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function AssetDialog({ asset, onClose }: { asset: MediaAssetDto; onClose: () => void }) {
  const rename = useRenameMedia();
  const del = useDeleteMedia();
  const [name, setName] = useState(asset.name);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    const v = name.trim();
    if (!v || v === asset.name) return setEditing(false);
    try {
      await rename.mutateAsync({ id: asset.id, name: v });
      setEditing(false);
      toast.success("Renamed");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't rename");
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title={asset.name} size="lg">
        <QuestionImage
          src={asset.url}
          placeholder={asset.placeholder}
          className="mt-4 aspect-[16/10] w-full"
          alt={asset.name}
        />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-body-sm sm:grid-cols-4">
          <Meta label="Dimensions" value={`${asset.width} × ${asset.height}`} />
          <Meta label="Stored size" value={formatBytes(asset.bytes)} />
          <Meta label="Added" value={formatDateTime(asset.createdAt)} />
          <Meta
            label="Used in"
            value={
              asset.usageCount
                ? `${asset.usageCount} question${asset.usageCount === 1 ? "" : "s"}`
                : "Not used yet"
            }
          />
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {editing ? (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Input
                autoFocus
                aria-label="Image name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
              />
              <Button type="submit" size="sm" loading={rename.isPending}>
                <Check className="h-4 w-4" /> Save
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Rename
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigator.clipboard
                .writeText(new URL(asset.url, location.origin).toString())
                .then(() => toast.success("Image link copied"))
            }
          >
            <Copy className="h-4 w-4" /> Copy link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-danger hover:text-danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${asset.name}”?`}
        description={
          asset.usageCount
            ? `It's used by ${asset.usageCount} question${asset.usageCount === 1 ? "" : "s"}; they'll lose the image. This can't be undone.`
            : "The image is removed from storage. This can't be undone."
        }
        confirmLabel="Delete image"
        onConfirm={async () => {
          try {
            await del.mutateAsync({ id: asset.id, force: asset.usageCount > 0 });
            toast.success("Image deleted");
            onClose();
          } catch (err) {
            toast.error(isApiError(err) ? err.message : "Couldn't delete");
          }
        }}
      />
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label text-fg-3">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

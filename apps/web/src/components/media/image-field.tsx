"use client";

import {
  IMAGE_FITS,
  IMAGE_POSITIONS,
  MEDIA_ACCEPT,
  MEDIA_ACCEPT_LABEL,
  type ImageFit,
  type ImagePosition,
  type MediaAssetDto,
} from "@quizarena/shared/media";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen, ImageIcon, Link2, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/switch";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { checkImageFile, prepareImage, uploadImage } from "@/lib/media-upload";
import { invalidateMedia, useMediaConfig } from "@/lib/queries";
import { MediaPickerDialog } from "./media-picker";
import { QuestionImage } from "./question-image";
import { Tilt } from "@/components/motion/tilt";

export interface ImageValue {
  url: string | null;
  assetId: string | null;
  fit: ImageFit;
  position: ImagePosition;
  placeholder?: string | null;
}

export type ImagePatch =
  | { imageAssetId: string; imageUrl: string }
  | { imageUrl: string | null; imageAssetId: null }
  | { imageFit: ImageFit }
  | { imagePosition: ImagePosition };

interface UploadState {
  name: string;
  preview: string;
  progress: number;
  phase: "preparing" | "uploading";
  cancel?: () => void;
}

/**
 * Validates, shrinks and uploads one image, reporting progress. Shared by the question
 * editor and the media library page.
 */
export function useImageUpload() {
  const qc = useQueryClient();
  const [state, setState] = useState<UploadState | null>(null);
  const cancelled = useRef(false);

  // The local preview URL is released once the upload ends.
  const preview = state?.preview;
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const upload = useCallback(
    async (file: File): Promise<MediaAssetDto | null> => {
      const problem = checkImageFile(file);
      if (problem) {
        toast.error(problem);
        return null;
      }
      cancelled.current = false;
      const preview = URL.createObjectURL(file);
      setState({ name: file.name, preview, progress: 0, phase: "preparing" });
      try {
        const blob = await prepareImage(file);
        if (cancelled.current) return null;
        const handle = uploadImage(blob, file.name, (progress) =>
          setState((s) => (s ? { ...s, progress } : s)),
        );
        setState((s) => (s ? { ...s, phase: "uploading", cancel: handle.cancel } : s));
        const asset = await handle.promise;
        void invalidateMedia(qc);
        return asset;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return null;
        toast.error(isApiError(err) ? err.message : (err as Error).message);
        return null;
      } finally {
        setState(null);
      }
    },
    [qc],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    state?.cancel?.();
    setState(null);
  }, [state]);

  return { upload, state, cancel };
}

/**
 * ADD IMAGE for a question: upload from the device (or drop a file), reuse one from the
 * media library, paste a link, or (when connected) pick from Google Drive. Once set, the
 * organiser frames it — Fit and Position — in a preview with the projector's proportions.
 */
export function ImageField({
  value,
  onChange,
  drive,
}: {
  value: ImageValue;
  onChange: (patch: ImagePatch) => void;
  /** The Google Drive picker button, when Drive is set up. */
  drive?: (pick: (asset: MediaAssetDto) => void) => React.ReactNode;
}) {
  const { data: config } = useMediaConfig();
  const { upload, state, cancel } = useImageUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [library, setLibrary] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);

  const uploadsOn = config?.enabled ?? true;
  const pickAsset = (a: MediaAssetDto) => {
    onChange({ imageAssetId: a.id, imageUrl: a.url });
    setMenu(false);
  };
  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!uploadsOn) return void toast.error(config?.reason ?? "Uploads are off.");
    // The source menu stays open if the file is refused, so another can be picked.
    const asset = await upload(file);
    if (asset) pickAsset(asset);
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void onFiles(e.dataTransfer.files);
    },
  };

  const sources = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => fileInput.current?.click()}
        disabled={!uploadsOn}
        title={uploadsOn ? undefined : (config?.reason ?? undefined)}
      >
        <Upload className="h-4 w-4" /> Upload from device
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setLibrary(true)}>
        <FolderOpen className="h-4 w-4" /> Media library
      </Button>
      {config?.googleDrive && drive?.(pickAsset)}
      <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>
        <Link2 className="h-4 w-4" /> Paste a link
      </Button>
      {value.url && (
        <Button size="sm" variant="ghost" onClick={() => setMenu(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept={MEDIA_ACCEPT.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const linkForm = linking && (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = link.trim();
        if (v && !/^https:\/\//i.test(v)) return void toast.error("Use an https:// image link");
        onChange({ imageUrl: v || null, imageAssetId: null });
        setLinking(false);
        setMenu(false);
        setLink("");
      }}
    >
      <Input
        autoFocus
        aria-label="Image link"
        placeholder="https://…/diagram.png"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        className="h-9"
      />
      <Button type="submit" size="sm">
        Use link
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setLinking(false)}>
        Cancel
      </Button>
    </form>
  );

  const dialogs = (
    <MediaPickerDialog
      open={library}
      onOpenChange={setLibrary}
      selectedId={value.assetId}
      onPick={pickAsset}
    />
  );

  /* ---------------------------------------------------------------- uploading */
  if (state) {
    return (
      <div className="mt-5 rounded-md border border-line bg-sunken p-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={state.preview} alt="" className="h-14 w-20 rounded-sm object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-body-sm font-medium">{state.name}</span>
              <span className="numeric text-caption text-fg-3">
                {state.phase === "preparing"
                  ? "Optimizing…"
                  : `${Math.round(state.progress * 100)}%`}
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="Upload progress"
              aria-valuenow={Math.round(state.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <motion.div
                className="h-full origin-left bg-accent"
                animate={{ scaleX: state.phase === "preparing" ? 0.04 : state.progress }}
                transition={{ duration: 0.2 }}
              />
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- empty */
  if (!value.url) {
    return (
      <div
        {...dropProps}
        className={cn(
          "mt-5 rounded-md border border-dashed p-4 transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line",
        )}
      >
        {input}
        {menu ? (
          sources
        ) : (
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex w-full items-center justify-center gap-2 py-1 text-body-sm text-fg-3 hover:text-fg"
          >
            <ImageIcon className="h-4 w-4" /> Add image (optional) · or drop one here
          </button>
        )}
        {linkForm}
        {menu && (
          <p className="mt-2 text-caption text-fg-3">
            {uploadsOn
              ? `${MEDIA_ACCEPT_LABEL}, up to 8 MB. Large photos are resized automatically.`
              : config?.reason}
          </p>
        )}
        {dialogs}
      </div>
    );
  }

  /* ---------------------------------------------------------------- set: preview + framing */
  return (
    <div {...dropProps} className={cn("mt-5", dragging && "rounded-md ring-2 ring-accent")}>
      {input}
      <div className="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          {/* Clicking the picture opens the replace options. */}
          <Tilt max={3} glare={false} className="rounded-lg">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              data-cursor="media"
              data-cursor-label="Edit"
              aria-label="Replace image"
              className="block w-full rounded-lg"
            >
              <QuestionImage
                src={value.url}
                fit={value.fit}
                position={value.position}
                placeholder={value.placeholder}
                alt="Question image"
                className="aspect-[2/1] w-full"
              />
            </button>
          </Tilt>
          <p className="mt-1.5 text-caption text-fg-3">
            Preview in the projector&apos;s image frame.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5 text-body-sm font-medium text-fg-2">Fit</div>
            <Segmented
              label="Image fit"
              value={value.fit}
              options={IMAGE_FITS.map((f) => ({
                value: f,
                label: f === "CONTAIN" ? "Whole image" : "Fill frame",
              }))}
              onChange={(imageFit) => onChange({ imageFit })}
            />
          </div>
          <div>
            <div className="mb-1.5 text-body-sm font-medium text-fg-2">Position</div>
            <Segmented
              label="Image position"
              value={value.position}
              options={IMAGE_POSITIONS.map((p) => ({
                value: p,
                label: p === "CENTER" ? "Center" : p === "TOP" ? "Top" : "Bottom",
              }))}
              onChange={(imagePosition) => onChange({ imagePosition })}
            />
            {value.fit === "CONTAIN" && (
              <p className="mt-1 text-caption text-fg-3">
                Position matters when filling the frame.
              </p>
            )}
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setMenu((m) => !m)}>
              Replace
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ imageUrl: null, imageAssetId: null })}
              className="hover:text-danger"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {menu && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            {sources}
          </motion.div>
        )}
      </AnimatePresence>
      {linkForm}
      {dialogs}
    </div>
  );
}

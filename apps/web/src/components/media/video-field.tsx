"use client";

import {
  type MediaAssetDto,
  type QuestionVideo,
  VIDEO_ACCEPT,
  VIDEO_ACCEPT_LABEL,
  VIDEO_MAX_BYTES,
} from "@quizarena/shared/media";
import { useQueryClient } from "@tanstack/react-query";
import { Film, FolderOpen, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/media-upload";
import { invalidateMedia, useMediaConfig } from "@/lib/queries";
import { formatDuration, uploadVideo, type VideoUploadPhase } from "@/lib/video-upload";
import { MediaPickerDialog } from "./media-picker";

interface VideoUploadState {
  name: string;
  bytes: number;
  phase: VideoUploadPhase;
  progress: number;
  cancel: () => void;
}

const PHASE_LABEL: Record<VideoUploadPhase, string> = {
  checking: "Checking the video…",
  uploading: "Uploading",
  processing: "Processing: checking the file and saving a poster frame…",
  done: "Done",
};

/** Probes, uploads and records one video with live progress. Shared by editor and library. */
export function useVideoUpload() {
  const qc = useQueryClient();
  const [state, setState] = useState<VideoUploadState | null>(null);

  const upload = useCallback(
    async (file: File): Promise<MediaAssetDto | null> => {
      const handle = uploadVideo(file, {
        progress: (progress) => setState((s) => (s ? { ...s, progress } : s)),
        phase: (phase) => setState((s) => (s ? { ...s, phase } : s)),
      });
      setState({
        name: file.name,
        bytes: file.size,
        phase: "checking",
        progress: 0,
        cancel: handle.cancel,
      });
      try {
        const asset = await handle.promise;
        void invalidateMedia(qc);
        toast.success(`“${asset.name}” is in your library`);
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

  return { upload, state, cancel: () => state?.cancel() };
}

/** The upload's live status: phase, a progress bar during the transfer, and cancel. */
export function VideoUploadProgress({ state }: { state: VideoUploadState }) {
  const pct = Math.round(state.progress * 100);
  const indeterminate = state.phase !== "uploading";
  return (
    <div className="rounded-md border border-line bg-sunken p-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-20 shrink-0 place-items-center rounded-sm bg-elevated text-fg-3">
          <Film className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-body-sm font-medium">{state.name}</span>
            <span className="numeric shrink-0 text-caption text-fg-3">
              {state.phase === "uploading"
                ? `${pct}% of ${formatBytes(state.bytes)}`
                : formatBytes(state.bytes)}
            </span>
          </div>
          <div
            className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Video upload"
            aria-valuetext={PHASE_LABEL[state.phase]}
            aria-valuenow={indeterminate ? undefined : pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {indeterminate ? (
              <motion.div
                className="absolute inset-y-0 w-1/3 rounded-full bg-accent"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <motion.div
                className="h-full origin-left bg-accent"
                animate={{ scaleX: state.progress }}
                transition={{ duration: 0.2 }}
              />
            )}
          </div>
          <p className="mt-1.5 text-caption text-fg-3">{PHASE_LABEL[state.phase]}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={state.cancel}
          disabled={state.phase === "processing"}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * A question's video: upload (MP4 or WebM), reuse one from the library, or import from
 * Google Drive. Once set, it previews with the projector's proportions; the stage plays it
 * muted and the host can replay or unmute it during the game.
 */
export function VideoField({
  value,
  onPick,
  onRemove,
  drive,
}: {
  value: { assetId: string | null; video: QuestionVideo | null };
  onPick: (asset: MediaAssetDto) => void;
  onRemove: () => void;
  drive?: (pick: (asset: MediaAssetDto) => void) => React.ReactNode;
}) {
  const { data: config } = useMediaConfig();
  const { upload, state } = useVideoUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadsOn = config?.enabled ?? true;

  const pick = (a: MediaAssetDto) => {
    onPick(a);
    setMenu(false);
  };
  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!uploadsOn) return void toast.error(config?.reason ?? "Uploads are off.");
    const asset = await upload(file);
    if (asset) pick(asset);
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

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept={VIDEO_ACCEPT.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );
  const sources = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => fileInput.current?.click()}
        disabled={!uploadsOn}
        title={uploadsOn ? undefined : (config?.reason ?? undefined)}
      >
        <Upload className="h-4 w-4" /> Upload video
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setLibrary(true)}>
        <FolderOpen className="h-4 w-4" /> Media library
      </Button>
      {config?.googleDrive && drive?.(pick)}
      {value.video && (
        <Button size="sm" variant="ghost" onClick={() => setMenu(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
  const dialogs = (
    <MediaPickerDialog
      kind="video"
      open={library}
      onOpenChange={setLibrary}
      selectedId={value.assetId}
      onPick={pick}
    />
  );

  if (state) return <VideoUploadProgress state={state} />;

  if (!value.video) {
    return (
      <div
        {...dropProps}
        className={cn(
          "rounded-md border border-dashed p-4 transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line",
        )}
      >
        {input}
        {sources}
        <p className="mt-2 text-caption text-fg-3">
          {uploadsOn
            ? `${VIDEO_ACCEPT_LABEL}, up to ${formatBytes(config?.videoMaxBytes ?? VIDEO_MAX_BYTES)} and 5 minutes. Or drop one here. It plays muted on the big screen; phones show a still.`
            : config?.reason}
        </p>
        {dialogs}
      </div>
    );
  }

  return (
    <div {...dropProps} className={cn(dragging && "rounded-md ring-2 ring-accent")}>
      {input}
      <div className="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
            <video
              key={value.video.url}
              src={value.video.url}
              poster={value.video.posterUrl ?? undefined}
              controls
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-contain"
              aria-label="Question video preview"
            />
          </div>
          <p className="mt-1.5 text-caption text-fg-3">
            {formatDuration(value.video.durationMs)} · Plays muted on the projector; you can replay
            it or turn the sound on from the control room.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMenu((m) => !m)}>
            Replace video
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="hover:text-danger">
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
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
      {dialogs}
    </div>
  );
}

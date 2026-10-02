const nf = new Intl.NumberFormat("en-US");

export const formatNumber = (n: number) => nf.format(n);

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** 00:15 style clock from milliseconds, rounding up so "1" shows until the true zero. */
export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

export function formatSeconds(ms: number | null) {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Public join URL shown on the projector and encoded in the QR code. */
export function joinUrl(code: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/play?game=${code}`;
}

export function displayHost(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
}

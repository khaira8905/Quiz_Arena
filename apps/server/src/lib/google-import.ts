import { IMPORT_MAX_BYTES } from "@quizarena/shared";
import { AppError } from "./errors";

/**
 * Fetches a spreadsheet an organiser shared from Google Sheets or Google Drive.
 *
 * Only the file id is taken from the user's link; the URL that is actually fetched is built
 * here, on Google's own hosts, and every redirect hop is checked against the same allowlist,
 * so the endpoint can't be pointed at internal addresses (SSRF). Size and time are capped.
 * No Google credentials are involved: the file must be shared as "Anyone with the link".
 */

const ID = "[A-Za-z0-9_-]{10,}";

export type GoogleSource = { kind: "sheet"; url: string } | { kind: "drive-file"; url: string };

export function googleExportUrl(link: string): GoogleSource {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    throw new AppError("BAD_REQUEST", "That doesn't look like a link. Paste the share link.");
  }
  if (u.protocol !== "https:") throw new AppError("BAD_REQUEST", "Use an https:// share link.");

  if (u.hostname === "docs.google.com") {
    const sheet = u.pathname.match(new RegExp(`^/spreadsheets/d/(${ID})`));
    if (sheet) {
      const gid = (u.hash.match(/gid=(\d+)/) ?? u.search.match(/gid=(\d+)/))?.[1];
      return {
        kind: "sheet",
        url: `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`,
      };
    }
    if (/^\/(document|presentation|forms)\//.test(u.pathname)) {
      throw new AppError(
        "BAD_REQUEST",
        "Google Docs, Slides and Forms can't be imported. Use a Google Sheet or a CSV/Excel file.",
      );
    }
  }
  if (u.hostname === "drive.google.com") {
    const id =
      u.pathname.match(new RegExp(`^/file/d/(${ID})`))?.[1] ??
      (new RegExp(`^${ID}$`).test(u.searchParams.get("id") ?? "")
        ? u.searchParams.get("id")!
        : undefined);
    if (id)
      return { kind: "drive-file", url: `https://drive.google.com/uc?export=download&id=${id}` };
  }
  throw new AppError(
    "BAD_REQUEST",
    "Paste a Google Sheets link or a Google Drive file link (Share → Copy link).",
  );
}

const ALLOWED_HOSTS = ["docs.google.com", "drive.google.com", "drive.usercontent.google.com"];
const isAllowedHost = (host: string) =>
  ALLOWED_HOSTS.includes(host) || host.endsWith(".googleusercontent.com");

export interface FetchedFile {
  kind: "csv" | "xlsx";
  body: Buffer;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchGoogleFile(
  link: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedFile> {
  const source = googleExportUrl(link);
  let url = source.url;
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    const host = new URL(url).hostname;
    if (!isAllowedHost(host))
      throw new AppError("BAD_REQUEST", "That link redirects outside Google.");
    res = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "QuizArena question import" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    break;
  }
  if (!res || res.status >= 300) {
    throw new AppError(
      "BAD_REQUEST",
      res && (res.status === 401 || res.status === 403 || res.status === 404)
        ? "Google wouldn't share that file. Set it to “Anyone with the link can view” and try again."
        : "Couldn't download that file from Google. Try again in a moment.",
    );
  }

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > IMPORT_MAX_BYTES) throw tooBig();
  const body = await readCapped(res);

  // A login or "can't scan for viruses" page means the file isn't publicly shared.
  const type = res.headers.get("content-type") ?? "";
  const isZip = body.length > 3 && body[0] === 0x50 && body[1] === 0x4b;
  if (isZip) return { kind: "xlsx", body };
  if (
    type.includes("text/html") ||
    /^\s*<(!doctype|html)/i.test(body.subarray(0, 200).toString())
  ) {
    throw new AppError(
      "BAD_REQUEST",
      "That file isn't shared publicly. In Google, choose Share → General access → “Anyone with the link”.",
    );
  }
  return { kind: "csv", body };
}

const tooBig = () =>
  new AppError("BAD_REQUEST", `That file is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`);

async function readCapped(res: Response): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > IMPORT_MAX_BYTES) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

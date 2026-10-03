import type { ErrorCode } from "@quizarena/shared/errors";
import {
  IMPORT_MAX_BYTES,
  type ImportResult,
  parseCsv,
  questionsFromRows,
} from "@quizarena/shared/import";
import { ApiError } from "./api";

/**
 * Turns a spreadsheet (picked from the laptop, or downloaded from Google by the server) into
 * an import preview. Everything is parsed in the browser: the file itself is never stored.
 */

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

export async function readQuestionFile(file: Blob, name = ""): Promise<ImportResult> {
  if (file.size > IMPORT_MAX_BYTES)
    throw new Error(`That file is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`);
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (isZip(head) || /\.xlsx$/i.test(name)) {
    if (/\.xls$/i.test(name))
      throw new Error("Old .xls files aren't supported. Save it as .xlsx or CSV and try again.");
    // Loaded on demand: most hosts never import, so the Excel reader stays out of the bundle.
    const { readSheet } = await import("read-excel-file/browser");
    try {
      return questionsFromRows(await readSheet(file));
    } catch {
      throw new Error("Couldn't read that Excel file. Try saving it again as .xlsx or CSV.");
    }
  }
  if (/\.(xls|numbers|ods|pdf|docx?)$/i.test(name))
    throw new Error("Use a CSV or Excel (.xlsx) file. Google Sheets: File → Download → CSV.");
  return questionsFromRows(parseCsv(await file.text()));
}

/** Asks the server to fetch a shared Google Sheet / Drive file, then parses it here. */
export async function readGoogleLink(url: string): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch("/api/import/google", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new ApiError(0, "INTERNAL", "Can't reach the server. Check your connection.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: ErrorCode; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "INTERNAL",
      body?.error?.message ?? "Couldn't fetch that file from Google.",
    );
  }
  const kind = res.headers.get("x-import-kind");
  const blob = await res.blob();
  return readQuestionFile(blob, kind === "xlsx" ? "google.xlsx" : "google.csv");
}

/** The starter template, offered as a download in the import dialog. */
export function templateHref(csv: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

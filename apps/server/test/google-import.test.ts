import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors";
import { fetchGoogleFile, googleExportUrl } from "../src/lib/google-import";

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.message;
    throw e;
  }
  return null;
};

describe("google import links", () => {
  it("turns share links into export URLs on Google's hosts", () => {
    expect(
      googleExportUrl(
        "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=777",
      ),
    ).toEqual({
      kind: "sheet",
      url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=csv&gid=777",
    });
    expect(
      googleExportUrl("https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJ/view?usp=sharing").url,
    ).toBe("https://drive.google.com/uc?export=download&id=1ZyXwVuTsRqPoNmLkJ");
    expect(googleExportUrl("https://drive.google.com/open?id=1ZyXwVuTsRqPoNmLkJ").url).toBe(
      "https://drive.google.com/uc?export=download&id=1ZyXwVuTsRqPoNmLkJ",
    );
  });

  it("refuses anything that isn't a Google Sheet or Drive file", () => {
    expect(reason(() => googleExportUrl("http://169.254.169.254/latest/meta-data"))).toMatch(
      /https/,
    );
    expect(
      reason(() => googleExportUrl("https://evil.example/spreadsheets/d/1234567890ab")),
    ).toMatch(/Google Sheets link/);
    expect(
      reason(() => googleExportUrl("https://docs.google.com/document/d/1234567890ab/edit")),
    ).toMatch(/can't be imported/);
    expect(reason(() => googleExportUrl("not a url"))).toMatch(/doesn't look like a link/);
  });

  const respond = (
    status: number,
    body: string | Uint8Array,
    headers: Record<string, string> = {},
  ) => new Response(status >= 300 && status < 400 ? null : body, { status, headers });

  it("follows redirects only within Google and detects xlsx vs csv", async () => {
    const seen: string[] = [];
    const file = await fetchGoogleFile(
      "https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJ/view",
      async (url) => {
        seen.push(url);
        return seen.length === 1
          ? respond(303, "", { location: "https://drive.usercontent.google.com/download?id=1" })
          : respond(200, new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]));
      },
    );
    expect(file.kind).toBe("xlsx");
    expect(seen[1]).toContain("drive.usercontent.google.com");

    await expect(
      fetchGoogleFile("https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJ/view", async () =>
        respond(302, "", { location: "http://127.0.0.1:4000/admin" }),
      ),
    ).rejects.toThrow(/outside Google/);
  });

  it("explains private files instead of importing a login page", async () => {
    await expect(
      fetchGoogleFile(
        "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
        async () =>
          respond(200, "<!DOCTYPE html><html>Sign in</html>", { "content-type": "text/html" }),
      ),
    ).rejects.toThrow(/isn't shared publicly/);
    const csv = await fetchGoogleFile(
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
      async () => respond(200, "Question,A,B\nx,1,2", { "content-type": "text/csv" }),
    );
    expect(csv.kind).toBe("csv");
    expect(csv.body.toString()).toContain("Question");
  });
});

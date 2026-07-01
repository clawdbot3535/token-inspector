// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { fetchLatestCommit, type GitRef } from "./git-import.js";

const ghRef: GitRef = { host: "github", owner: "o", repo: "token-export", branch: "main", dir: "tokens" };

afterEach(() => vi.unstubAllGlobals());

describe("fetchLatestCommit", () => {
  it("reads the latest commit from the GitHub commits API for the token path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/repos/o/token-export/commits");
        expect(url).toContain("sha=main");
        expect(url).toContain("path=tokens");
        return new Response(
          JSON.stringify([
            { sha: "a1b2c3d4567890", commit: { author: { date: "2026-06-29T10:00:00Z" }, message: "update tokens" } },
          ]),
        );
      }),
    );
    expect(await fetchLatestCommit(ghRef)).toEqual({
      sha: "a1b2c3d4567890",
      date: "2026-06-29T10:00:00Z",
      message: "update tokens",
    });
  });

  it("returns null gracefully on a failed fetch (rate-limit / network)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 403 })));
    expect(await fetchLatestCommit(ghRef)).toBeNull();
  });

  it("returns null gracefully on an unexpected shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ not: "an array" }))));
    expect(await fetchLatestCommit(ghRef)).toBeNull();
  });
});

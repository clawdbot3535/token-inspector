import { afterEach, describe, it, expect, vi } from "vitest";
import { parseGitUrl, fetchTokenFiles } from "./git-import.js";

describe("parseGitUrl", () => {
  it("parses a github repo root (default branch/dir)", () => {
    expect(parseGitUrl("https://github.com/acme/tokens")).toEqual({
      host: "github", owner: "acme", repo: "tokens", branch: "main", dir: "",
    });
  });
  it("parses a github tree URL with branch + nested dir", () => {
    expect(parseGitUrl("https://github.com/acme/tokens/tree/dev/design/out")).toEqual({
      host: "github", owner: "acme", repo: "tokens", branch: "dev", dir: "design/out",
    });
  });
  it("parses a gitlab repo root and a /-/tree URL", () => {
    expect(parseGitUrl("https://gitlab.com/acme/tokens")).toEqual({
      host: "gitlab", owner: "acme", repo: "tokens", branch: "main", dir: "",
    });
    expect(parseGitUrl("https://gitlab.com/acme/tokens/-/tree/dev/out")).toEqual({
      host: "gitlab", owner: "acme", repo: "tokens", branch: "dev", dir: "out",
    });
  });
  it("strips .git and a trailing slash", () => {
    expect(parseGitUrl("https://github.com/acme/tokens.git/")?.repo).toBe("tokens");
  });
  it("returns null for an unrecognised URL", () => {
    expect(parseGitUrl("https://example.com/foo")).toBeNull();
    expect(parseGitUrl("not a url")).toBeNull();
  });
});

describe("fetchTokenFiles", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("lists a github dir and fetches only the token files", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.github.com/")) {
        return new Response(JSON.stringify([
          { type: "file", name: "color.tokens.json", download_url: "https://raw/color" },
          { type: "file", name: "README.md", download_url: "https://raw/readme" },
        ]), { status: 200 });
      }
      if (url === "https://raw/color") return new Response('{"a":1}', { status: 200 });
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const files = await fetchTokenFiles({ host: "github", owner: "a", repo: "b", branch: "main", dir: "" });
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("color.tokens.json");
    expect(await files[0]!.text()).toBe('{"a":1}');
  });

  it("lists a gitlab dir and fetches the token files via the raw API", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/repository/tree")) {
        expect(url).toContain("per_page=100");
        return new Response(JSON.stringify([
          { type: "blob", name: "color.tokens.json", path: "out/color.tokens.json" },
          { type: "tree", name: "sub", path: "out/sub" },
        ]), { status: 200 });
      }
      if (url.includes("/repository/files/")) return new Response('{"g":2}', { status: 200 });
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const files = await fetchTokenFiles({ host: "gitlab", owner: "a", repo: "b", branch: "main", dir: "out" });
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("color.tokens.json");
    expect(await files[0]!.text()).toBe('{"g":2}');
  });

  it("throws when the listing is not OK (404 / rate-limited)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 404 })));
    await expect(fetchTokenFiles({ host: "github", owner: "a", repo: "b", branch: "main", dir: "" }))
      .rejects.toThrow();
  });

  it("throws when no *.tokens.json are present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify([{ type: "file", name: "README.md", download_url: "u" }]), { status: 200 })));
    await expect(fetchTokenFiles({ host: "github", owner: "a", repo: "b", branch: "main", dir: "" }))
      .rejects.toThrow(/No \*\.tokens\.json/);
  });
});

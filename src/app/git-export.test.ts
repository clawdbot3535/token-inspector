import { afterEach, describe, it, expect, vi } from "vitest";
import { commitFiles } from "./git-export.js";

const FILES = [
  { path: "out/app.config.ts", content: "export default {}" },
  { path: "out/tokens.css", content: ":root{}" },
];

afterEach(() => { vi.unstubAllGlobals(); });

describe("commitFiles — GitHub", () => {
  it("walks the Git Data API and returns the commit html_url", async () => {
    const bodies: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.endsWith("/git/ref/heads/main") && method === "GET")
        return new Response(JSON.stringify({ object: { sha: "base123" } }), { status: 200 });
      if (url.endsWith("/git/commits/base123") && method === "GET")
        return new Response(JSON.stringify({ tree: { sha: "tree123" } }), { status: 200 });
      if (url.endsWith("/git/blobs") && method === "POST")
        return new Response(JSON.stringify({ sha: "blob-" + (body as { content: string }).content.length }), { status: 201 });
      if (url.endsWith("/git/trees") && method === "POST") { bodies.tree = body; return new Response(JSON.stringify({ sha: "newtree" }), { status: 201 }); }
      if (url.endsWith("/git/commits") && method === "POST") { bodies.commit = body; return new Response(JSON.stringify({ sha: "commit999", html_url: "https://github.com/o/r/commit/commit999" }), { status: 201 }); }
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH") { bodies.patch = body; return new Response(JSON.stringify({}), { status: 200 }); }
      return new Response("unexpected " + method + " " + url, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await commitFiles({ host: "github", owner: "o", repo: "r", branch: "main", dir: "out" }, FILES, "tok", "msg");
    expect(res.commitUrl).toBe("https://github.com/o/r/commit/commit999");
    expect((bodies.tree as { base_tree: string; tree: unknown[] }).base_tree).toBe("tree123");
    expect((bodies.tree as { tree: unknown[] }).tree).toHaveLength(2);
    expect((bodies.commit as { parents: string[] }).parents).toEqual(["base123"]);
    expect((bodies.patch as { sha: string }).sha).toBe("commit999");
  });

  it("throws a clear, actionable error when the target repo is empty (409 on ref read)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/git/ref/heads/main")) return new Response("Git Repository is empty.", { status: 409 });
      return new Response("{}", { status: 200 });
    }));
    const err = await commitFiles({ host: "github", owner: "o", repo: "r", branch: "main", dir: "" }, FILES, "supersecret", "m").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/empty/i);
    expect((err as Error).message).not.toContain("supersecret");
  });

  it("rejects with a token-free message on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 401 })));
    const err = await commitFiles({ host: "github", owner: "o", repo: "r", branch: "main", dir: "" }, FILES, "supersecret", "m").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("supersecret");
  });
});

describe("commitFiles — GitLab", () => {
  it("detects create vs update per file and posts one commit", async () => {
    let commitBody: { actions: { action: string; file_path: string }[] } | undefined;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/repository/files/") && method === "GET")
        return new Response("{}", { status: url.includes("app.config.ts") ? 200 : 404 });
      if (url.endsWith("/repository/commits") && method === "POST") {
        commitBody = JSON.parse(String(init!.body));
        return new Response(JSON.stringify({ web_url: "https://gitlab.com/o/r/-/commit/abc" }), { status: 201 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await commitFiles({ host: "gitlab", owner: "o", repo: "r", branch: "main", dir: "out" }, FILES, "tok", "msg");
    expect(res.commitUrl).toBe("https://gitlab.com/o/r/-/commit/abc");
    expect(commitBody!.actions).toEqual([
      { action: "update", file_path: "out/app.config.ts", content: "export default {}" },
      { action: "create", file_path: "out/tokens.css", content: ":root{}" },
    ]);
  });

  it("rejects when the commit call is not OK", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/repository/files/")) return new Response("{}", { status: 404 });
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(commitFiles({ host: "gitlab", owner: "o", repo: "r", branch: "main", dir: "" }, FILES, "tok", "m")).rejects.toThrow();
  });
});

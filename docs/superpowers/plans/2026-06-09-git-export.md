# Git export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the generated `tokens.css` + `app.config.ts` to a GitHub/GitLab repo via the host API, using a user-supplied write PAT held only in `sessionStorage`.

**Architecture:** Task 1 adds `src/app/git-export.ts` (`commitFiles` — GitHub Git Data API atomic flow, GitLab Commits API). Task 2 wires a commit panel into `App.vue` (target URL + message + PAT, confirm step, result). Reuses `GitRef`/`parseGitUrl` from `git-import.ts` and the `defaultRenderers` output.

**Tech Stack:** TS + Vue 3 SFC, Vitest, vue-tsc. Browser `fetch`. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/git-export` (spec committed at `07055f5`).

**Spec:** `docs/superpowers/specs/2026-06-09-git-export-design.md`

**Reminders:**
- Git attribution disabled globally — NO trailer. Verify `git log -1 --format=%B`; amend if present.
- `typecheck` excludes `.test.ts`. No new runtime deps (global `fetch`).
- **Security:** the PAT is never logged, never put in a thrown Error message, never written into committed content. `sessionStorage` only — never `localStorage`.
- `GitRef` is already exported from `src/app/git-import.ts` — import the type, don't redefine it.

---

### Task 1: `git-export.ts`

**Files:** Create `src/app/git-export.ts`; Test `src/app/git-export.test.ts`.

- [ ] **Step 1: Failing tests** — create `src/app/git-export.test.ts`:

```typescript
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
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/repository/files/")) return new Response("{}", { status: 404 });
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(commitFiles({ host: "gitlab", owner: "o", repo: "r", branch: "main", dir: "" }, FILES, "tok", "m")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/app/git-export.test.ts`.

- [ ] **Step 3: Create `src/app/git-export.ts`**

```typescript
// Commit generated files (tokens.css + app.config.ts) to a GitHub/GitLab repo
// in one atomic commit, using a user-supplied write PAT. Client-side fetch.
// SECURITY: the token is never logged and never placed in a thrown Error message.

import type { GitRef } from "./git-import.js";

export interface ExportFile { path: string; content: string; }
export interface CommitResult { commitUrl: string; }

const GH_API = "https://api.github.com";
const GL_API = "https://gitlab.com/api/v4";

/** Parse a host response, mapping non-OK status to a user-facing (token-free) Error. */
async function need<T>(res: Response, host: "GitHub" | "GitLab", ctx: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  if (res.status === 401 || res.status === 403) throw new Error(`${host}: token invalid or missing write scope (${ctx}).`);
  if (res.status === 404) throw new Error(`${host}: repo or branch not found (${ctx}).`);
  if (res.status === 422) throw new Error(`${host}: ${ctx} rejected — the branch may have moved; reload and retry.`);
  throw new Error(`${host}: ${ctx} failed (status ${res.status}).`);
}

async function commitGitHub(target: GitRef, files: readonly ExportFile[], token: string, message: string): Promise<CommitResult> {
  const base = `${GH_API}/repos/${target.owner}/${target.repo}/git`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  const branchPath = `heads/${encodeURIComponent(target.branch)}`;

  const ref = await need<{ object: { sha: string } }>(await fetch(`${base}/ref/${branchPath}`, { headers }), "GitHub", "read branch ref");
  const baseSha = ref.object.sha;
  const baseCommit = await need<{ tree: { sha: string } }>(await fetch(`${base}/commits/${baseSha}`, { headers }), "GitHub", "read base commit");

  const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  for (const f of files) {
    const blob = await need<{ sha: string }>(
      await fetch(`${base}/blobs`, { method: "POST", headers, body: JSON.stringify({ content: f.content, encoding: "utf-8" }) }),
      "GitHub", `create blob ${f.path}`,
    );
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await need<{ sha: string }>(
    await fetch(`${base}/trees`, { method: "POST", headers, body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) }),
    "GitHub", "create tree",
  );
  const newCommit = await need<{ sha: string; html_url: string }>(
    await fetch(`${base}/commits`, { method: "POST", headers, body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }) }),
    "GitHub", "create commit",
  );
  await need<unknown>(
    await fetch(`${base}/refs/${branchPath}`, { method: "PATCH", headers, body: JSON.stringify({ sha: newCommit.sha }) }),
    "GitHub", "update branch ref",
  );
  return { commitUrl: newCommit.html_url };
}

async function commitGitLab(target: GitRef, files: readonly ExportFile[], token: string, message: string): Promise<CommitResult> {
  const id = encodeURIComponent(`${target.owner}/${target.repo}`);
  const ref = encodeURIComponent(target.branch);
  const actions: { action: "create" | "update"; file_path: string; content: string }[] = [];
  for (const f of files) {
    const head = await fetch(`${GL_API}/projects/${id}/repository/files/${encodeURIComponent(f.path)}?ref=${ref}`, { headers: { "PRIVATE-TOKEN": token } });
    if (head.status === 401 || head.status === 403) throw new Error(`GitLab: token invalid or missing write scope (check file ${f.path}).`);
    actions.push({ action: head.ok ? "update" : "create", file_path: f.path, content: f.content });
  }
  const res = await fetch(`${GL_API}/projects/${id}/repository/commits`, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify({ branch: target.branch, commit_message: message, actions }),
  });
  const data = await need<{ web_url: string }>(res, "GitLab", "create commit");
  return { commitUrl: data.web_url };
}

/** Commit files to the target ref in one atomic commit. Throws a token-free,
 *  user-facing Error on auth/not-found/validation failure. */
export async function commitFiles(target: GitRef, files: readonly ExportFile[], token: string, message: string): Promise<CommitResult> {
  if (files.length === 0) throw new Error("No files to commit.");
  return target.host === "github"
    ? commitGitHub(target, files, token, message)
    : commitGitLab(target, files, token, message);
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/app/git-export.test.ts`.
- [ ] **Step 5: `npm run typecheck && npx vitest run`** → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/app/git-export.ts src/app/git-export.test.ts
git commit -m "feat(export): git-export module — atomic commit to GitHub/GitLab (write PAT)"
```
Verify no trailer; amend if present.

---

### Task 2: commit panel in `App.vue`

**Files:** Modify `src/app/App.vue`.

READ `App.vue` first: the existing `git-import` import + `parseGitUrl` usage; the `repoUrl`/`repoLoading` loader block (the import UI you mirror); the `downloadAll()` function (~`function downloadAll`, shows how `defaultRenderers` + `appConfigRenderer` + `scanReport.value.completeness` render); `state.graph`. The commit panel lives near the existing loader / download controls.

- [ ] **Step 1: Imports + state (script)**

```typescript
import { commitFiles, type ExportFile } from "./git-export.js";
// parseGitUrl is already imported from ./git-import.js for the loader.

const exportUrl = ref<string>(
  typeof localStorage !== "undefined" ? (localStorage.getItem("figma-tokens-export-url") ?? "") : "",
);
const commitMessage = ref<string>("chore(tokens): update from Figma");
const pat = ref<string>(
  typeof sessionStorage !== "undefined" ? (sessionStorage.getItem("git-export-pat") ?? "") : "",
);
const committing = ref(false);
const commitConfirm = ref(false);
const commitUrl = ref<string | null>(null);
const commitError = ref<string | null>(null);

function persistPat() {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem("git-export-pat", pat.value);
}

function buildExportFiles(): ExportFile[] {
  const g = state.graph.value;
  if (!g) return [];
  const target = parseGitUrl(exportUrl.value);
  const dir = target?.dir ?? "";
  return defaultRenderers.map((r) => ({
    path: dir ? `${dir}/${r.id}` : r.id,
    content:
      r.id === appConfigRenderer.id
        ? appConfigRenderer.render(g, { completeness: scanReport.value.completeness }).text
        : r.render(g).text,
  }));
}

function requestCommit() {
  commitUrl.value = null;
  commitError.value = null;
  if (!state.graph.value) { commitError.value = "Load tokens first."; return; }
  if (!parseGitUrl(exportUrl.value)) { commitError.value = "Unrecognised GitHub/GitLab URL."; return; }
  if (pat.value.trim().length === 0) { commitError.value = "A write token is required."; return; }
  commitConfirm.value = true;
}

async function doCommit() {
  const target = parseGitUrl(exportUrl.value);
  if (!target) { commitError.value = "Unrecognised GitHub/GitLab URL."; commitConfirm.value = false; return; }
  committing.value = true;
  try {
    const result = await commitFiles(target, buildExportFiles(), pat.value.trim(), commitMessage.value);
    commitUrl.value = result.commitUrl;
    if (typeof localStorage !== "undefined") localStorage.setItem("figma-tokens-export-url", exportUrl.value.trim());
  } catch (e) {
    commitError.value = e instanceof Error ? e.message : "Commit failed.";
  } finally {
    committing.value = false;
    commitConfirm.value = false;
  }
}
```

- [ ] **Step 2: Commit panel (template)** — add near the loader / download controls:

```vue
        <div class="flex flex-col gap-2 mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <span class="text-[10px] uppercase tracking-wider text-zinc-400">Commit to Git</span>
          <input
            type="text"
            v-model="exportUrl"
            data-testid="export-url"
            placeholder="target repo: github.com/owner/nuxt-app/tree/main/app"
            class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
          />
          <input
            type="text"
            v-model="commitMessage"
            placeholder="commit message"
            class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
          />
          <input
            type="password"
            v-model="pat"
            data-testid="export-pat"
            placeholder="write PAT (kept in sessionStorage only)"
            autocomplete="off"
            class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
            @input="persistPat"
          />
          <button
            type="button"
            data-testid="commit-button"
            class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            :disabled="committing || !state.graph.value"
            @click="requestCommit"
          >Commit to Git…</button>

          <div
            v-if="commitConfirm"
            data-testid="commit-confirm"
            class="text-[11px] rounded border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1"
          >
            <p>Commit <code class="font-mono">tokens.css</code> + <code class="font-mono">app.config.ts</code> to:</p>
            <p class="font-mono break-all">{{ exportUrl }}</p>
            <div class="flex gap-2 pt-1">
              <button type="button" class="px-2 py-0.5 rounded bg-primary text-inverted disabled:opacity-50" :disabled="committing" @click="doCommit">{{ committing ? "Committing…" : "Confirm" }}</button>
              <button type="button" class="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700" :disabled="committing" @click="commitConfirm = false">Cancel</button>
            </div>
          </div>

          <p v-if="commitUrl" data-testid="commit-result" class="text-[11px] text-emerald-600 dark:text-emerald-400 break-all">
            Committed: <a :href="commitUrl" target="_blank" rel="noopener" class="underline">{{ commitUrl }}</a>
          </p>
          <p v-if="commitError" class="text-[11px] text-red-600 dark:text-red-400">{{ commitError }}</p>
        </div>
```
(Match the surrounding container's spacing/classes; place it after the import loader / download button.)

- [ ] **Step 3: `npm run typecheck && npx vitest run && npm run build`** → PASS (clean build; template compiles; `git-export` import resolves).
- [ ] **Step 4: Commit**
```bash
git add src/app/App.vue
git commit -m "feat(export): commit panel — write tokens.css/app.config.ts to a Git repo (sessionStorage PAT)"
```
Verify no trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] Headless QA (DRY-RUN only): load a graph, enter a target URL + a dummy PAT, click **Commit
  to Git…**, confirm the `commit-confirm` box shows the target URL + both filenames — do NOT click
  Confirm (no real write). An invalid URL or empty PAT shows the inline error. Console clean.
  Screenshot.
- [ ] Confirm the PAT is NOT in `localStorage` (only `sessionStorage`); grep the bundle/source to
  confirm the token is never logged.
- [ ] Dispatch a final code reviewer (focus: token never logged/committed/in-error).
- [ ] superpowers:finishing-a-development-branch — **do not push**; merge to `main` by FF only on
  explicit user request. The real commit is the user's own check with their PAT.

## Self-review notes

- **Spec coverage:** `commitFiles` GitHub (Git Data 6-step atomic) + GitLab (create/update + commits)
  + token-free errors (Task 1); commit panel (target URL + message + PAT + confirm + result),
  sessionStorage PAT, files from `defaultRenderers` (Task 2). All mapped.
- **Security:** `need()` never includes the token in a message; the PAT lives in `sessionStorage`
  + an in-memory ref; it is sent only as an `Authorization`/`PRIVATE-TOKEN` header over HTTPS.
- **Reuse:** `GitRef`/`parseGitUrl` from `git-import.ts`; `defaultRenderers`/`appConfigRenderer`
  exactly as `downloadAll` uses them.
- **No placeholders:** full module + tests + exact App.vue script + template.

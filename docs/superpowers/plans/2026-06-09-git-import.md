# Git import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load Figma `*.tokens.json` from a public GitHub/GitLab repo directory URL (token-less, client-side) into the existing `loadSources` pipeline — alongside drag-and-drop.

**Architecture:** Task 1 adds `src/app/git-import.ts` (`parseGitUrl` pure + `fetchTokenFiles` via host REST APIs → `File[]`). Task 2 wires a repo-URL input + Load button into `App.vue`, reusing `handleFiles` (widened to accept `File[]`).

**Tech Stack:** TS + Vue 3 SFC, Vitest (+ jsdom for the component side), vue-tsc. Browser `fetch`/`File`. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/git-import` (spec committed at `f2ec273`).

**Spec:** `docs/superpowers/specs/2026-06-09-git-import-design.md`

**Reminders:**
- Git attribution disabled globally — NO trailer. Verify `git log -1 --format=%B`; amend if present.
- `typecheck` excludes `.test.ts`. No new runtime deps (use global `fetch`/`File`/`URL`).
- Public/token-less only. No PAT. Mock `globalThis.fetch` in tests; restore it afterwards.

---

### Task 1: `git-import.ts`

**Files:** Create `src/app/git-import.ts`; Test `src/app/git-import.test.ts`.

- [ ] **Step 1: Failing tests** — create `src/app/git-import.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/app/git-import.test.ts`.

- [ ] **Step 3: Create `src/app/git-import.ts`**

```typescript
// Load Figma *.tokens.json from a public GitHub/GitLab repo directory.
// Token-less (public repos only): lists the directory via the host REST API,
// then fetches each token file raw and returns browser File objects for the
// existing loadSources() pipeline. Writes/commits (PAT) are a separate cycle.

export interface GitRef {
  host: "github" | "gitlab";
  owner: string;
  repo: string;
  branch: string;
  dir: string;
}

/** Parse a GitHub/GitLab web URL into a GitRef, or null if unrecognised.
 * Supports `host/owner/repo`, github `…/tree/<branch>/<dir>`, gitlab
 * `…/-/tree/<branch>/<dir>`. Branch defaults to `main`, dir to "". (Nested
 * GitLab subgroups and non-github/gitlab hosts are out of scope.) */
export function parseGitUrl(url: string): GitRef | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/, "");

  if (host === "github.com") {
    if (parts.length >= 4 && parts[2] === "tree") {
      return { host: "github", owner, repo, branch: parts[3]!, dir: parts.slice(4).join("/") };
    }
    return { host: "github", owner, repo, branch: "main", dir: "" };
  }
  if (host === "gitlab.com") {
    const dash = parts.indexOf("-");
    if (dash >= 2 && parts[dash + 1] === "tree" && parts.length > dash + 2) {
      return { host: "gitlab", owner, repo, branch: parts[dash + 2]!, dir: parts.slice(dash + 3).join("/") };
    }
    return { host: "gitlab", owner, repo, branch: "main", dir: "" };
  }
  return null;
}

interface Entry { name: string; rawUrl: string; }

function isTokenFile(name: string): boolean {
  return name.endsWith(".tokens.json") || name === "figma-mapping.json";
}

async function listGitHub(ref: GitRef): Promise<Entry[]> {
  const dirPath = ref.dir.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${dirPath}?ref=${encodeURIComponent(ref.branch)}`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new Error(`GitHub: ${ref.owner}/${ref.repo} not found or rate-limited (status ${res.status}).`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error(`GitHub: "${ref.dir || "/"}" is not a directory.`);
  return data
    .filter((d): d is { type: string; name: string; download_url: string } =>
      typeof d === "object" && d !== null && (d as { type?: unknown }).type === "file" &&
      typeof (d as { download_url?: unknown }).download_url === "string")
    .map((d) => ({ name: d.name, rawUrl: d.download_url }));
}

async function listGitLab(ref: GitRef): Promise<Entry[]> {
  const id = encodeURIComponent(`${ref.owner}/${ref.repo}`);
  const tree = `https://gitlab.com/api/v4/projects/${id}/repository/tree?ref=${encodeURIComponent(ref.branch)}` +
    (ref.dir ? `&path=${encodeURIComponent(ref.dir)}` : "");
  const res = await fetch(tree);
  if (!res.ok) {
    throw new Error(`GitLab: ${ref.owner}/${ref.repo} not found or rate-limited (status ${res.status}).`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error(`GitLab: unexpected tree response.`);
  return data
    .filter((d): d is { type: string; name: string; path: string } =>
      typeof d === "object" && d !== null && (d as { type?: unknown }).type === "blob")
    .map((d) => ({
      name: d.name,
      rawUrl: `https://gitlab.com/api/v4/projects/${id}/repository/files/${encodeURIComponent(d.path)}/raw?ref=${encodeURIComponent(ref.branch)}`,
    }));
}

/** Fetch every *.tokens.json (+ figma-mapping.json) in the ref's directory as
 * File[]. Throws a user-facing Error on listing failure / empty / fetch error. */
export async function fetchTokenFiles(ref: GitRef): Promise<File[]> {
  const entries = ref.host === "github" ? await listGitHub(ref) : await listGitLab(ref);
  const wanted = entries.filter((e) => isTokenFile(e.name));
  if (wanted.length === 0) {
    const where = `${ref.owner}/${ref.repo}${ref.dir ? "/" + ref.dir : ""} (branch ${ref.branch})`;
    throw new Error(`No *.tokens.json found in ${where}.`);
  }
  const files: File[] = [];
  for (const e of wanted) {
    const res = await fetch(e.rawUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${e.name} (status ${res.status}).`);
    const text = await res.text();
    files.push(new File([text], e.name, { type: "application/json" }));
  }
  return files;
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/app/git-import.test.ts`.
- [ ] **Step 5: `npm run typecheck && npx vitest run`** → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/app/git-import.ts src/app/git-import.test.ts
git commit -m "feat(import): git-import module — parse GitHub/GitLab URL + fetch token files (public)"
```
Verify no trailer; amend if present.

---

### Task 2: wire the repo-URL loader into `App.vue`

**Files:** Modify `src/app/App.vue`.

READ `App.vue` first: the `handleFiles(files: FileList | null)` function (~line 383, calls `loadSources([...files])`); the `loadError` ref; the drop-zone template; the existing `pastedFileUrl` input (the Figma-file URL — a DIFFERENT field, leave it).

- [ ] **Step 1: Widen `handleFiles` to accept an array**

Change the signature to `async function handleFiles(files: FileList | readonly File[] | null)`. The body's `[...files]` already spreads both a `FileList` and a `File[]`. No caller change needed (the file-input `@change` still passes a `FileList`).

- [ ] **Step 2: Add the repo-URL state + load handler (script)**

```typescript
import { parseGitUrl, fetchTokenFiles } from "./git-import.js";

const repoUrl = ref<string>(
  typeof localStorage !== "undefined" ? (localStorage.getItem("figma-tokens-repo-url") ?? "") : "",
);
const repoLoading = ref(false);

async function loadFromRepo() {
  const ref_ = parseGitUrl(repoUrl.value);
  if (!ref_) {
    state.loadError.value = "Unrecognised GitHub/GitLab URL.";
    return;
  }
  repoLoading.value = true;
  try {
    const files = await fetchTokenFiles(ref_);
    await handleFiles(files);
    if (typeof localStorage !== "undefined") localStorage.setItem("figma-tokens-repo-url", repoUrl.value.trim());
  } catch (e) {
    state.loadError.value = e instanceof Error ? e.message : "Failed to load from repo.";
  } finally {
    repoLoading.value = false;
  }
}
```
(Use the exact `loadError` accessor `handleFiles` uses — match `state.loadError.value` or the local ref name you see in the file.)

- [ ] **Step 3: Add the input + Load button (template)**

Near the drop zone, add:
```vue
        <div class="flex items-center gap-2">
          <input
            type="text"
            v-model="repoUrl"
            placeholder="github.com/owner/repo/tree/main/tokens"
            class="flex-1 text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
            @keydown.enter="loadFromRepo"
          />
          <button
            type="button"
            data-testid="repo-load"
            class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            :disabled="repoLoading || repoUrl.trim().length === 0"
            @click="loadFromRepo"
          >
            {{ repoLoading ? "Loading…" : "Load from Git" }}
          </button>
        </div>
```
(Match the surrounding markup/spacing; place it adjacent to the existing drop zone / `pastedFileUrl` input.)

- [ ] **Step 4: `npm run typecheck && npx vitest run && npm run build`** → PASS (clean build; template compiles; `git-import` import resolves).
- [ ] **Step 5: Commit**
```bash
git add src/app/App.vue
git commit -m "feat(import): repo-URL loader UI (fetch tokens from a public GitHub/GitLab repo)"
```
Verify no trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] Headless QA: paste a real public token repo dir URL (e.g.
  `https://github.com/clawdbot3535/token-inspector/tree/main/components`), click **Load from Git**,
  confirm the sidebar token tree + scan populate (same as a drag-drop of those files); paste a
  bogus URL → `loadError` shows; console clean. Screenshot.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; merge to `main` by FF only on
  explicit user request.

## Self-review notes

- **Spec coverage:** `parseGitUrl` (github/gitlab, branch/dir defaults) + `fetchTokenFiles`
  (API listing → raw → `File[]`, error paths) (Task 1); repo-URL input + Load + `handleFiles`
  widening + localStorage persistence + `loadError` (Task 2). All mapped.
- **No new deps; token-less; client-side `fetch`/`File`.** Tests mock `globalThis.fetch`.
- **Reuse:** the fetched `File[]` flow through the same `handleFiles`/`loadSources` path as
  drag-and-drop — no parse duplication.
- **No placeholders:** full module + tests + exact App.vue edits.

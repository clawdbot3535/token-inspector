# Design: Git export — commit tokens.css + app.config.ts (GitHub + GitLab)

- **Date:** 2026-06-09
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/git-export`
- **Theme:** the write side of the git workflow — commit the generated `tokens.css` and
  `app.config.ts` to a GitHub/GitLab repo via the host API, using a user-supplied write PAT held
  only in `sessionStorage`. Cycle B (the import was cycle A).

## Problem / goal

The inspector already renders `tokens.css` + `app.config.ts` (the `defaultRenderers`, also used by
the local-zip `downloadAll`). Let the user commit those two files to a target repo (the Nuxt
project) — the round-trip companion to the cycle-A import. Client-only SPA, so the commit happens
in the browser with the user's write PAT.

Success criteria:
- A commit panel: target repo **directory URL** (GitHub or GitLab) + commit message + a PAT field;
  a **Commit** button that, after a **confirm step**, writes `tokens.css` + `app.config.ts` to
  `{dir}/{name}` on the target branch in **one atomic commit**, then shows the commit URL.
- GitHub via the Git Data API (ref → base commit → blobs → tree → commit → ref update); GitLab via
  the Commits API (`actions[]` in one call, create-or-update per file).
- The PAT lives in `sessionStorage` + an in-memory ref only (never `localStorage`), is entered in
  a password field, is **never logged and never written into committed content**.
- Errors (401/403 bad token/scope, 404 repo/branch, 422 validation, non-fast-forward) surface
  inline. Full suite + typecheck + build green; the commit API sequences are unit-tested with a
  mocked `fetch`.

## Decisions

- **Reuse `parseGitUrl`/`GitRef`** (from `git-import.ts`) for the target URL — same host/owner/repo/
  branch/dir parsing. Export the `GitRef` type from `git-import.ts`.
- **Atomic, one commit per export.** GitHub: Git Data API (`base_tree` overwrites existing paths
  transparently, so no per-file `sha` needed). GitLab: Commits API with an `actions[]` array. Both
  produce a single commit with both files.
- **PAT in `sessionStorage` + in-memory, password input, never persisted to `localStorage`.** Not
  logged; never part of any committed file. Security-sensitive: the token is the user's, minimal
  scope (GitHub fine-grained `Contents: write`; GitLab `write_repository`), the commit is an
  outward-facing action they explicitly confirm.
- **Confirm before commit.** Committing publishes to an external repo and is hard to reverse — a
  confirm step shows host/owner/repo/branch/path + the two filenames before firing.
- **Target is a separate URL from the import source** (the import pulls tokens from the Figma-export
  repo; the export pushes to the Nuxt project repo). A distinct target field.
- **Commit the two `defaultRenderers` files** (`tokens.css`, `app.config.ts`) — the same rendered
  text `downloadAll` zips (`app.config.ts` with the completeness comments).
- **Both hosts in this cycle** (per the round-trip goal).

## Design

### `src/app/git-export.ts` (new)
```typescript
import type { GitRef } from "./git-import.js"; // GitRef exported from git-import

export interface ExportFile { path: string; content: string; }
export interface CommitResult { commitUrl: string; }

/** Commit files to the target ref in ONE atomic commit. Throws a user-facing
 *  Error on auth/not-found/validation/non-fast-forward. Never logs the token. */
export async function commitFiles(
  target: GitRef, files: readonly ExportFile[], token: string, message: string,
): Promise<CommitResult>;
```
- **GitHub** (`Authorization: Bearer <token>`, `Accept: application/vnd.github+json`):
  1. `GET /repos/{o}/{r}/git/ref/heads/{branch}` → `object.sha` (baseSha; 404 → branch error).
  2. `GET /repos/{o}/{r}/git/commits/{baseSha}` → `tree.sha` (baseTree).
  3. per file: `POST /repos/{o}/{r}/git/blobs` `{ content, encoding:"utf-8" }` → `sha`.
  4. `POST /repos/{o}/{r}/git/trees` `{ base_tree, tree:[{path, mode:"100644", type:"blob", sha}] }` → `sha`.
  5. `POST /repos/{o}/{r}/git/commits` `{ message, tree, parents:[baseSha] }` → `{ sha, html_url }`.
  6. `PATCH /repos/{o}/{r}/git/refs/heads/{branch}` `{ sha }` (no force) → success; non-fast-forward
     → 422 surfaced as "remote moved, reload and retry".
  Returns `{ commitUrl: commit.html_url }`.
- **GitLab** (`PRIVATE-TOKEN: <token>`), id = `encodeURIComponent("{o}/{r}")`:
  1. per file: `GET /projects/{id}/repository/files/{encodeURIComponent(path)}?ref={branch}` →
     200 ⇒ `action:"update"`, 404 ⇒ `action:"create"`.
  2. `POST /projects/{id}/repository/commits` `{ branch, commit_message: message,
     actions: files.map(f => ({ action, file_path:f.path, content:f.content })) }` →
     `{ web_url }`. Returns `{ commitUrl: web_url }`.
- **Errors:** map non-OK responses to user-facing messages (401/403 → "token invalid or missing
  write scope"; 404 → "repo/branch not found"; else status). Never include the token in a message.

### PAT handling
- A `git-export-pat` value in `sessionStorage` (read on load into an in-memory `ref`), set from a
  **password** `<input>`. Cleared when the tab closes (sessionStorage). Never written to
  `localStorage`, never logged, never part of `files`.

### `src/app/App.vue` (commit panel)
- Fields: **target repo dir URL** (`v-model`, persisted in `localStorage["figma-tokens-export-url"]`
  — the URL is not secret), **commit message** (default `chore(tokens): update from Figma`), **PAT**
  (password, bound to the sessionStorage-backed ref). A **Commit to Git** button → sets a
  `commitConfirm` state rendering a small confirm box (host/owner/repo/branch/path + `tokens.css`,
  `app.config.ts`); a **Confirm** button there calls `doCommit()`.
- `doCommit()`: `parseGitUrl(exportUrl)` → null ⇒ error; build `files` from `defaultRenderers`
  (`{ path: dir ? dir+"/"+r.id : r.id, content: render(g[,completeness]).text }`); `commitFiles(...)`
  in a `try/catch` with a `committing` busy flag; on success set `commitUrl` (rendered as a link);
  errors → inline message. Disabled when no graph / no PAT / no URL.
- `data-testid`s: `export-url`, `export-pat`, `commit-button`, `commit-confirm`, `commit-result`.

### Tests (`src/app/git-export.test.ts`, mocked `globalThis.fetch`)
- **GitHub:** mock the 6-step sequence by URL/method (ref→commit→2×blob→tree→commit→ref PATCH) →
  asserts `commitUrl` is the commit `html_url`, the tree request carried `base_tree` + two blob
  entries, and the commit carried `parents:[baseSha]`.
- **GitLab:** mock per-file existence (one 200 → update, one 404 → create) + the commits POST →
  asserts `commitUrl` is `web_url` and the `actions[]` carry the right `action`/`file_path`/`content`.
- **Errors:** a 401 on the first GitHub call → `commitFiles` rejects with a user-facing message
  that does NOT contain the token; a GitLab non-OK commit → rejects.
- `vi.unstubAllGlobals()` in `afterEach`.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- **Headless (dry-run only):** select a graph, open the commit panel, enter a target URL + a dummy
  PAT, click **Commit to Git**, confirm the **confirm box** appears with the right repo/branch/path
  + both filenames — but do NOT click Confirm (no real write). Confirm an invalid URL shows an
  error. Console clean. Screenshot.
- **Real commit:** out of automated scope — verified by the user with their own write PAT against
  their own repo (committing is outward-facing and needs a real token). Documented as such.

## Out of scope
- Creating branches or opening PRs (commit to an existing branch only).
- Conflict/rebase handling beyond surfacing the non-fast-forward error.
- Private-repo READ (cycle A was public); committing inherently authenticates, so private targets
  work via the same PAT.
- Persisting the PAT across sessions (deliberately sessionStorage-only).

## Risks
- **Write PAT in the browser.** Mitigated: sessionStorage (not localStorage), password input, never
  logged or committed, minimal documented scope, explicit confirm. The token is the user's and the
  app never transmits it anywhere but the chosen host's API over HTTPS.
- **GitHub multi-step is non-atomic at the network level** (6 calls); a failure mid-sequence leaves
  orphan blobs/trees (harmless, GC'd) but no commit — surfaced as an error, safe to retry. The ref
  PATCH is the only mutation that "lands".
- **Cannot live-verify a commit in QA** (no PAT) — covered by mocked unit tests of the exact call
  sequences + a headless dry-run to the confirm box; the real commit is the user's check.
- **Non-fast-forward** if the branch moved between the ref read and the PATCH — surfaced as a retry
  hint, no force-push.

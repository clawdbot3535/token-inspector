# Design: Git import of Figma tokens (public, token-less)

- **Date:** 2026-06-09
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/git-import`
- **Theme:** the read side of the git workflow — fetch the committed `*.tokens.json` from a public
  GitHub/GitLab repo URL and feed them into the existing load pipeline, instead of (alongside)
  manual drag-and-drop. The roadmap's "Inspector read-side · Load from URL", cycle A.

## Problem / goal

Tokens come from the `figma-token-export` plugin, which commits W3C-DTCG `*.tokens.json` to a Git
repo. Today the inspector only ingests them via drag-and-drop. Let the user paste the repo's
directory URL and load the tokens directly. **Public repos only, no token** (writes/commits need a
PAT — that is cycle B, deferred). The app is a client-only static SPA, so all fetching happens in
the browser; public raw + REST endpoints for both hosts are CORS-open and work unauthenticated.

Success criteria:
- Pasting a GitHub or GitLab directory URL and clicking **Load** fetches every `*.tokens.json`
  (plus `figma-mapping.json` if present) in that directory and renders the graph — identical
  downstream behaviour to drag-and-drop.
- Works for `github.com/owner/repo`, `github.com/owner/repo/tree/<branch>/<dir>`,
  `gitlab.com/owner/repo`, and `gitlab.com/owner/repo/-/tree/<branch>/<dir>` (branch/dir optional →
  default branch `main`, repo root).
- The repo URL persists in `localStorage`; errors (404, rate-limit, no token files, network) show
  as the existing `loadError`.
- No backend, no token, no new runtime deps. Full suite + typecheck + build green; headless QA
  loads from a real public repo.

## Decisions

- **API directory listing, not a hard-coded file set.** List the directory via the host's REST API
  (GitHub Contents, GitLab Tree) and take every `*.tokens.json` (+ `figma-mapping.json`). Catches
  renamed/added files and the mapping file; still token-less for public repos. (Hard-coding the
  six known names would miss those and break on a renamed export.)
- **Construct `File` objects and reuse `loadSources`.** `fetchTokenFiles` returns
  `File[]` (`new File([text], name, { type: "application/json" })`); `App.vue` passes them to the
  same `handleFiles`/`loadSources` pipeline drag-and-drop uses. Zero duplication of the parse path.
- **Pure `parseGitUrl`, impure `fetchTokenFiles`.** URL parsing is a pure, unit-tested function;
  the fetching wraps it and is tested with a mocked `fetch`.
- **Default branch `main`, root dir** when the URL omits them. A non-`main` default (e.g. `master`)
  is reached by pasting the full `/tree/<branch>/…` URL — documented; no auto-fallback in v1.
- **Public only, token-less.** No PAT, no secret in the browser. Private repos + write-back are
  cycle B (its own brainstorm; writes inherently need a PAT).
- **New module `src/app/git-import.ts`** (parsing + fetch), separate from `App.vue` (UI) — small,
  focused, testable.

## Design

### `src/app/git-import.ts` (new)
```typescript
export interface GitRef { host: "github" | "gitlab"; owner: string; repo: string; branch: string; dir: string; }

/** Parse a GitHub/GitLab web URL into a GitRef, or null if unrecognised.
 *  github.com/o/r            → { github, o, r, "main", "" }
 *  github.com/o/r/tree/b/d/e → { github, o, r, "b", "d/e" }
 *  gitlab.com/o/r            → { gitlab, o, r, "main", "" }
 *  gitlab.com/o/r/-/tree/b/d → { gitlab, o, r, "b", "d" } */
export function parseGitUrl(url: string): GitRef | null;

/** Fetch every *.tokens.json (+ figma-mapping.json) in the ref's directory as File[].
 *  Lists via the host REST API (token-less, public), then fetches each file raw.
 *  Throws a user-facing Error on 404 / rate-limit / empty / network. */
export async function fetchTokenFiles(ref: GitRef): Promise<File[]>;
```
- **GitHub listing:** `GET https://api.github.com/repos/{owner}/{repo}/contents/{dir}?ref={branch}`
  → entries; keep `type === "file"` whose `name` ends `.tokens.json` or `=== "figma-mapping.json"`;
  fetch each entry's `download_url` (raw) → text.
- **GitLab listing:** project id = `encodeURIComponent("{owner}/{repo}")`;
  `GET https://gitlab.com/api/v4/projects/{id}/repository/tree?path={dir}&ref={branch}` → entries
  with `type === "blob"`; raw via
  `GET https://gitlab.com/api/v4/projects/{id}/repository/files/{encodeURIComponent(path)}/raw?ref={branch}`.
- **Errors:** non-OK list response → `Error("… not found / rate-limited (status N)")`; zero
  matching files → `Error("No *.tokens.json found in <owner>/<repo>/<dir>")`. `fetch` is
  `globalThis.fetch` (browser; mockable in tests).

### `src/app/App.vue` (wiring)
- A **repo-URL input** (text) + **Load** button near the existing drop zone. Initial value from
  `localStorage["figma-tokens-repo-url"]`.
- On Load: `const ref = parseGitUrl(url)`; if null → `loadError = "Unrecognised GitHub/GitLab URL"`.
  Else `try { const files = await fetchTokenFiles(ref); await handleFiles(toFileList(files)); persist(url); } catch (e) { loadError = message(e); }`. (`handleFiles` already takes a `FileList`;
  pass a `FileList`-like or refactor `handleFiles` to accept `File[]` — prefer the latter, a
  one-line signature widening, since `loadSources` already takes `readonly File[]`.)
- A small "loading…" state on the button while fetching.

### Tests
- `src/app/git-import.test.ts`:
  - `parseGitUrl`: github root, github `/tree/branch/dir/deep`, gitlab root, gitlab `/-/tree/…`,
    trailing slash, an unrecognised URL → `null`. Asserts host/owner/repo/branch/dir.
  - `fetchTokenFiles` with a mocked `globalThis.fetch`: a GitHub listing returning two entries
    (one `*.tokens.json`, one unrelated) → one `File` with the right name + content; a GitLab
    listing likewise; a non-OK list → throws; an empty match set → throws. (Restore `fetch` after.)

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Headless QA: paste a real public token repo URL (e.g. `github.com/clawdbot3535/token-export`,
  or this repo's `…/token-inspector/tree/main/components`), click Load, confirm the graph + scan
  populate exactly as a drag-drop of the same files; confirm an invalid URL surfaces `loadError`.
  Screenshot.

## Out of scope (→ cycle B / later)
- **Export/commit to Git** (write-back) — needs a write PAT in the browser; its own cycle.
- **Private repos** (PAT-authenticated read).
- Auto branch fallback (`main`→`master`); pagination for >1000 dir entries; non-github/gitlab hosts.

## Risks
- **Unauthenticated rate limit** (GitHub 60/hr/IP). Acceptable for occasional loads; the error
  message names it. (A PAT raises it — cycle B.)
- **CORS** — `raw.githubusercontent.com`, `api.github.com`, `gitlab.com/api`, and GitLab raw are
  all CORS-open for public resources; verified conceptually, confirmed in headless QA.
- **`handleFiles` currently takes `FileList`** — widen it to `File[]` (drag-drop already spreads to
  an array via `loadSources([...files])`), a minimal, low-risk signature change.

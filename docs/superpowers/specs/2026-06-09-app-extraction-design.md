# Design: App.vue relief — extract CommitPanel + GitLoader, add gate smoke tests

- **Date:** 2026-06-09
- **Status:** DRAFT (awaiting user review)
- **Branch:** `refactor/app-extraction`
- **Theme:** `App.vue` is 1047 lines and grows with every cycle; the commit panel and the git
  loader are self-contained blocks with clean data boundaries. Extract both into components with
  their own tests, and add an `App.vue` mount smoke test that pins the gate logic (the bug class
  from the commit-panel placement incident: structurally correct UI in a dead `v-if` branch).

## Problem / goal

- `App.vue` mixes orchestration with two full feature UIs: the **commit panel** (7 refs + 4
  functions + ~60 template lines, lines ~64–75/456–495/596–650) and the **git loader** (2 refs +
  1 function + ~15 template lines). Neither has a mount test; the panel's placement bug shipped
  unnoticed because nothing pinned "panel is reachable when a graph is loaded".

Success criteria:
- `App.vue` shrinks by ~150 lines; the commit-panel and git-loader code lives in
  `src/app/components/CommitPanel.vue` / `GitLoader.vue` with focused props/emits.
- Behaviour byte-identical: same `data-testid`s, same sessionStorage/localStorage keys, same
  validation/confirm/result flows, same error routing into `state.loadError` for the loader.
- New tests: `CommitPanel.test.ts` (validation, confirm gate, PAT storage), `GitLoader.test.ts`
  (emit on success, error emit on bad URL), and `App.test.ts` — a mounted smoke test pinning:
  no graph → drop zone with the loader, NO `commit-open`; after loading files through the real
  `handleFiles` path → `commit-open` appears, clicking it reveals the commit panel.
- Full suite + typecheck + build green; headless QA confirms unchanged behaviour.

## Decisions

- **`CommitPanel.vue` owns everything commit:** props `graph: TokenGraph | null` and
  `completeness: ReadonlyArray<CompletenessScore>`; ALL state (exportUrl/commitMessage/pat/
  committing/commitConfirm/commitUrl/commitError), persistence (localStorage export-url,
  sessionStorage PAT), `buildExportFiles` (imports `defaultRenderers`/`appConfigRenderer`/
  `parseGitUrl`/`commitFiles` itself), and the full template strip (the bordered `border-b`
  wrapper div moves into the component). `App.vue` keeps only the header toggle
  (`showCommitPanel`, `data-testid="commit-open"`) and mounts
  `<CommitPanel v-if="state.graph.value && showCommitPanel" :graph="state.graph.value"
  :completeness="scanReport.completeness" />`.
- **`GitLoader.vue` fetches, App loads:** the component owns `repoUrl` (localStorage
  `figma-tokens-repo-url`), `repoLoading`, and `loadFromRepo` (parse → `fetchTokenFiles`), and
  communicates results via emits: `@files="(files: File[]) => …"` on success and
  `@error="(message: string) => …"` on failure. `App.vue` wires `@files` → `handleFiles`,
  `@error` → `state.loadError`. (The component cannot — and should not — reach `loadSources`/
  `state`; the emit boundary keeps load-pipeline ownership in App.)
  Note: persistence of the URL happens on successful fetch inside the component, BEFORE App's
  `handleFiles` runs — an acceptable, slightly earlier persist than today (fetch succeeded ⇒ the
  URL is good).
- **Smoke test drives the real pipeline:** `App.test.ts` mounts `App.vue` with jsdom, stubbing
  `UApp`/`UIcon` and the heavy children (`ScanView`, `ComponentTree`, `DimensionRuler`, the
  `Live*` components, `CommitPanel`, `GitLoader` are NOT all stubbed — CommitPanel/GitLoader stay
  real or stubbed-shallow as needed; the Live previews and ScanView are stubbed). `globalThis.fetch`
  is stubbed (the `figma-mapping.json` fetch on mount must resolve; return a 404 Response). Graph
  loading goes through the REAL `handleFiles`: set a `File` on the hidden file input via
  `Object.defineProperty(input.element, "files", …)` + `trigger("change")` + `flushPromises`.
  Assertions: before load → `[data-testid="repo-load"]` present, `[data-testid="commit-open"]`
  absent; after load → `commit-open` present; after clicking it → the commit panel
  (`[data-testid="export-url"]`) visible.
- **No behaviour changes.** This is an extraction; every flow, key, and testid is preserved.
  (Single deliberate micro-change: the loader's URL-persist timing, documented above.)

## Design

### `src/app/components/CommitPanel.vue` (new, ~130 lines)
- Props: `{ graph: TokenGraph | null; completeness: ReadonlyArray<CompletenessScore> }`.
- Script: move verbatim from `App.vue` — `exportUrl`, `commitMessage`, `pat`, `committing`,
  `commitConfirm`, `commitUrl`, `commitError`, `persistPat`, `buildExportFiles` (now reading
  `props.graph` / `props.completeness`), `requestCommit` (graph check via `props.graph`),
  `doCommit`. Imports: `commitFiles`/`ExportFile` from `../git-export.js`, `parseGitUrl` from
  `../git-import.js`, `defaultRenderers`/`appConfigRenderer` from `@core/renderers/index.js`,
  types from `@core/token-graph.js`.
- Template: the whole strip (`<div class="border-b border-default bg-elevated px-4 py-3">…`)
  including all five `data-testid`s.

### `src/app/components/GitLoader.vue` (new, ~60 lines)
- Emits: `{ files: [files: File[]]; error: [message: string] }`.
- Script: `repoUrl` (localStorage-init), `repoLoading`, `loadFromRepo` — on parse failure
  `emit("error", "Unrecognised GitHub/GitLab URL.")`; on fetch success persist URL +
  `emit("files", files)`; on throw `emit("error", message)`.
- Template: the input + `repo-load` button row, verbatim classes.

### `src/app/App.vue` (shrinks)
- Remove the moved refs/functions/imports (keep `parseGitUrl` import ONLY if still used elsewhere —
  it isn't → remove; `commitFiles`/`ExportFile` imports go; `defaultRenderers`/`appConfigRenderer`
  stay — `downloadAll` still uses them).
- Mounts: `<GitLoader @files="handleFiles" @error="(m) => (state.loadError.value = m)" />` in the
  empty-state card; `<CommitPanel v-if="state.graph.value && showCommitPanel" … />` as the first
  child of `<main>`. Header toggle unchanged.

### Tests
- `CommitPanel.test.ts` (jsdom): renders fields with a graph; `commit-button` click without
  URL/PAT → inline error, no confirm box; with URL+PAT → `commit-confirm` appears (and NO network
  call — stub `fetch` to throw if called); PAT lands in `sessionStorage["git-export-pat"]` and
  NOT in `localStorage`; Cancel hides the box.
- `GitLoader.test.ts` (jsdom): bad URL → `error` emit, no fetch; mocked `fetchTokenFiles` flow via
  stubbed `globalThis.fetch` (GitHub listing + raw) → `files` emit with one File; fetch failure →
  `error` emit.
- `App.test.ts` (jsdom): the gate smoke test described above.

### Verification
- `npm run typecheck && npx vitest run && npm run build`.
- Headless QA: same flows as the git-export QA — load via Git, toggle `Commit…`, confirm box,
  cancel; PAT storage check; console clean. Screenshot.

## Out of scope
- The 6-way Live-preview chain extraction (possible later cycle).
- Any behaviour/UI changes beyond the documented persist-timing nuance.
- `SIZE_ORDER` shared-constant cleanup (separate LOW ticket).

## Risks
- **App mount test fragility** (jsdom + Nuxt UI): mitigated by stubbing `UApp`/`UIcon` + heavy
  children and stubbing `fetch`; if the mount proves unworkable, the fallback is a
  `CommitPanel`-level reachability test + a tiny App-template assertion via raw SFC render — but
  the mount is attempted first and is the goal.
- **Hidden coupling missed in extraction** — guarded by byte-identical testids/keys + the existing
  headless QA flows re-run.

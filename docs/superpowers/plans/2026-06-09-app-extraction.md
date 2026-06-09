# App.vue extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the commit panel and the git loader out of `App.vue` into `CommitPanel.vue` / `GitLoader.vue` (behaviour byte-identical), add component tests for both, and an `App.vue` mount smoke test pinning the gate logic.

**Architecture:** Task 1 = `CommitPanel.vue` + test + App rewire. Task 2 = `GitLoader.vue` + test + App rewire. Task 3 = `App.test.ts` gate smoke test. Each task leaves App compiling and the full suite green.

**Tech Stack:** Vue 3 SFC, Vitest + VTU + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest; every task commit must be green.

**Branch:** `refactor/app-extraction` (spec at `3733fbd`).

**Spec:** `docs/superpowers/specs/2026-06-09-app-extraction-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`. VTU `.element` is `Element` → cast `HTMLElement`.
- This is an EXTRACTION: every `data-testid`, storage key, class string, and flow must be preserved verbatim. The only allowed behaviour nuance: GitLoader persists the URL after a successful FETCH (before App's `handleFiles` finishes) — documented in the spec.

---

### Task 1: `CommitPanel.vue`

**Files:** Create `src/app/components/CommitPanel.vue`, `src/app/components/CommitPanel.test.ts`; Modify `src/app/App.vue`.

- [ ] **Step 1: Failing test** — create `src/app/components/CommitPanel.test.ts`:

```typescript
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import CommitPanel from "./CommitPanel.vue";

function graph() {
  const global = { button: { bg: { $value: "#FFFFFF", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
function mountPanel() {
  return mount(CommitPanel, { props: { graph: graph(), completeness: [] } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe("CommitPanel", () => {
  it("shows an inline error (no confirm box) when URL or PAT is missing", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="commit-button"]').trigger("click");
    expect(wrapper.find('[data-testid="commit-confirm"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Unrecognised GitHub/GitLab URL.");
  });

  it("opens the confirm box with URL + PAT set, without any network call", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("no network in confirm step"); });
    vi.stubGlobal("fetch", fetchSpy);
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="export-url"]').setValue("https://github.com/acme/nuxt-app/tree/main/app");
    await wrapper.find('[data-testid="export-pat"]').setValue("ghp_DUMMY");
    await wrapper.find('[data-testid="commit-button"]').trigger("click");
    expect(wrapper.find('[data-testid="commit-confirm"]').exists()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Cancel hides the box.
    const cancel = wrapper.findAll('[data-testid="commit-confirm"] button').find((b) => b.text() === "Cancel")!;
    await cancel.trigger("click");
    expect(wrapper.find('[data-testid="commit-confirm"]').exists()).toBe(false);
  });

  it("persists the PAT to sessionStorage only", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="export-pat"]').setValue("ghp_SECRET");
    expect(sessionStorage.getItem("git-export-pat")).toBe("ghp_SECRET");
    expect(Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? "").includes("ghp_SECRET"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL** (component missing).

- [ ] **Step 3: Create `src/app/components/CommitPanel.vue`** — move the code VERBATIM from `App.vue` (refs at lines ~64–75 except `showCommitPanel`; functions `persistPat`/`buildExportFiles`/`requestCommit`/`doCommit` at ~456–497; template strip ~598–652), adapted only to props:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { defaultRenderers, appConfigRenderer } from "@core/renderers/index.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { parseGitUrl } from "../git-import.js";
import { commitFiles, type ExportFile } from "../git-export.js";

interface Props {
  graph: TokenGraph | null;
  completeness: ReadonlyArray<CompletenessScore>;
}
const props = defineProps<Props>();

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
  const g = props.graph;
  if (!g) return [];
  const target = parseGitUrl(exportUrl.value);
  const dir = target?.dir ?? "";
  return defaultRenderers.map((r) => ({
    path: dir ? `${dir}/${r.id}` : r.id,
    content:
      r.id === appConfigRenderer.id
        ? appConfigRenderer.render(g, { completeness: props.completeness }).text
        : r.render(g).text,
  }));
}

function requestCommit() {
  commitUrl.value = null;
  commitError.value = null;
  if (!props.graph) { commitError.value = "Load tokens first."; return; }
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
</script>

<template>
  <div class="border-b border-default bg-elevated px-4 py-3">
    <!-- template strip moved VERBATIM from App.vue lines ~602–651: the
         flex flex-col gap-2 max-w-md div with the "Commit to Git" label,
         export-url input, commit-message input, export-pat password input
         (@input="persistPat"), commit-button (:disabled="committing || !props.graph"
         — note: was `!state.graph.value`), the commit-confirm box (Confirm/Cancel),
         commit-result link and the error line. Copy it exactly; the ONLY edit
         is `state.graph.value` → `props.graph` in the :disabled binding. -->
  </div>
</template>
```
(The template comment above is for THIS plan's brevity — the implementer copies the real markup from `App.vue` lines 602–651 verbatim into the strip div, with the single `props.graph` adaptation.)

- [ ] **Step 4: Rewire `App.vue`**
- Remove the moved refs (`exportUrl`, `commitMessage`, `pat`, `committing`, `commitConfirm`, `commitUrl`, `commitError` — KEEP `showCommitPanel`) and the four moved functions; remove now-unused imports (`commitFiles`, `ExportFile`; `parseGitUrl` only if no other use — `loadFromRepo` still uses it until Task 2, so KEEP it for now).
- Add `import CommitPanel from "./components/CommitPanel.vue";`.
- Replace the whole strip block (lines ~597–652) with:
```vue
        <!-- Commit panel (header-toggled; only when a graph is loaded) -->
        <CommitPanel
          v-if="state.graph.value && showCommitPanel"
          :graph="state.graph.value"
          :completeness="scanReport.completeness"
        />
```
  NOTE: `scanReport` is a computed of the report — check the exact accessor used elsewhere in the template (`scanReport.completeness` vs `scanReport.value.completeness` inside the template is unwrapped: use the same form the template already uses for scan data; in script it's `scanReport.value.completeness`).

- [ ] **Step 5: Run → PASS** — `npx vitest run src/app/components/CommitPanel.test.ts`, then full gate `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 6: Commit**
```bash
git add src/app/components/CommitPanel.vue src/app/components/CommitPanel.test.ts src/app/App.vue
git commit -m "refactor(app): extract CommitPanel component (byte-identical behaviour) + tests"
```
Verify no trailer.

---

### Task 2: `GitLoader.vue`

**Files:** Create `src/app/components/GitLoader.vue`, `src/app/components/GitLoader.test.ts`; Modify `src/app/App.vue`.

- [ ] **Step 1: Failing test** — create `src/app/components/GitLoader.test.ts`:

```typescript
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import GitLoader from "./GitLoader.vue";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("GitLoader", () => {
  it("emits error (and no fetch) for an unrecognised URL", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const wrapper = mount(GitLoader);
    await wrapper.find("input").setValue("https://example.com/nope");
    await wrapper.find('[data-testid="repo-load"]').trigger("click");
    expect(wrapper.emitted("error")?.[0]).toEqual(["Unrecognised GitHub/GitLab URL."]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits the fetched files and persists the URL on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.github.com/")) {
        return new Response(JSON.stringify([
          { type: "file", name: "color.tokens.json", download_url: "https://raw/color" },
        ]), { status: 200 });
      }
      return new Response('{"a":1}', { status: 200 });
    }));
    const wrapper = mount(GitLoader);
    await wrapper.find("input").setValue("https://github.com/acme/tokens");
    await wrapper.find('[data-testid="repo-load"]').trigger("click");
    await vi.waitFor(() => { expect(wrapper.emitted("files")).toBeTruthy(); });
    const files = wrapper.emitted("files")![0]![0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("color.tokens.json");
    expect(localStorage.getItem("figma-tokens-repo-url")).toBe("https://github.com/acme/tokens");
  });

  it("emits error when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 404 })));
    const wrapper = mount(GitLoader);
    await wrapper.find("input").setValue("https://github.com/acme/tokens");
    await wrapper.find('[data-testid="repo-load"]').trigger("click");
    await vi.waitFor(() => { expect(wrapper.emitted("error")).toBeTruthy(); });
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Create `src/app/components/GitLoader.vue`** (template markup VERBATIM from the App.vue loader row — the `mt-4 flex gap-2 items-center` div with the input + `repo-load` button, same classes/placeholder):

```vue
<script setup lang="ts">
import { ref } from "vue";
import { parseGitUrl, fetchTokenFiles } from "../git-import.js";

const emit = defineEmits<{ files: [files: File[]]; error: [message: string] }>();

const repoUrl = ref<string>(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("figma-tokens-repo-url") ?? "")
    : "",
);
const repoLoading = ref(false);

async function loadFromRepo() {
  const ref_ = parseGitUrl(repoUrl.value);
  if (!ref_) {
    emit("error", "Unrecognised GitHub/GitLab URL.");
    return;
  }
  repoLoading.value = true;
  try {
    const files = await fetchTokenFiles(ref_);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("figma-tokens-repo-url", repoUrl.value.trim());
    }
    emit("files", files);
  } catch (e) {
    emit("error", e instanceof Error ? e.message : String(e));
  } finally {
    repoLoading.value = false;
  }
}
</script>

<template>
  <!-- markup copied verbatim from App.vue's loader row (input + repo-load button) -->
</template>
```
(Implementer: copy the exact `<div class="mt-4 flex gap-2 items-center">…</div>` from App.vue.)

- [ ] **Step 4: Rewire `App.vue`** — remove `repoUrl`/`repoLoading`/`loadFromRepo` and the now-unused `parseGitUrl`/`fetchTokenFiles` imports; add `import GitLoader from "./components/GitLoader.vue";`; replace the loader row in the empty-state card with:
```vue
            <GitLoader
              @files="handleFiles"
              @error="(m: string) => (state.loadError.value = m)"
            />
```

- [ ] **Step 5: Run → PASS** — GitLoader tests, then full gate `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 6: Commit**
```bash
git add src/app/components/GitLoader.vue src/app/components/GitLoader.test.ts src/app/App.vue
git commit -m "refactor(app): extract GitLoader component (emit boundary) + tests"
```
Verify no trailer.

---

### Task 3: App gate smoke test

**Files:** Create `src/app/App.test.ts`.

- [ ] **Step 1: Write the test** (this task is the test):

```typescript
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";

// Heavy children + Nuxt UI are stubbed; CommitPanel/GitLoader stay REAL so the
// gates are exercised end-to-end. fetch is stubbed (figma-mapping.json 404).
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UIcon: true,
      UButton: true,
      ScanView: true,
      ComponentTree: true,
      DimensionRuler: true,
      LiveButton: true,
      LiveInput: true,
      LiveBadge: true,
      LiveSwitch: true,
      LiveCheckbox: true,
      LiveRadio: true,
    },
  },
};

function tokenFile(): File {
  const data = JSON.stringify({ button: { bg: { $value: "#FFFFFF", $type: "color" } } });
  return new File([data], "global.tokens.json", { type: "application/json" });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("App gates", () => {
  it("shows the loader without a graph, and the commit panel only after load + toggle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const wrapper = mount(App, mountOpts);
    await flushPromises();

    // Empty state: drop zone + loader visible, commit toggle absent.
    expect(wrapper.find('[data-testid="repo-load"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="commit-open"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(false);

    // Load a token file through the REAL handleFiles path (hidden file input).
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [tokenFile()] });
    await input.trigger("change");
    await flushPromises();

    // Graph loaded: drop zone gone, commit toggle present, panel still hidden.
    expect(wrapper.find('[data-testid="repo-load"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="commit-open"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(false);

    // Toggle reveals the commit panel.
    await wrapper.find('[data-testid="commit-open"]').trigger("click");
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/app/App.test.ts`. If the mount trips on a missing
  browser API (e.g. `matchMedia`), add a minimal stub at the top of the test
  (`vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))`)
  and report it. If the mount proves genuinely unworkable after reasonable stubbing, STOP and
  report BLOCKED with the obstacle (the spec names a fallback, but the orchestrator decides).
- [ ] **Step 3: Full gate** — `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 4: Commit**
```bash
git add src/app/App.test.ts
git commit -m "test(app): gate smoke test — loader/commit-panel reachability through real handleFiles"
```
Verify no trailer.

---

## Final verification

- [ ] `npm run typecheck && npx vitest run && npm run build` — green; `App.vue` reduced by ~150 lines (report the actual count).
- [ ] Headless QA (unchanged behaviour): load via Git URL → graph; `Commit…` toggle → panel; dummy
  URL+PAT → confirm box → Cancel; PAT in sessionStorage only; console clean. Screenshot.
- [ ] Dispatch a final code reviewer (focus: extraction fidelity — testids/keys/flows identical; no
  logic edits beyond `props.graph` + the emit boundary + the documented persist-timing nuance).
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request.

## Self-review notes

- **Spec coverage:** CommitPanel (T1), GitLoader (T2), smoke test (T3), behaviour-identical
  constraints carried into every task. All mapped.
- **Verbatim-move discipline:** both component templates are copied from App.vue with exactly one
  adaptation each (`props.graph`; emit boundary), called out explicitly.
- **Order:** CommitPanel first (bigger block), loader second (frees the `parseGitUrl` import),
  smoke test last (needs both extractions in place).
- **No placeholders that hide work:** the two "copy verbatim" template comments point at exact
  App.vue line ranges and name the single allowed edit.

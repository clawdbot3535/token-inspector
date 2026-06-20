# Q2a — "Live Build" via StackBlitz-SDK Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Live Build" tab to the inspector's Kit view that embeds the user's generated kit as a running StackBlitz WebContainer, showing the real build-time-Tailwind render of their themed `@nuxt/ui` components inside an in-app iframe — no local `npm i`.

**Architecture:** A new `src/app/live-build/` module: a pure `toLiveBuildFiles(graph)` adapter (reuses the existing `buildKitFiles` from v0.52.0, strips the `kit/` prefix, augments `package.json` with a StackBlitz run-config), a `LiveBuildSubstrate` interface with a `stackblitzSubstrate` implementation (thin `@stackblitz/sdk` wrapper, so Phase 2's self-hosted WebContainer is an adapter swap), and a `LiveBuildPanel.vue`. A new "Live Build" tab in `App.vue` mounts the panel on demand.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), Vitest + @vue/test-utils, `@stackblitz/sdk`. The embedded project targets `@nuxt/ui` ^4 + Vite 6 (built inside StackBlitz's WebContainer).

---

## File Structure
- **Modify `src/test-setup.ts`** (Task 0) — swallow the known-benign jsdom "Could not parse CSS stylesheet" unhandled rejection (from `@tailwindcss/browser`) so the heavy real-component mount tests stop intermittently failing the pre-commit gate. Export a testable predicate.
- **Create `src/test-setup.test.ts`** (Task 0) — unit-test the predicate.
- **Create `src/app/live-build/to-live-build-files.ts`** (Task 1) — `toLiveBuildFiles(graph) → Record<string,string>`.
- **Create `src/app/live-build/substrate.ts`** (Task 2) — the `LiveBuildSubstrate` interface.
- **Create `src/app/live-build/stackblitz-substrate.ts`** (Task 2) — `stackblitzSubstrate` impl + add `@stackblitz/sdk` dep.
- **Create `src/app/components/LiveBuildPanel.vue`** (Task 3) — the on-demand panel.
- **Modify `src/app/App.vue`** (Task 4) — `paneTab` type, the tab button, the panel mount, the import.
- **Create the matching `*.test.ts`** for the adapter, substrate, and panel.

**Verified facts (from recon):**
- `buildKitFiles(graph) → ExportFile[]` (`src/renderers/kit/kit-emitter.ts`, `ExportFile = { path; content }`) emits 9 files under `kit/` (`kit/package.json`, `kit/vite.config.ts`, `kit/index.html`, `kit/tokens.css`, `kit/theme.ts`, `kit/src/main.ts`, `kit/src/main.css`, `kit/src/App.vue`, `kit/README.md`). Already imported in `App.vue:31` as `@core/renderers/kit/kit-emitter.js`.
- The emitted `kit/package.json` is: `{ name:"design-kit", private:true, type:"module", scripts:{dev:"vite",build:"vite build",preview:"vite preview"}, dependencies:{vue,"vue-router","@nuxt/ui"}, devDependencies:{...} }`.
- Vitest aliases (`vitest.config.ts`): `@` → `src/app`, `@core` → `src`. App vite.config defines the same aliases (App.vue uses `@core/...`). Setup file: `src/test-setup.ts`. Component tests opt into jsdom via a `// @vitest-environment jsdom` docblock; engine tests stay `node`.
- The Kit tab strip lives in `App.vue`: `paneTab = ref<"kit"|"coverage">("kit")` (line ~160); the `role="tablist"` div (line ~827) holds `data-testid="kit-tab"` + `data-testid="coverage-tab"` buttons; `LiveKitPanel` mounts under `v-if="previewSupported && paneTab === 'kit'"` (line ~853).
- `npm run typecheck` EXCLUDES `*.test.ts`. The pre-commit hook runs vue-tsc + the full vitest suite.

---

### Task 0: Stop the benign jsdom CSS-parse rejection from failing the gate

**Why first:** the real-component mount tests boot `@tailwindcss/browser`, which injects CSS that jsdom can't parse; the error escapes as an unhandled rejection (`Error: Could not parse CSS stylesheet`). Vitest exits non-zero on unhandled errors **even when all tests pass**, intermittently failing the pre-commit hook for every later task. Fix it once, up front.

**Files:**
- Modify: `src/test-setup.ts`
- Test: `src/test-setup.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/test-setup.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isBenignCssParseError } from "./test-setup.js";

describe("isBenignCssParseError", () => {
  it("matches the jsdom Tailwind-v4 CSS parse error", () => {
    expect(isBenignCssParseError(new Error("Could not parse CSS stylesheet"))).toBe(true);
  });
  it("does not match other errors", () => {
    expect(isBenignCssParseError(new Error("ReferenceError: x is not defined"))).toBe(false);
    expect(isBenignCssParseError("a string")).toBe(false);
    expect(isBenignCssParseError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/test-setup.test.ts`
Expected: FAIL — `isBenignCssParseError` is not exported.

- [ ] **Step 3: Implement.** Append to `src/test-setup.ts` (keep the existing localStorage block untouched):

```ts
// ---------------------------------------------------------------------------
// @tailwindcss/browser (booted by the real-component Kit mount tests) injects
// compiled CSS that jsdom's lenient parser rejects asynchronously with
// "Could not parse CSS stylesheet". The error is harmless (the tests assert on
// recipe output, not computed styles) but escapes as an unhandled rejection,
// which makes Vitest exit non-zero even when every test passes. Swallow ONLY
// this known-benign error; re-surface everything else as an uncaught exception
// so real unhandled rejections still fail the run.
// ---------------------------------------------------------------------------
export function isBenignCssParseError(reason: unknown): boolean {
  return reason instanceof Error && reason.message.includes("Could not parse CSS stylesheet");
}

const REJECTION_GUARD = "__benignCssRejectionHandlerInstalled__";
if (!(globalThis as Record<string, unknown>)[REJECTION_GUARD]) {
  (globalThis as Record<string, unknown>)[REJECTION_GUARD] = true;
  process.on("unhandledRejection", (reason) => {
    if (isBenignCssParseError(reason)) return;
    throw reason;
  });
}
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/test-setup.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Verify the full suite now exits clean.**
Run: `npx vitest run 2>&1 | tail -6`
Expected: `Test Files NN passed`, `Tests NNN passed`, **`Errors` line absent / 0 errors**, process exits 0. (Re-run once or twice to confirm the flakiness is gone — previously it showed `Errors  3 errors`.)

- [ ] **Step 6: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/test-setup.ts src/test-setup.test.ts
git commit -m "test: swallow benign jsdom Tailwind-v4 CSS-parse unhandled rejection"
```
Expected: the pre-commit hook (vue-tsc + full vitest) passes cleanly.

---

### Task 1: `toLiveBuildFiles` — the StackBlitz file-tree adapter (pure)

**Files:**
- Create: `src/app/live-build/to-live-build-files.ts`
- Test: `src/app/live-build/to-live-build-files.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/live-build/to-live-build-files.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import { toLiveBuildFiles } from "./to-live-build-files.js";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "dimension" } } } },
  ];
  return buildGraph(sources);
}

describe("toLiveBuildFiles", () => {
  it("strips the kit/ prefix so the project root holds package.json", () => {
    const files = toLiveBuildFiles(buttonGraph());
    expect(files["package.json"]).toBeDefined();
    expect(files["src/App.vue"]).toBeDefined();
    expect(Object.keys(files).some((p) => p.startsWith("kit/"))).toBe(false);
  });
  it("augments package.json with the stackblitz run config, preserving canonical fields", () => {
    const pkg = JSON.parse(toLiveBuildFiles(buttonGraph())["package.json"]!);
    expect(pkg.stackblitz).toEqual({ installDependencies: true, startCommand: "npm run dev" });
    expect(pkg.dependencies["@nuxt/ui"]).toBeDefined();
    expect(pkg.scripts.dev).toBe("vite");
  });
  it("keeps theme.ts, tokens.css and vite.config.ts intact at the root", () => {
    const files = toLiveBuildFiles(buttonGraph());
    expect(files["theme.ts"]).toContain("export const theme");
    expect(files["tokens.css"]).toBeDefined();
    expect(files["vite.config.ts"]).toContain("ui({ ui: theme })");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/live-build/to-live-build-files.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement.** Create `src/app/live-build/to-live-build-files.ts`:

```ts
import type { TokenGraph } from "@core/token-graph.js";
import { buildKitFiles } from "@core/renderers/kit/kit-emitter.js";

const KIT_PREFIX = "kit/";

/** Converts the canonical kit ExportFiles (paths under `kit/`) into the flat
 *  `Record<path, contents>` shape the StackBlitz SDK expects (project root = kit
 *  root), and augments `package.json` with the StackBlitz run-config so the
 *  embed runs `npm install` + the vite dev server. The canonical kit files are
 *  not mutated — this augmentation is embed-only. */
export function toLiveBuildFiles(graph: TokenGraph): Record<string, string> {
  const files: Record<string, string> = {};
  for (const f of buildKitFiles(graph)) {
    const path = f.path.startsWith(KIT_PREFIX) ? f.path.slice(KIT_PREFIX.length) : f.path;
    files[path] = f.content;
  }
  const pkgRaw = files["package.json"];
  if (pkgRaw) {
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    pkg.stackblitz = { installDependencies: true, startCommand: "npm run dev" };
    files["package.json"] = JSON.stringify(pkg, null, 2) + "\n";
  }
  return files;
}
```
(If the `@core/` alias doesn't resolve in this test context, fall back to relative `../../build-graph.js` / `../../token-graph.js` / `../../renderers/kit/kit-emitter.js` — match whatever the surrounding app-layer code uses.)

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/live-build/to-live-build-files.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/live-build/to-live-build-files.ts src/app/live-build/to-live-build-files.test.ts
git commit -m "feat(live-build): toLiveBuildFiles adapter — kit ExportFiles → StackBlitz file tree"
```

---

### Task 2: `LiveBuildSubstrate` interface + `stackblitzSubstrate` (+ add the SDK dep)

**Files:**
- Modify: `package.json` (+ `package-lock.json`) — add `@stackblitz/sdk`
- Create: `src/app/live-build/substrate.ts`, `src/app/live-build/stackblitz-substrate.ts`
- Test: `src/app/live-build/stackblitz-substrate.test.ts`

- [ ] **Step 1: Add the dependency.**
Run: `npm install @stackblitz/sdk`
Expected: `@stackblitz/sdk` added to `dependencies` in `package.json` + `package-lock.json` updated. (Confirm it lands in `dependencies`, not `devDependencies` — it ships in the app bundle.)

- [ ] **Step 2: Write the failing test.** Create `src/app/live-build/stackblitz-substrate.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const embedProject = vi.fn().mockResolvedValue({});
const openProject = vi.fn();
vi.mock("@stackblitz/sdk", () => ({ default: { embedProject, openProject } }));

import { stackblitzSubstrate } from "./stackblitz-substrate.js";

describe("stackblitzSubstrate", () => {
  beforeEach(() => { embedProject.mockClear(); openProject.mockClear(); });

  it("embeds a node project in preview-only mode into the given element", async () => {
    const el = document.createElement("div");
    await stackblitzSubstrate.embed(el, { "package.json": "{}" }, { title: "Kit" });
    expect(embedProject).toHaveBeenCalledTimes(1);
    const [target, project, options] = embedProject.mock.calls[0]!;
    expect(target).toBe(el);
    expect(project.template).toBe("node");
    expect(project.title).toBe("Kit");
    expect(project.files).toEqual({ "package.json": "{}" });
    expect(options.view).toBe("preview");
    expect(options.hideExplorer).toBe(true);
    expect(options.hideNavigation).toBe(true);
  });

  it("opens the project in a new window via openExternal", () => {
    stackblitzSubstrate.openExternal({ "package.json": "{}" }, { title: "Kit" });
    expect(openProject).toHaveBeenCalledTimes(1);
    const [project, options] = openProject.mock.calls[0]!;
    expect(project.template).toBe("node");
    expect(options).toEqual({ newWindow: true });
  });
});
```

- [ ] **Step 3: Run to verify it fails.**
Run: `npx vitest run src/app/live-build/stackblitz-substrate.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement the interface.** Create `src/app/live-build/substrate.ts`:

```ts
/** The execution substrate that runs the generated kit and renders it.
 *  Phase 1 = StackBlitz SDK (runs the build on stackblitz.com inside its iframe).
 *  Phase 2 (parked) = self-hosted @webcontainer/api implementing the SAME shape,
 *  so swapping substrates needs no UI change. */
export interface LiveBuildSubstrate {
  /** Embed the running project into `el` (replacing its contents with an iframe). */
  embed(el: HTMLElement, files: Record<string, string>, opts: { title: string }): Promise<void>;
  /** Open the project full-screen in the substrate's own UI (escape hatch). */
  openExternal(files: Record<string, string>, opts: { title: string }): void;
}
```

- [ ] **Step 5: Implement the StackBlitz substrate.** Create `src/app/live-build/stackblitz-substrate.ts`:

```ts
import sdk from "@stackblitz/sdk";
import type { LiveBuildSubstrate } from "./substrate.js";

const DESCRIPTION = "Live build of your token export (generated by Token Inspector).";

export const stackblitzSubstrate: LiveBuildSubstrate = {
  async embed(el, files, opts) {
    await sdk.embedProject(
      el,
      { title: opts.title, description: DESCRIPTION, template: "node", files },
      { view: "preview", hideExplorer: true, hideNavigation: true, height: "100%", openFile: "src/App.vue" },
    );
  },
  openExternal(files, opts) {
    sdk.openProject(
      { title: opts.title, description: DESCRIPTION, template: "node", files },
      { newWindow: true },
    );
  },
};
```
(Confirm against the current `@stackblitz/sdk` types: `embedProject(elementOrId, project, embedOptions)`, `openProject(project, openOptions)`, `template: "node"`, `files: Record<string,string>`, and the `EmbedOptions` field names `view`/`hideExplorer`/`hideNavigation`/`height`/`openFile`. If the installed major version renamed any field, adapt to the real type and note it. If `@stackblitz/sdk`'s default export shape differs, fix the import.)

- [ ] **Step 6: Run to verify pass + typecheck.**
Run: `npx vitest run src/app/live-build/stackblitz-substrate.test.ts && npm run typecheck`
Expected: PASS (2/2); typecheck clean.

- [ ] **Step 7: Commit.**
```bash
git add package.json package-lock.json src/app/live-build/substrate.ts src/app/live-build/stackblitz-substrate.ts src/app/live-build/stackblitz-substrate.test.ts
git commit -m "feat(live-build): LiveBuildSubstrate interface + StackBlitz SDK implementation"
```

---

### Task 3: `LiveBuildPanel.vue` — the on-demand panel

**Files:**
- Create: `src/app/components/LiveBuildPanel.vue`
- Test: `src/app/components/LiveBuildPanel.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/components/LiveBuildPanel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveBuildPanel from "./LiveBuildPanel.vue";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "dimension" } } } },
  ];
  return buildGraph(sources);
}
function fakeSubstrate() {
  return { embed: vi.fn().mockResolvedValue(undefined), openExternal: vi.fn() };
}
const stubs = {
  UButton: { props: ["disabled"], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
};

describe("LiveBuildPanel", () => {
  it("disables the start button when there is no graph", () => {
    const wrapper = mount(LiveBuildPanel, { props: { graph: null, substrate: fakeSubstrate() }, global: { stubs } });
    expect(wrapper.get("[data-testid=live-build-start]").attributes("disabled")).toBeDefined();
  });

  it("does not auto-embed on mount (on-demand only)", () => {
    const substrate = fakeSubstrate();
    mount(LiveBuildPanel, { props: { graph: buttonGraph(), substrate }, global: { stubs } });
    expect(substrate.embed).not.toHaveBeenCalled();
  });

  it("embeds the live-build files when the start button is clicked", async () => {
    const substrate = fakeSubstrate();
    const wrapper = mount(LiveBuildPanel, { props: { graph: buttonGraph(), substrate }, global: { stubs } });
    await wrapper.get("[data-testid=live-build-start]").trigger("click");
    expect(substrate.embed).toHaveBeenCalledTimes(1);
    const [, files] = substrate.embed.mock.calls[0]!;
    expect(files["package.json"]).toBeDefined();
    expect(files["src/App.vue"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/LiveBuildPanel.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement.** Create `src/app/components/LiveBuildPanel.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { toLiveBuildFiles } from "../live-build/to-live-build-files.js";
import { stackblitzSubstrate } from "../live-build/stackblitz-substrate.js";
import type { LiveBuildSubstrate } from "../live-build/substrate.js";

const props = withDefaults(
  defineProps<{ graph: TokenGraph | null; substrate?: LiveBuildSubstrate }>(),
  { substrate: () => stackblitzSubstrate },
);

const TITLE = "Design Kit — Live Build";
const status = ref<"idle" | "embedding" | "ready" | "error">("idle");
const embedEl = ref<HTMLElement | null>(null);

async function start(): Promise<void> {
  if (!props.graph || !embedEl.value) return;
  status.value = "embedding";
  try {
    const files = toLiveBuildFiles(props.graph);
    // Fresh host child each run: embedProject replaces the element it mounts into,
    // so a persistent wrapper lets "Rebuild" work without losing the container.
    const host = document.createElement("div");
    host.style.height = "100%";
    embedEl.value.replaceChildren(host);
    await props.substrate.embed(host, files, { title: TITLE });
    status.value = "ready";
  } catch {
    status.value = "error";
  }
}

function openExternal(): void {
  if (!props.graph) return;
  props.substrate.openExternal(toLiveBuildFiles(props.graph), { title: TITLE });
}
</script>

<template>
  <div class="flex flex-col gap-2 h-full" data-testid="live-build-panel">
    <div v-if="status === 'idle'" class="text-xs text-muted space-y-2">
      <p>
        Runs the real <code>@nuxt/ui</code> build in a sandbox (~30–90&nbsp;s first boot).
        Your generated kit is sent to stackblitz.com to run; it is ephemeral and not saved.
      </p>
      <UButton size="sm" :disabled="!graph" data-testid="live-build-start" @click="start">
        Start live build
      </UButton>
    </div>

    <div v-else-if="status === 'embedding'" class="text-xs text-muted">
      Booting sandbox &amp; installing dependencies…
    </div>

    <div v-else-if="status === 'error'" class="text-xs text-error space-y-2">
      <p>Couldn't start the embedded build.</p>
      <UButton size="sm" variant="outline" data-testid="live-build-open-external" @click="openExternal">
        Open in StackBlitz ↗
      </UButton>
    </div>

    <div
      ref="embedEl"
      class="flex-1 min-h-[400px] rounded border border-default overflow-hidden"
      :class="status === 'ready' ? '' : 'hidden'"
      data-testid="live-build-embed"
    ></div>

    <div v-if="status === 'ready'" class="flex gap-2">
      <UButton size="xs" variant="outline" @click="start">Rebuild</UButton>
      <UButton size="xs" variant="ghost" data-testid="live-build-open-external" @click="openExternal">
        Open in StackBlitz ↗
      </UButton>
    </div>
  </div>
</template>
```
(If importing `stackblitz-substrate.ts` at module load pulls `@stackblitz/sdk` into the jsdom test and errors, add `vi.mock("@stackblitz/sdk", () => ({ default: { embedProject: vi.fn(), openProject: vi.fn() } }))` at the top of `LiveBuildPanel.test.ts` — the test injects a fake substrate anyway, so the real one is never called.)

- [ ] **Step 4: Run to verify pass + typecheck.**
Run: `npx vitest run src/app/components/LiveBuildPanel.test.ts && npm run typecheck`
Expected: PASS (3/3); typecheck clean.

- [ ] **Step 5: Commit.**
```bash
git add src/app/components/LiveBuildPanel.vue src/app/components/LiveBuildPanel.test.ts
git commit -m "feat(live-build): LiveBuildPanel — on-demand StackBlitz embed with escape hatch"
```

---

### Task 4: Wire the "Live Build" tab into `App.vue`

**Files:**
- Modify: `src/app/App.vue` (import ~line 18, `paneTab` ~line 160, tab strip ~line 844, panel mount ~line 855)
- Test: extend `src/app/App.view-state.test.ts` (it already mounts `App` and tests `paneTab`/tab switching) — or add `src/app/App.live-build-tab.test.ts` if cleaner

- [ ] **Step 1: Write the failing test.** First read `src/app/App.view-state.test.ts` to reuse its exact App-mount setup (fixture graph, stubs, how it reaches the Kit pane). Then add a test mirroring that setup that asserts the Live Build tab switches `paneTab` and mounts the panel. Stub `LiveBuildPanel` so the test doesn't pull the SDK. The assertion core:

```ts
// (inside the existing App mount setup — fixture graph that makes previewSupported true,
//  with LiveBuildPanel stubbed e.g. global.stubs: { LiveBuildPanel: { template: '<div data-testid="lbp-stub" />' } })
it("switches to the Live Build tab and mounts the panel", async () => {
  const wrapper = mountAppWithGraph(); // however the existing tests mount App with a graph
  await wrapper.get("[data-testid=live-build-tab]").trigger("click");
  expect(wrapper.find("[data-testid=lbp-stub]").exists()).toBe(true);
});
```
If `App.view-state.test.ts` has no reusable helper, replicate its mount block inline in a new `App.live-build-tab.test.ts`. Keep the assertion: clicking `[data-testid=live-build-tab]` reveals the (stubbed) `LiveBuildPanel`.

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/App.view-state.test.ts` (or your new file)
Expected: FAIL — no `live-build-tab` / panel not mounted.

- [ ] **Step 3: Implement — import + `paneTab` type.** In `src/app/App.vue`:
  - After `import LiveKitPanel from "./components/LiveKitPanel.vue";` (line ~17), add:
    ```ts
    import LiveBuildPanel from "./components/LiveBuildPanel.vue";
    ```
  - Change `const paneTab = ref<"kit" | "coverage">("kit");` (line ~160) to:
    ```ts
    const paneTab = ref<"kit" | "coverage" | "livebuild">("kit");
    ```

- [ ] **Step 4: Implement — the tab button.** In the `role="tablist"` div (after the `coverage-tab` `</button>` at line ~844, still inside the tablist `</div>` at line ~845), add:
```html
                <button type="button" role="tab" data-testid="live-build-tab"
                  :aria-selected="paneTab === 'livebuild'"
                  class="px-3 py-1 text-xs"
                  :class="paneTab === 'livebuild' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'livebuild'"
                >Live Build</button>
```

- [ ] **Step 5: Implement — the panel mount.** After the `LiveKitPanel` template block (after line ~855, before the closing `</div>` at line ~856), add:
```html
              <template v-if="previewSupported && paneTab === 'livebuild'">
                <LiveBuildPanel :graph="state.graph.value" />
              </template>
```

- [ ] **Step 6: Run to verify pass + full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green; typecheck clean. The Live Build tab switches and mounts the panel; Kit + Coverage tabs still work.

- [ ] **Step 7: Commit.**
```bash
git add src/app/App.vue src/app/App.view-state.test.ts src/app/App.live-build-tab.test.ts
git commit -m "feat(live-build): add the Live Build tab to the Kit view"
```
(Add only the test file(s) you actually created/changed.)

---

### Task 5: Manual integration validation (the de-risk proof — not a unit test)

This is the whole point of Phase 1: confirm `@nuxt/ui` v4 actually builds in a WebContainer and the embed renders.

- [ ] Start the inspector dev server: `npm run dev`.
- [ ] In a browser (use the `/browse` skill per project convention), open the local URL, upload the live token export (`assets/tokens-20260619-214856.zip`), and select a component so the Kit pane appears.
- [ ] Click the **Live Build** tab → **Start live build**. Confirm: the StackBlitz embed appears, boots the WebContainer, runs `npm install` (~30–90 s), starts `vite dev`, and the gallery renders the themed `@nuxt/ui` components in preview-only mode (no StackBlitz editor chrome). Confirm the "Open in StackBlitz ↗" escape hatch opens the full project.
- [ ] Record the result (rendered / what was adjusted — e.g. a corrected SDK option or `package.json` run-config field). If the embed fails to boot or `@nuxt/ui` doesn't install, capture the StackBlitz console error and fix the relevant adapter/run-config, then re-validate. **This step passing is the Phase-1 success criterion.**

---

## Self-review checklist (run before handoff)
- README test-count: bump if the harness total changed after Tasks 0–4 (each adds tests).
- Confirm `@stackblitz/sdk` landed in `dependencies` (ships in the bundle), and `package-lock.json` is committed.
- Confirm the Live Build tab does NOT replace Kit/Coverage (it's additive) and is gated on `previewSupported`.
- The Task 5 manual render MUST succeed before considering Phase 1 done — it's the de-risk proof.

## Out of scope (parked → Phase 2 / later)
**Q2b** self-hosted `@webcontainer/api` (`vercel.json` COOP/COEP headers, the OSS licence-key boot handshake, an `embedViaWebContainer` substrate behind the SAME `LiveBuildSubstrate` interface, dropping the StackBlitz `package.json` augmentation); HMR re-mount of `theme.ts`/`tokens.css` into a long-lived container on token change; removing StackBlitz branding; the Nuxt target; chip/sidebar in the gallery. See the spec's "Future".

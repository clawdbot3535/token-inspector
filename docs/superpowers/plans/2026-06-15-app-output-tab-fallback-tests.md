# App.vue Output-Tab Fallback + Custom-Tab Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characterize the conditional `custom-components.ts` tab and the active-tab fallback watch in `App.vue`, mounting the real app with a custom-flagged fixture.

**Architecture:** New `src/app/App.output-tabs.test.ts` reusing the established jsdom harness. A `sidebar` fixture produces custom output (3 tabs); a plain fixture produces 2. The fallback watch is driven by a real custom→clear→plain reload. One additive `App.vue` change: `data-testid="clear-graph"` on the Re-drop button.

**Tech Stack:** Vitest + `@vue/test-utils` (jsdom), Vue 3 `<script setup>`.

---

## Ground truth (verified during planning)

- Exact app path `buildGraph` → `scanGraph(g, { components: COMPONENT_ALLOW_LIST })` → `customPartsByComponent` → `customComponentsRenderer.render`: `{ sidebar: { bg, item: { text } } }` → custom text length 443 (3 tabs); `{ button: { bg } }` → 0 (2 tabs).
- `handleFiles` (App.vue:434-453) does `state.graph.value = buildGraph(sources)` + `state.selection.value = null` + `state.view.value = "inspector"` — a full graph replacement.
- The file input lives behind `v-if="!state.graph.value"` (App.vue:593, input at :612), so a second load requires clearing the graph first.
- Clear button: `<UButton … @click="state.graph.value = null">Re-drop</UButton>` (App.vue:569-577).
- Output tabs carry `data-testid="tab-<name>"` + `:aria-selected` (added in v0.28.2).
- `customOutputText` returns `""` when `state.graph.value` is null (App.vue:124-128), so clearing shrinks `outputTabs` to 2 and fires the fallback watch (App.vue:138-142).

---

## Task 1: Add the clear-graph test hook to App.vue

**Files:**
- Modify: `src/app/App.vue:569-576`

- [ ] **Step 1: Add `data-testid="clear-graph"` to the Re-drop button**

Change the opening tag so it reads:

```html
          <UButton
            v-if="state.graph.value"
            data-testid="clear-graph"
            icon="i-lucide-upload"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="state.graph.value = null"
          >
```

(Only `data-testid` is added; everything else unchanged.)

- [ ] **Step 2: Verify existing app tests still pass**

Run: `npx vitest run src/app/App.test.ts src/app/App.preview-routing.test.ts src/app/App.view-state.test.ts`
Expected: PASS (none assert on the clear button; the attribute is inert to them, and those files stub `UButton: true` so it renders as `<u-button-stub data-testid="clear-graph">`, harmless).

- [ ] **Step 3: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(app): data-testid on the clear-graph button (test hook)"
```

---

## Task 2: Output-tab fallback + custom-tab characterization test

**Files:**
- Create: `src/app/App.output-tabs.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";

async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// --- jsdom shims (same gaps as the other App mount tests) -----------------
if (!("text" in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, "text", {
    value(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    },
  });
}
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", (m: string) => ({
  matches: false, media: m, onchange: null,
  addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
}));

// UButton is a click-passthrough here so the clear-graph button works and its
// data-testid falls through (the real Nuxt UI UButton forwards attrs + click).
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UButton: { template: "<button v-bind=\"$attrs\"><slot /></button>", inheritAttrs: false },
      UIcon: true, UInput: true,
      ScanView: true, ComponentTree: true, SummaryPanel: true, HeaderStatusStrip: true,
      TokenPreview: true, AliasChain: true, UsedByList: true, CodePreview: true,
      FigmaPreview: true, ClassificationBadge: true, FilterChips: true,
      OutputSection: true, ResizeHandle: true, CommitPanel: true, GitLoader: true,
      LiveButton: true, LiveInput: true, LiveBadge: true, LiveSwitch: true,
      LiveCheckbox: true, LiveRadio: true, LiveCard: true, LiveKbd: true,
      LiveProgress: true, LiveModal: true, LiveTable: true, LiveDropdown: true,
      LiveAccordion: true, LiveNav: true, LiveSidebar: true, LiveChip: true,
    },
  },
};

function fileFrom(data: Record<string, unknown>): File {
  return new File([JSON.stringify(data)], "global.tokens.json", { type: "application/json" });
}
// sidebar is a known-custom component -> non-empty custom output -> 3 tabs
const customFixtureFile = () =>
  fileFrom({ sidebar: { bg: { $value: "#F4F4F5", $type: "color" }, item: { text: { $value: "#52525B", $type: "color" } } } });
// plain component -> empty custom output -> 2 tabs
const plainFixtureFile = () =>
  fileFrom({ button: { bg: { $value: "#3b82f6", $type: "color" } } });

async function loadFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushAll();
}

async function mountLoaded(file: File) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  await loadFile(wrapper, file);
  return wrapper;
}

const tab = (wrapper: ReturnType<typeof mount>, name: string) =>
  wrapper.find(`[data-testid="tab-${name}"]`);

afterEach(() => vi.unstubAllGlobals());

describe("App output tabs — conditional custom tab", () => {
  it("shows the custom-components.ts tab for a custom-flagged component", async () => {
    const wrapper = await mountLoaded(customFixtureFile());
    expect(tab(wrapper, "tokens.css").exists()).toBe(true);
    expect(tab(wrapper, "app.config.ts").exists()).toBe(true);
    expect(tab(wrapper, "custom-components.ts").exists()).toBe(true);
  });

  it("hides the custom-components.ts tab for a plain component", async () => {
    const wrapper = await mountLoaded(plainFixtureFile());
    expect(tab(wrapper, "tokens.css").exists()).toBe(true);
    expect(tab(wrapper, "app.config.ts").exists()).toBe(true);
    expect(tab(wrapper, "custom-components.ts").exists()).toBe(false);
  });
});

describe("App output tabs — active-tab fallback watch", () => {
  it("resets the active tab to tokens.css when the active tab disappears", async () => {
    const wrapper = await mountLoaded(customFixtureFile());
    // select the custom tab
    await tab(wrapper, "custom-components.ts").trigger("click");
    expect(tab(wrapper, "custom-components.ts").attributes("aria-selected")).toBe("true");

    // clear the graph -> outputTabs shrinks to 2 -> watch fires
    await wrapper.find('[data-testid="clear-graph"]').trigger("click");
    await flushPromises();

    // reload a plain fixture (file input is back now that graph is null)
    await loadFile(wrapper, plainFixtureFile());

    // the custom tab is gone and the active tab fell back to tokens.css
    expect(tab(wrapper, "custom-components.ts").exists()).toBe(false);
    expect(tab(wrapper, "tokens.css").attributes("aria-selected")).toBe("true");
  });
});
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `npx vitest run src/app/App.output-tabs.test.ts`
Expected: PASS (3 tests).

Troubleshooting:
- If the custom tab does not appear in test 1: confirm `sidebar` still yields non-empty custom output (the planning probe found length 443). If `customParts` is empty, the scanner allow-list seeding changed — re-probe via `customComponentsRenderer.render`.
- If test 3's clear-graph click does nothing: the passthrough `UButton` stub must forward the click — verify `inheritAttrs: false` + `v-bind="$attrs"` so the `onClick` listener in `$attrs` is bound to the real `<button>`. If two buttons match (download has no testid), `[data-testid="clear-graph"]` already disambiguates.
- If the file input is absent after clear: confirm clearing set `state.graph.value = null` (drop zone returns with the input behind `v-if="!state.graph.value"`).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/app/App.output-tabs.test.ts
git commit -m "test(app): characterize output-tab fallback watch + conditional custom tab"
```

---

## Task 3: Release v0.28.3

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.3] — 2026-06-15

### Tests

- **`App.vue` output-tab characterization** — `src/app/App.output-tabs.test.ts` mounts the app
  with a custom-flagged (`sidebar`) fixture to assert the conditional `custom-components.ts` tab
  appears, is absent for a plain component, and that the active-tab fallback watch resets the
  output tab to `tokens.css` when the selected tab disappears (custom tab selected → graph
  cleared → reload a plain set → tab falls back).

### Changed

- The clear-graph (Re-drop) button gains `data-testid="clear-graph"` (test hook). Additive — no
  behavior change.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `751 tests across the typed pipeline …`. Replace `751` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.3 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.3 — App.vue output-tab fallback + custom-tab tests"
git tag v0.28.3
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only test/app-output-tab-fallback
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.3
gh release create v0.28.3 --repo clawdbot3535/token-inspector \
  --title "v0.28.3 — App.vue output-tab fallback + custom-tab tests" \
  --notes "Mount tests for App.vue output tabs: the conditional custom-components.ts tab (shown for a custom-flagged component, hidden for a plain one) and the active-tab fallback watch (selected tab disappears -> resets to tokens.css). Adds data-testid=clear-graph (test hook). Test-only behavior."
gh auth switch --user d56de
git branch -d test/app-output-tab-fallback
```

- [ ] **Step 5: Update memory**

Update `component-previews.md` to note the output-tab fallback watch + conditional custom tab are now mount-tested (`App.output-tabs.test.ts`, v0.28.3; sidebar fixture for custom output), and remove the "custom-tab fallback watch" from the deferred list there. Bump the test count in `MEMORY.md`.

---

## Self-Review

**Spec coverage:** custom tab appears (Task 2 test 1), absent for plain (test 2), fallback watch resets (test 3), the additive `data-testid="clear-graph"` (Task 1), reused harness + passthrough UButton — all present. Deferred items (scan toggle, download, figma-url) intentionally absent, matching the spec.

**Placeholder scan:** No TBD/TODO. All test code concrete; the troubleshooting notes are fallbacks, not placeholders.

**Type/name consistency:** `fileFrom`, `customFixtureFile`, `plainFixtureFile`, `loadFile`, `mountLoaded`, `tab`, `flushAll`, `mountOpts` defined once and used consistently. Tab testids (`tab-tokens.css` / `tab-app.config.ts` / `tab-custom-components.ts`) match the v0.28.2 output-tab attributes; `clear-graph` matches the Task 1 addition. The passthrough `UButton` stub uses `inheritAttrs: false` + `v-bind="$attrs"` so `data-testid` and the `@click` listener reach the rendered `<button>`.

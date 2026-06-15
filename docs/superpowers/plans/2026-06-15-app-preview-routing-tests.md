# App.vue Preview-Routing Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a characterization test that asserts every `COMPONENTS_WITH_PREVIEW` member routes to its own `Live*` component in both `App.vue` template chains, guarding the `LiveButton` catch-all footgun.

**Architecture:** Mount `App` with a loaded graph, stub all 16 `Live*` components with name-emitting stubs, drive selection by `$emit`-ing `select` / `select-component` from the (stubbed) `ComponentTree`, and assert the right `live-<name>` testid renders while `live-button` stays absent for non-button components. Test-only — no production code changes.

**Tech Stack:** Vitest + `@vue/test-utils` (jsdom), Vue 3 `<script setup>`.

---

## Ground truth (already verified during planning)

- `loadSources` pushes `{ name: <layer>, data }`; the layer name does **not** prefix node ids. A `global.tokens.json` whose JSON is `{ button: { bg: {…} }, card: { bg: {…} }, … }` produces node ids `button-bg`, `card-bg`, … (one per top-level key). Confirmed via a throwaway `buildGraph` probe (Shape B → `["button-bg","card-bg","chip-bg"]`).
- `selectedNode = g.nodes.get(state.selection.value)`. Setting selection to `"button-bg"` resolves a node whose `id.split('-')[0] === "button"`, satisfying Chain 1's gate. Setting selection to `""` makes `selectedNode` null, which routes to Chain 2.
- `COMPONENTS_WITH_PREVIEW` (App.vue:173) = `button, input, textarea, badge, switch, checkbox, radio, card, kbd, progress, modal, table, dropdown, accordion, nav, sidebar, chip` (17 names → 16 `Live*` components; `input` + `textarea` both render `LiveInput`).
- Selection events (App.vue:725-728): `@select="(id) => (state.selection.value = id)"` and `@select-component="(name) => { selectedComponent = name; … }"`. Emitting them from the stubbed `ComponentTree` runs these handlers.

---

## Task 1: Chain 2 (component-group) routing — comprehensive + unsupported case

**Files:**
- Create: `src/app/App.preview-routing.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ComponentTree from "./components/ComponentTree.vue";

// FileReader fires on a macro-task in jsdom; drain it then follow-on promises.
async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// --- jsdom shims (same gaps as App.test.ts) -------------------------------
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

// --- name -> expected Live* stub testid -----------------------------------
const EXPECTED: Record<string, string> = {
  button: "live-button", input: "live-input", textarea: "live-input",
  badge: "live-badge", switch: "live-switch", checkbox: "live-checkbox",
  radio: "live-radio", card: "live-card", kbd: "live-kbd", progress: "live-progress",
  modal: "live-modal", table: "live-table", dropdown: "live-dropdown",
  accordion: "live-accordion", nav: "live-nav", sidebar: "live-sidebar", chip: "live-chip",
};
const NAMES = Object.keys(EXPECTED);

const liveStub = (testid: string) => ({ template: `<div data-testid="${testid}" />` });
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UIcon: true, UButton: true, UInput: true,
      ScanView: true, ComponentTree: true, SummaryPanel: true, HeaderStatusStrip: true,
      TokenPreview: true, AliasChain: true, UsedByList: true, CodePreview: true,
      FigmaPreview: true, ClassificationBadge: true, FilterChips: true,
      OutputSection: true, ResizeHandle: true, CommitPanel: true, GitLoader: true,
      // name-emitting Live* stubs — these are what the routing test asserts on
      LiveButton: liveStub("live-button"), LiveInput: liveStub("live-input"),
      LiveBadge: liveStub("live-badge"), LiveSwitch: liveStub("live-switch"),
      LiveCheckbox: liveStub("live-checkbox"), LiveRadio: liveStub("live-radio"),
      LiveCard: liveStub("live-card"), LiveKbd: liveStub("live-kbd"),
      LiveProgress: liveStub("live-progress"), LiveModal: liveStub("live-modal"),
      LiveTable: liveStub("live-table"), LiveDropdown: liveStub("live-dropdown"),
      LiveAccordion: liveStub("live-accordion"), LiveNav: liveStub("live-nav"),
      LiveSidebar: liveStub("live-sidebar"), LiveChip: liveStub("live-chip"),
    },
  },
};

// global.tokens.json with one bg token per component -> ids `<name>-bg`
function tokenFile(): File {
  const data: Record<string, unknown> = {};
  for (const n of NAMES) data[n] = { bg: { $value: "#3b82f6", $type: "color" } };
  return new File([JSON.stringify(data)], "global.tokens.json", { type: "application/json" });
}

async function mountLoaded() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [tokenFile()], configurable: true });
  await input.trigger("change");
  await flushAll();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe("App preview routing — Chain 2 (component-group select)", () => {
  it.each(NAMES)("routes %s to its own Live* (not the LiveButton catch-all)", async (name) => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");            // clear node -> selectedNode null -> Chain 2
    tree.vm.$emit("select-component", name); // set the component group
    await flushPromises();

    const expected = EXPECTED[name];
    expect(wrapper.find(`[data-testid="${expected}"]`).exists()).toBe(true);
    if (expected !== "live-button") {
      expect(wrapper.find('[data-testid="live-button"]').exists()).toBe(false);
    }
  });

  it("renders no Live* for a component without preview support", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "tooltip"); // not in COMPONENTS_WITH_PREVIEW
    await flushPromises();
    for (const testid of new Set(Object.values(EXPECTED))) {
      expect(wrapper.find(`[data-testid="${testid}"]`).exists()).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test — expect PASS (characterization of current correct behavior)**

Run: `npx vitest run src/app/App.preview-routing.test.ts`
Expected: PASS (18 tests: 17 names + 1 unsupported).

Troubleshooting if a name fails with `live-button` rendered instead of its own stub: that means the component-group chain (App.vue ~871-908) is missing that name's branch before the `LiveButton` catch-all — a real routing bug to fix in App.vue, not the test. If ALL names render nothing, the preview pane is likely behind a tab/toggle; emit the tab switch (inspect the middle-pane toggle in App.vue) before the assertions and re-run.

- [ ] **Step 3: Prove the guard works — mutation check (temporary)**

Temporarily delete the `LiveCard` component-group branch in `src/app/App.vue` (the `<LiveCard v-else-if="previewSupported && selectedComponent === 'card'" … />` block in the second chain). Run:

Run: `npx vitest run src/app/App.preview-routing.test.ts -t card`
Expected: FAIL — `card` now falls through to the `LiveButton` catch-all, so `live-button` renders and `live-card` is absent.

Then **restore** the deleted branch (`git checkout src/app/App.vue`) and re-run:

Run: `npx vitest run src/app/App.preview-routing.test.ts -t card`
Expected: PASS. This confirms the test actually trips on the footgun.

- [ ] **Step 4: Commit**

```bash
git add src/app/App.preview-routing.test.ts
git commit -m "test(app): characterize preview routing — Chain 2 (group select) + unsupported"
```

---

## Task 2: Chain 1 (token-selected) routing — comprehensive

**Files:**
- Modify: `src/app/App.preview-routing.test.ts` (append a describe block)

- [ ] **Step 1: Append the Chain 1 describe block**

Add at the end of `src/app/App.preview-routing.test.ts`:

```ts
describe("App preview routing — Chain 1 (token selected)", () => {
  it.each(NAMES)("routes a selected %s-bg token to its own Live*", async (name) => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select-component", name);   // selectedComponent = name
    tree.vm.$emit("select", `${name}-bg`);      // selectedNode resolves; id splits to `name`
    await flushPromises();

    const expected = EXPECTED[name];
    expect(wrapper.find(`[data-testid="${expected}"]`).exists()).toBe(true);
    if (expected !== "live-button") {
      expect(wrapper.find('[data-testid="live-button"]').exists()).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `npx vitest run src/app/App.preview-routing.test.ts`
Expected: PASS (35 tests total: 18 from Task 1 + 17 Chain 1).

Troubleshooting if a name fails: a `live-button` result means that name's branch is missing from the token-selected chain (App.vue ~765-831) before the catch-all. If `selectedNode` won't resolve (nothing renders), confirm the fixture id with a one-off `console.log([...wrapper.vm /* via state */])` — but the planning probe already confirmed `${name}-bg` is the correct id form, so this should not occur.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Note the exact total test count from the output for the release notes.

- [ ] **Step 4: Commit**

```bash
git add src/app/App.preview-routing.test.ts
git commit -m "test(app): characterize preview routing — Chain 1 (token selected)"
```

---

## Task 3: Release v0.28.1

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry**

Insert below `# Changelog` (use `Edit`, never `Write`):

```markdown
## [0.28.1] — 2026-06-15

### Tests

- **`App.vue` preview-routing characterization** — `src/app/App.preview-routing.test.ts`
  mounts the app, stubs every `Live*` with a name-emitting stub, and drives selection through
  the `ComponentTree` events to assert that each `COMPONENTS_WITH_PREVIEW` member routes to its
  own preview in **both** template chains (token-selected and component-group), and that the
  `LiveButton` catch-all never fires for a non-button component. Also asserts an unsupported
  component (`tooltip`) renders no preview. Closes the one untested seam in `App.vue` — the
  routing footgun where a forgotten branch silently renders button-shaped. No production change.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` currently reads `712 tests across the typed pipeline …`. Replace `712` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.1 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.1 — App.vue preview-routing characterization tests"
git tag v0.28.1
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only test/app-preview-routing
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.1
gh release create v0.28.1 --repo clawdbot3535/token-inspector \
  --title "v0.28.1 — App.vue preview-routing characterization tests" \
  --notes "Characterization test for App.vue preview routing: every COMPONENTS_WITH_PREVIEW member routes to its own Live* in both template chains; the LiveButton catch-all never fires for non-button components; an unsupported component renders no preview. Test-only, no production change."
gh auth switch --user d56de
git branch -d test/app-preview-routing
```

- [ ] **Step 5: Update memory**

Append a one-line pointer in the relevant memory file (`component-previews.md`) noting that App.vue preview routing is now characterization-tested (v0.28.1), and bump the test count in `MEMORY.md` if it records one.

---

## Self-Review

**Spec coverage:** Chain 2 comprehensive (Task 1), Chain 1 comprehensive (Task 2), `textarea`→`LiveInput` (in both loops via `EXPECTED`), unsupported→no preview (Task 1), name-emitting stubs approach, new file, reused harness — all present. The spec's node-id probe + subset fallback is resolved: the probe confirmed `<name>-bg` works for all names, so no subset fallback is needed; Chain 1 loops over all 17.

**Placeholder scan:** No TBD/TODO. All test code is concrete; the only "inspect App.vue" notes are troubleshooting fallbacks for real routing bugs, not implementation placeholders.

**Type/name consistency:** `EXPECTED`, `NAMES`, `liveStub`, `mountOpts`, `tokenFile`, `mountLoaded`, `flushAll` are defined in Task 1 and reused verbatim in Task 2. Stub keys (`LiveButton` … `LiveChip`) match App.vue's import names. Testids (`live-*`) are consistent between stubs and assertions.

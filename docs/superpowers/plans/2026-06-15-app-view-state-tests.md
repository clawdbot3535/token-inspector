# App.vue View-State Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characterize the four untested app-level view-state behaviors in `App.vue` (theme toggle, live-filter chip, output-tab switching, selection→app.config.ts auto-switch), mounting the real app and asserting real side-effects.

**Architecture:** New `src/app/App.view-state.test.ts` reusing the routing test's jsdom harness + fixture. One additive `App.vue` change: `data-testid` + `role="tab"` + `aria-selected` on the output-tab buttons (the clean test seam + a real tablist a11y fix). No logic change.

**Tech Stack:** Vitest + `@vue/test-utils` (jsdom), Vue 3 `<script setup>`.

---

## Ground truth (verified during planning)

- The `{ <name>: { bg: … } }` `global.tokens.json` fixture yields node ids `<name>-bg`, all with `layer === "component"` (probe confirmed `button-bg:component`). So selecting `button-bg` triggers the component-layer auto-switch at App.vue:248-251.
- Output-tab buttons (App.vue:1130-1138) loop `v-for="tab in outputTabs"`, `@click="state.outputTab.value = tab"`, active class `bg-elevated font-medium`. No `aria-selected` / `data-testid` today.
- Theme buttons (App.vue:536-548) render `{{ t }}` text (`light` / `dark`), `@click="state.theme.value = t"`; an `immediate` watch (App.vue:152-160) toggles `document.documentElement`'s `dark`/`light` class.
- Live-filter chip (App.vue:660-675): `data-testid="live-filter"`, `:aria-pressed="liveOnly"`, `@click="liveOnly = !liveOnly"`.
- Selection events: `@select="(id) => (state.selection.value = id)"`; the auto-switch is `if (node?.layer === "component" && state.outputTab.value !== "app.config.ts") state.outputTab.value = "app.config.ts"` (App.vue:248-251), reacting to selection.

---

## Task 1: Add the output-tab test/a11y seam to App.vue

**Files:**
- Modify: `src/app/App.vue:1130-1138`

- [ ] **Step 1: Add `data-testid`, `role`, `aria-selected` to the tab button**

Replace the opening `<button v-for="tab in outputTabs" …>` tag attributes (App.vue:1130-1138) so the element reads:

```html
              <button
                v-for="tab in outputTabs"
                :key="tab"
                role="tab"
                :data-testid="`tab-${tab}`"
                :aria-selected="state.outputTab.value === tab"
                class="px-3 py-2 text-xs border-r border-default whitespace-nowrap"
                :class="{
                  'bg-elevated font-medium': state.outputTab.value === tab,
                  'text-muted': state.outputTab.value !== tab,
                }"
                @click="state.outputTab.value = tab"
              >
```

(Only attributes are added: `role`, `:data-testid`, `:aria-selected`. Class bindings and click handler are unchanged.)

- [ ] **Step 2: Verify no existing test broke**

Run: `npx vitest run src/app/App.test.ts src/app/App.preview-routing.test.ts`
Expected: PASS (these don't assert on output tabs; the additive attributes are inert to them).

- [ ] **Step 3: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(app): aria-selected + data-testid on output tabs (tablist a11y + test seam)"
```

---

## Task 2: View-state characterization test

**Files:**
- Create: `src/app/App.view-state.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ComponentTree from "./components/ComponentTree.vue";

async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// --- jsdom shims (same gaps as App.test.ts / App.preview-routing.test.ts) ---
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

const NAMES = ["button", "input", "badge", "card", "chip"];
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UIcon: true, UButton: true, UInput: true,
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

const themeButton = (wrapper: Awaited<ReturnType<typeof mountLoaded>>, label: "light" | "dark") =>
  wrapper.findAll("button").find((b) => b.text().trim() === label)!;

afterEach(() => vi.unstubAllGlobals());

describe("App view state — theme toggle", () => {
  it("toggles the document root dark/light class both ways", async () => {
    const wrapper = await mountLoaded();
    const root = document.documentElement;

    await themeButton(wrapper, "dark").trigger("click");
    await flushPromises();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);

    await themeButton(wrapper, "light").trigger("click");
    await flushPromises();
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
  });
});

describe("App view state — live filter chip", () => {
  it("flips aria-pressed on each click", async () => {
    const wrapper = await mountLoaded();
    const chip = wrapper.find('[data-testid="live-filter"]');
    expect(chip.attributes("aria-pressed")).toBe("false");
    await chip.trigger("click");
    expect(chip.attributes("aria-pressed")).toBe("true");
    await chip.trigger("click");
    expect(chip.attributes("aria-pressed")).toBe("false");
  });
});

describe("App view state — output tabs", () => {
  it("switches the selected tab both ways", async () => {
    const wrapper = await mountLoaded();
    const css = () => wrapper.find('[data-testid="tab-tokens.css"]');
    const cfg = () => wrapper.find('[data-testid="tab-app.config.ts"]');
    expect(css().exists()).toBe(true);
    expect(cfg().exists()).toBe(true);
    // exactly one selected initially
    const selectedInitially = [css(), cfg()].filter(
      (t) => t.attributes("aria-selected") === "true",
    );
    expect(selectedInitially).toHaveLength(1);

    await cfg().trigger("click");
    expect(cfg().attributes("aria-selected")).toBe("true");
    expect(css().attributes("aria-selected")).toBe("false");

    await css().trigger("click");
    expect(css().attributes("aria-selected")).toBe("true");
    expect(cfg().attributes("aria-selected")).toBe("false");
  });
});

describe("App view state — selection auto-switches output tab", () => {
  it("switches to app.config.ts when a component-layer node is selected", async () => {
    const wrapper = await mountLoaded();
    // start from a known non-app.config.ts tab
    await wrapper.find('[data-testid="tab-tokens.css"]').trigger("click");
    expect(wrapper.find('[data-testid="tab-tokens.css"]').attributes("aria-selected")).toBe("true");

    wrapper.findComponent(ComponentTree).vm.$emit("select", "button-bg");
    await flushPromises();

    expect(wrapper.find('[data-testid="tab-app.config.ts"]').attributes("aria-selected")).toBe("true");
  });
});
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `npx vitest run src/app/App.view-state.test.ts`
Expected: PASS (4 tests).

Troubleshooting:
- Theme test fails to find a button: the theme buttons render `{{ t }}` with surrounding whitespace; `.text().trim()` handles it. If a different control also renders exactly `light`/`dark`, narrow with `.findAll('button').filter(b => b.text().trim() === label && b.attributes('class')?.includes('px-2'))`.
- Auto-switch test fails (tab stays `tokens.css`): confirm `button-bg` resolves to a `layer === "component"` node — the planning probe confirmed it does. If `selectedNode` is null, the `@select` emit id must exactly match a `g.nodes` key (`button-bg`).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/app/App.view-state.test.ts
git commit -m "test(app): characterize view-state — theme, live filter, output tabs, auto-switch"
```

---

## Task 3: Release v0.28.2

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.2] — 2026-06-15

### Tests

- **`App.vue` view-state characterization** — `src/app/App.view-state.test.ts` mounts the app
  and asserts the four app-level view-state behaviors: the theme toggle flips the
  `document.documentElement` `dark`/`light` class, the live-filter chip flips its `aria-pressed`,
  the output tabs switch the selected tab, and selecting a component-layer node auto-switches the
  output tab to `app.config.ts`.

### Changed

- Output-tab buttons now carry `role="tab"` + `aria-selected` (a tablist a11y fix and the test
  seam). Additive — no behavior change.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `747 tests across the typed pipeline …`. Replace `747` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.2 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.2 — App.vue view-state characterization tests"
git tag v0.28.2
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only test/app-view-state
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.2
gh release create v0.28.2 --repo clawdbot3535/token-inspector \
  --title "v0.28.2 — App.vue view-state characterization tests" \
  --notes "Mount tests for App.vue view-state: theme toggle -> document root class, live-filter aria-pressed, output-tab switching, and component-node selection auto-switching the output tab to app.config.ts. Output tabs gain role=tab + aria-selected (a11y + test seam). Test-only behavior; one additive a11y attribute."
gh auth switch --user d56de
git branch -d test/app-view-state
```

- [ ] **Step 5: Update memory**

Update `component-previews.md` (or a more apt App-testing note) to record that App.vue view-state (theme/live-filter/output-tabs/auto-switch) is now mount-tested in `App.view-state.test.ts` (v0.28.2), and bump the test count in `MEMORY.md`.

---

## Self-Review

**Spec coverage:** theme toggle (Task 2 case 1), live-filter (case 2), output-tab switching (case 3), selection auto-switch (case 4), the additive `aria-selected`/`data-testid`/`role` change (Task 1), reused harness/fixture — all present. The deferred items (view/scan toggle, custom-tab fallback watch, download, figma-url, clear-graph) are intentionally absent, matching the spec's out-of-scope.

**Placeholder scan:** No TBD/TODO. All test code is concrete; the "if a control renders the same text" / "if selectedNode is null" notes are troubleshooting fallbacks, not placeholders.

**Type/name consistency:** `mountLoaded`, `tokenFile`, `flushAll`, `themeButton`, `mountOpts`, `NAMES` are defined once and used consistently. Testids (`tab-tokens.css`, `tab-app.config.ts`, `live-filter`) match the App.vue attributes added in Task 1 and the existing live-filter testid. `ComponentTree` import + `$emit("select", …)` matches App.vue's `@select` handler.

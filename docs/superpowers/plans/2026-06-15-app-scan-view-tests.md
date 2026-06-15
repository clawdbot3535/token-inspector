# App.vue Scan-View Toggle Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characterize the scan/issues view toggle in `App.vue` — the issue button is gated on `issueCount > 0`, clicking it switches `state.view`, and `ScanView` mounts/unmounts accordingly.

**Architecture:** New `src/app/App.scan-view.test.ts` reusing the established mount harness. A dimension fixture yields 0 issues (no button); a color fixture yields 1 issue (button shown). One additive `App.vue` change: `data-testid="scan-toggle"` on the header issue button.

**Tech Stack:** Vitest + `@vue/test-utils` (jsdom), Vue 3 `<script setup>`.

---

## Ground truth (verified during planning)

- `issueCount = state.graph.value?.issues.length ?? 0` (App.vue:373). The header issue button (App.vue:516-524) renders `v-if="issueCount > 0"`, has `:aria-pressed="state.view.value === 'scan'"`, and `@click` toggles `state.view.value` between `"scan"` and `"inspector"`.
- Main pane: `ScanView` renders `v-if="state.view.value === 'scan'"` (App.vue:740); inspector detail is the `v-else` (App.vue:752).
- `handleFiles` sets `state.view.value = "inspector"` on every load (App.vue:448), so the post-load default view is `inspector`.
- `buildGraph` probe: `{ spacing: { sm: { $value: 8, $type: "dimension" } } }` → 0 issues; `{ button: { bg: { $value: "#3b82f6", $type: "color" } } }` → 1 `malformed-value` issue.

---

## Task 1: Add the scan-toggle test hook to App.vue

**Files:**
- Modify: `src/app/App.vue:516-524`

- [ ] **Step 1: Add `data-testid="scan-toggle"` to the header issue button**

Change the opening `<button>` tag (App.vue:516-522) so it reads:

```html
            <button
              v-if="issueCount > 0"
              data-testid="scan-toggle"
              class="text-warning hover:underline rounded px-1"
              :class="state.view.value === 'scan' ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700' : ''"
              :aria-pressed="state.view.value === 'scan'"
              @click="state.view.value = state.view.value === 'scan' ? 'inspector' : 'scan'"
            >
```

(Only `data-testid` is added; `v-if`, classes, `aria-pressed`, and click are unchanged.)

- [ ] **Step 2: Verify existing app tests still pass**

Run: `npx vitest run src/app/App.test.ts src/app/App.preview-routing.test.ts src/app/App.view-state.test.ts src/app/App.output-tabs.test.ts`
Expected: PASS (none assert on the issue button; the attribute is inert to them).

- [ ] **Step 3: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(app): data-testid on the scan/issues toggle button (test hook)"
```

---

## Task 2: Scan-view toggle characterization test

**Files:**
- Create: `src/app/App.scan-view.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ScanView from "./components/ScanView.vue";

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

function fileFrom(data: Record<string, unknown>): File {
  return new File([JSON.stringify(data)], "global.tokens.json", { type: "application/json" });
}
// dimension token -> buildGraph emits no issues
const cleanFixtureFile = () =>
  fileFrom({ spacing: { sm: { $value: 8, $type: "dimension" } } });
// bare-hex color -> buildGraph emits one malformed-value issue
const issueFixtureFile = () =>
  fileFrom({ button: { bg: { $value: "#3b82f6", $type: "color" } } });

async function mountLoaded(file: File) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushAll();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe("App scan-view toggle", () => {
  it("hides the scan toggle when the graph has no issues", async () => {
    const wrapper = await mountLoaded(cleanFixtureFile());
    expect(wrapper.find('[data-testid="scan-toggle"]').exists()).toBe(false);
    expect(wrapper.findComponent(ScanView).exists()).toBe(false);
  });

  it("toggles ScanView on/off when the issue button is clicked", async () => {
    const wrapper = await mountLoaded(issueFixtureFile());
    const toggle = () => wrapper.find('[data-testid="scan-toggle"]');

    // button present, view starts on the inspector
    expect(toggle().exists()).toBe(true);
    expect(toggle().attributes("aria-pressed")).toBe("false");
    expect(wrapper.findComponent(ScanView).exists()).toBe(false);

    // click -> scan view
    await toggle().trigger("click");
    expect(toggle().attributes("aria-pressed")).toBe("true");
    expect(wrapper.findComponent(ScanView).exists()).toBe(true);

    // click again -> back to inspector
    await toggle().trigger("click");
    expect(toggle().attributes("aria-pressed")).toBe("false");
    expect(wrapper.findComponent(ScanView).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `npx vitest run src/app/App.scan-view.test.ts`
Expected: PASS (2 tests).

Troubleshooting:
- Test 1 finds a `scan-toggle`: the dimension fixture unexpectedly produced an issue — re-probe `buildGraph({ spacing: { sm: { $value: 8, $type: "dimension" } } }).issues`. If non-empty, pick another zero-issue fixture from the probe.
- Test 2 `ScanView` never mounts: confirm the click mutates `state.view` (the button's `@click` toggles it) and that `ScanView` is gated on `state.view.value === 'scan'` (App.vue:740). `findComponent(ScanView)` matches the stub even when stubbed `true`.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/app/App.scan-view.test.ts
git commit -m "test(app): characterize scan/issues view toggle (button gate + ScanView mount)"
```

---

## Task 3: Release v0.28.4

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.4] — 2026-06-15

### Tests

- **`App.vue` scan-view toggle characterization** — `src/app/App.scan-view.test.ts` mounts the app
  and asserts the issues toggle: the button is hidden for a graph with no issues, present for one
  with issues, and clicking it switches `state.view` so `ScanView` mounts/unmounts (with
  `aria-pressed` tracking). Completes the `App.vue` mount-test coverage.

### Changed

- The scan/issues toggle button gains `data-testid="scan-toggle"` (test hook). Additive — no
  behavior change.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `754 tests across the typed pipeline …`. Replace `754` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.4 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.4 — App.vue scan-view toggle tests"
git tag v0.28.4
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only test/app-scan-view
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.4
gh release create v0.28.4 --repo clawdbot3535/token-inspector \
  --title "v0.28.4 — App.vue scan-view toggle tests" \
  --notes "Mount test for App.vue scan/issues toggle: button gated on issue count, clicking switches state.view, ScanView mounts/unmounts. Adds data-testid=scan-toggle (test hook). Completes App.vue mount-test coverage. Test-only behavior."
gh auth switch --user d56de
git branch -d test/app-scan-view
```

- [ ] **Step 5: Update memory**

Update `component-previews.md` to note the scan-view toggle is now mount-tested (`App.scan-view.test.ts`, v0.28.4) and that **App.vue mount-test coverage is complete** (load gates, routing, view-state, output-tabs, scan-view) — remove view/scan toggle from the deferred list, and record the incidental finding that `buildGraph` flags bare-hex color `$value` as `malformed-value`. Bump the test count in `MEMORY.md`.

---

## Self-Review

**Spec coverage:** button hidden for clean graph (Task 2 test 1), button present + view toggle + `ScanView` mount/unmount + `aria-pressed` (test 2), the additive `data-testid="scan-toggle"` (Task 1), reused harness/fixtures — all present. Deferred items (HeaderStatusStrip `@open-scan`, bare-hex data question) intentionally absent, matching the spec.

**Placeholder scan:** No TBD/TODO. All test code concrete; the troubleshooting notes are fallbacks, not placeholders.

**Type/name consistency:** `fileFrom`, `cleanFixtureFile`, `issueFixtureFile`, `mountLoaded`, `flushAll`, `mountOpts` defined once and used consistently. `data-testid="scan-toggle"` matches between Task 1 and the test. `ScanView` import + `findComponent(ScanView)` matches App.vue's gated `ScanView` render. Fixtures match the planning-probe results (dimension → 0 issues, color → 1 issue).

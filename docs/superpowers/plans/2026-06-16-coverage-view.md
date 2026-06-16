# Coverage View + nav-`link` grammar fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the coverage engine in the inspector as a per-component `Preview | Coverage` tab for the five curated composites, and fix the nav-`link` slot-vs-variant collision so the routing is correct.

**Architecture:** Three tasks. (1) Grammar fix — two scoped guards so `nav-link-*` routes to `slots.link`. (2) New presentational `CoverageView.vue` over the `ComponentCoverage` object. (3) Wire it into App.vue's component-selected pane behind a tab toggle. TDD throughout; the pre-commit gate (vue-tsc + full vitest) is the ripple check.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom), `@tg/grammar`, `@core/coverage.js`.

---

### Task 1: Grammar fix — nav `link` routes to the link slot

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts` (`parseSegments` ~line 115; `heuristicSlotMapping` ~line 517-520)
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/grammar/src/slot-mapping.test.ts` (near the other `heuristicSlotMapping` cases):

```ts
it("maps nav-link-bg to the link slot (not base + link variant)", () => {
  expect(heuristicSlotMapping("nav-link-bg", "color")).toEqual({
    slot: "link",
    utilityType: "bg-color",
    variantAxis: null,
    variantKey: null,
  });
});

it("maps nav-link-color to the link slot (text-color)", () => {
  expect(heuristicSlotMapping("nav-link-color", "color")).toEqual({
    slot: "link",
    utilityType: "text-color",
    variantAxis: null,
    variantKey: null,
  });
});

it("leaves button-link-bg as base + link variant (button has no link slot)", () => {
  expect(heuristicSlotMapping("button-link-bg", "color")).toEqual({
    slot: "base",
    utilityType: "bg-color",
    variantAxis: "variant",
    variantKey: "link",
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "nav-link"`
Expected: FAIL — `nav-link-bg` currently returns `{slot:"base", variantAxis:"variant", variantKey:"link"}`.

- [ ] **Step 3: Add the `parseSegments` guard**

In `packages/grammar/src/slot-mapping.ts`, the 2nd-segment variant/color-role consumption (currently):

```ts
  const second = parts[1];
  if (parts.length >= 3 && second !== undefined) {
    if (BUTTON_VARIANT_KEYS.has(second)) { variant = second; start = 2; }
    else if (COLOR_ROLE_KEYS.has(second)) { colorRole = second; start = 2; }
  }
```

becomes (add `&& !(componentSlots?.has(second))` — a no-op in pass 1 where `componentSlots` is
`undefined`; in pass 2 it lets a slot-named 2nd segment fall through to the slotPrefix seam):

```ts
  const second = parts[1];
  if (parts.length >= 3 && second !== undefined && !componentSlots?.has(second)) {
    if (BUTTON_VARIANT_KEYS.has(second)) { variant = second; start = 2; }
    else if (COLOR_ROLE_KEYS.has(second)) { colorRole = second; start = 2; }
  }
```

- [ ] **Step 4: Add the `variantShadowsSlot` guard**

In `heuristicSlotMapping`, the pass-1 early return (currently):

```ts
  const overlayShadowsSlot =
    normal?.utilityType === "overlay-bg" &&
    (nuxtSlotsFor(parsed.component)?.has("overlay") ?? false);
  if (normal && !overlayShadowsSlot) return normal;
```

becomes (add a sibling guard: a pass-1 result whose `variantKey` is actually one of this component's
slots must fall through to pass-2 slot routing):

```ts
  const overlayShadowsSlot =
    normal?.utilityType === "overlay-bg" &&
    (nuxtSlotsFor(parsed.component)?.has("overlay") ?? false);
  const variantShadowsSlot =
    normal?.variantAxis === "variant" &&
    normal?.variantKey != null &&
    (nuxtSlotsFor(parsed.component)?.has(normal.variantKey) ?? false);
  if (normal && !overlayShadowsSlot && !variantShadowsSlot) return normal;
```

- [ ] **Step 5: Run the new tests + the full grammar suite**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS — the 3 new cases green, all 140 prior cases still green (the only behavioural change is
the `nav-link-*` 2nd-segment shape; `button-link-underline-hover` and `nav-item-link-text` are
unaffected because their `link` is a button-variant on a non-slot component / a post-slot-prefix variant
respectively).

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "fix(grammar): route nav-link-* to the link slot, not base+variant (slot shadows variant)"
```

---

### Task 2: CoverageView.vue presentational component

**Files:**
- Create: `src/app/components/CoverageView.vue`
- Test: `src/app/components/CoverageView.test.ts`

- [ ] **Step 1: Write the failing test** (`src/app/components/CoverageView.test.ts`)

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CoverageView from "./CoverageView.vue";
import type { ComponentCoverage } from "@core/coverage.js";

const navCoverage: ComponentCoverage = {
  component: "nav",
  structuralTotal: 1,
  structuralTouched: 0,
  slots: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false },
    { slot: "item", classification: "optional", controls: "entry container: spacing", touched: true },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false },
  ],
  toDesign: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false },
  ],
};

describe("CoverageView", () => {
  it("shows the structural count header", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    expect(w.find('[data-testid="coverage-view"]').exists()).toBe(true);
    expect(w.text()).toContain("0/1 structural");
  });

  it("flags a missing structural slot with a to-design tag", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    const link = w.find('[data-testid="coverage-slot"][data-slot="link"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes("data-touched")).toBe("false");
    expect(link.text()).toContain("to design");
  });

  it("renders optional slots too (touched and untouched)", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    expect(w.find('[data-testid="coverage-slot"][data-slot="item"]').attributes("data-touched")).toBe("true");
    expect(w.find('[data-testid="coverage-slot"][data-slot="root"]').attributes("data-touched")).toBe("false");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/CoverageView.test.ts`
Expected: FAIL — `CoverageView.vue` does not exist.

- [ ] **Step 3: Implement `src/app/components/CoverageView.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ComponentCoverage } from "@core/coverage.js";

const props = defineProps<{ coverage: ComponentCoverage }>();

const structural = computed(() => props.coverage.slots.filter((s) => s.classification === "structural"));
const optional = computed(() => props.coverage.slots.filter((s) => s.classification === "optional"));
</script>

<template>
  <div data-testid="coverage-view" class="space-y-4">
    <div class="flex items-baseline justify-between">
      <div class="font-mono text-base">{{ coverage.component }} — coverage</div>
      <div
        class="text-xs font-mono"
        :class="coverage.structuralTouched < coverage.structuralTotal ? 'text-warning' : 'text-success'"
      >
        {{ coverage.structuralTouched }}/{{ coverage.structuralTotal }} structural
      </div>
    </div>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Structural · must design
      </h3>
      <ul class="space-y-0.5">
        <li
          v-for="s in structural"
          :key="s.slot"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-error'">
            {{ s.touched ? "✓" : "✗" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
          <span
            v-if="!s.touched"
            class="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
          >to design</span>
        </li>
      </ul>
    </section>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Optional · designed or Nuxt default
      </h3>
      <ul class="space-y-0.5">
        <li
          v-for="s in optional"
          :key="s.slot"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-zinc-400'">
            {{ s.touched ? "✓" : "○" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/CoverageView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/CoverageView.vue src/app/components/CoverageView.test.ts
git commit -m "feat(coverage): CoverageView component — structural/optional slot lists"
```

---

### Task 3: Wire the Coverage tab into App.vue

**Files:**
- Modify: `src/app/App.vue` (script: imports + `paneTab` + `coverage` + watch; template: tab bar + CoverageView + wrap the Chain-2 preview chain)
- Test: `src/app/App.coverage.test.ts`

- [ ] **Step 1: Write the failing test** (`src/app/App.coverage.test.ts`)

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
      TokenPreview: true, AliasChain: true, UsedByList: true, CodePreview: true, FigmaPreview: true,
      ClassificationBadge: true, FilterChips: true, OutputSection: true, ResizeHandle: true,
      CommitPanel: true, GitLoader: true,
      LiveButton: true, LiveInput: true, LiveBadge: true, LiveSwitch: true, LiveCheckbox: true,
      LiveRadio: true, LiveCard: true, LiveKbd: true, LiveProgress: true, LiveModal: true,
      LiveTable: true, LiveDropdown: true, LiveAccordion: true, LiveNav: true, LiveSidebar: true,
      LiveChip: true,
      // CoverageView intentionally NOT stubbed — we assert it mounts.
    },
  },
};

function tokenFile(): File {
  const data = {
    nav: { link: { bg: { $value: "#3b82f6", $type: "color" } }, item: { bg: { $value: "#3b82f6", $type: "color" } } },
    button: { bg: { $value: "#3b82f6", $type: "color" } },
  };
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

describe("App coverage view", () => {
  it("offers a Coverage tab for a composite and toggles the view", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");          // clear node -> Chain 2
    tree.vm.$emit("select-component", "nav");
    await flushPromises();

    const covTab = wrapper.find('[data-testid="coverage-tab"]');
    expect(covTab.exists()).toBe(true);
    // default tab = preview -> coverage view not shown yet
    expect(wrapper.find('[data-testid="coverage-view"]').exists()).toBe(false);

    await covTab.trigger("click");
    expect(wrapper.find('[data-testid="coverage-view"]').exists()).toBe(true);
  });

  it("shows no Coverage tab for a component without anatomy", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "button");
    await flushPromises();
    expect(wrapper.find('[data-testid="coverage-tab"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/App.coverage.test.ts`
Expected: FAIL — no `coverage-tab` element exists yet.

- [ ] **Step 3: Add the script wiring in `src/app/App.vue`**

With the other component imports near the top of `<script setup>` (next to `import ScanView…`):

```ts
import CoverageView from "./components/CoverageView.vue";
import { coverageFor } from "@core/coverage.js";
```

Near the `selectedComponent` ref (line 166) add (ensure `ref`, `computed`, `watch` are imported from
`vue` — `watch` may need adding to the existing `vue` import):

```ts
const paneTab = ref<"preview" | "coverage">("preview");
const coverage = computed(() =>
  state.graph.value && selectedComponent.value
    ? coverageFor(state.graph.value, selectedComponent.value)
    : null,
);
watch(selectedComponent, () => {
  paneTab.value = "preview";
});
```

- [ ] **Step 4: Add the tab bar + CoverageView, and wrap the Chain-2 preview chain**

In the component-selected block (`<div v-else-if="state.graph.value" class="space-y-4">`, ~line 987),
immediately AFTER the header `<div>` (the one closing at ~line 995) and BEFORE the `<LiveInput …>` that
starts the preview chain (~line 996), insert:

```vue
              <div v-if="coverage" class="flex gap-1 border-b border-default" data-testid="coverage-tabs">
                <button
                  type="button"
                  data-testid="preview-tab"
                  class="px-3 py-1 text-xs"
                  :class="paneTab === 'preview' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'preview'"
                >Preview</button>
                <button
                  type="button"
                  data-testid="coverage-tab"
                  class="px-3 py-1 text-xs inline-flex items-center gap-1"
                  :class="paneTab === 'coverage' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'coverage'"
                >
                  Coverage
                  <span
                    v-if="coverage.structuralTotal - coverage.structuralTouched > 0"
                    class="text-[10px] font-mono px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  >{{ coverage.structuralTotal - coverage.structuralTouched }}</span>
                </button>
              </div>

              <CoverageView v-if="coverage && paneTab === 'coverage'" :coverage="coverage" />

              <template v-if="!coverage || paneTab === 'preview'">
```

Then add the matching `</template>` AFTER the Chain-2 preview chain's final fallback `<div v-else>…</div>`
(the "Live preview not yet available" block ending at ~line 1119), i.e. immediately before that block's
closing `</div>` at ~line 1120:

```vue
              </template>
```

(The wrapped region is the `<LiveInput v-if=…>` … `<LiveButton v-else-if="previewSupported">` … `<div
v-else>…</div>` chain. The inner `v-if/v-else-if` chain is self-contained, so wrapping it in a
`<template v-if>` does not change preview routing — it only hides the whole chain when the Coverage tab
is active.)

- [ ] **Step 5: Run the coverage test + the App routing test (regression)**

Run: `npx vitest run src/app/App.coverage.test.ts src/app/App.preview-routing.test.ts`
Expected: PASS — coverage tab toggles for nav, absent for button; preview routing unchanged (the wrap is
transparent when `paneTab === 'preview'`, the default).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green (801 + 3 grammar + 3 CoverageView + 2 App = 809).

- [ ] **Step 7: Commit**

```bash
git add src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(coverage): Preview | Coverage tabs in the component pane (composites only)"
```

## Self-Review

**1. Spec coverage:**
- Grammar fix (both guards, nav-link→slot, button-link unchanged) → Task 1. ✓
- `CoverageView.vue` (structural ✓/✗ + to-design, optional ✓/○, count header) → Task 2. ✓
- App wiring (tabs composites-only, default Preview, badge = structural-missing, `coverageFor` computed,
  paneTab reset on component change, testids) → Task 3. ✓
- Tests for all three → Tasks 1/2/3 Step 1. ✓
- Out-of-scope items (click-to-highlight, node-chain coverage, overview variant) correctly omitted. ✓

**2. Placeholder scan:** none — every code step shows the actual code/commands.

**3. Type consistency:** `ComponentCoverage` / `SlotCoverage` fields (`component`, `slots`, `structuralTotal`,
`structuralTouched`, `toDesign`, `slot`, `classification`, `controls`, `touched`) match `src/coverage.ts`.
`coverageFor(graph, component)` signature matches. `paneTab` union `"preview" | "coverage"` consistent
across script + template. `selectedComponent` used as `.value` in script (it is `ref<string>`).

# Real-Render Fidelity (Spec 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. NOTE: Task 1 is browser-exploratory (`@tailwindcss/browser` activation must be confirmed via `/browse`); prefer INLINE execution over blind subagents for Task 1.

**Goal:** Render a real Nuxt UI v4 `<UButton>` themed by the generated recipe in the inspector, behind a "Real" tab, using `@tailwindcss/browser` so the generated arbitrary classes compile at runtime.

**Architecture:** Lazy-load the v4 runtime Tailwind compiler when the Real tab is active so arbitrary recipe classes (`bg-[var(--button-bg)]`) get CSS; the existing tokens-css injector already defines the `var()` values. A new `LiveRealButton` mounts a real `<UButton :ui=generatedRecipe>`; App.vue gains a third `paneTab` value.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Nuxt UI v4, `@tailwindcss/browser` (^4), Vitest + jsdom, `/browse` for the browser-only fidelity proof.

---

### Task 1: Runtime Tailwind compiler + `use-runtime-tailwind` composable

**Files:**
- Modify: `package.json` (add `@tailwindcss/browser`)
- Create: `src/app/composables/use-runtime-tailwind.ts`
- Test: `src/app/composables/use-runtime-tailwind.test.ts`

- [ ] **Step 1: Install the dependency**

Run: `npm install -D @tailwindcss/browser@^4`
Expected: added to `devDependencies`; lockfile updated.

- [ ] **Step 2: Write the failing test** (`use-runtime-tailwind.test.ts`) — jsdom can't compile Tailwind, so the unit test only guards SSR/lazy-safety:

```ts
import { describe, it, expect, vi } from "vitest";
import { ensureRuntimeTailwind } from "./use-runtime-tailwind.js";

describe("ensureRuntimeTailwind", () => {
  it("is idempotent: a second call does not add a second activation style block", async () => {
    await ensureRuntimeTailwind();
    await ensureRuntimeTailwind();
    expect(document.querySelectorAll('style[type="text/tailwindcss"]').length).toBe(1);
  });

  it("injects the tailwind activation import", async () => {
    await ensureRuntimeTailwind();
    const el = document.querySelector('style[type="text/tailwindcss"]');
    expect(el?.textContent).toContain('@import "tailwindcss"');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/app/composables/use-runtime-tailwind.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/app/composables/use-runtime-tailwind.ts`**

```ts
// Lazily boots the Tailwind v4 *runtime* compiler (@tailwindcss/browser) so the
// generated recipe's arbitrary classes (e.g. `bg-[var(--button-bg)]`, `rounded-[8px]`)
// — which are produced at runtime from dropped tokens and therefore never seen by the
// build-time compiler — get real CSS. The token `var(--…)` values come from the existing
// useInjectedTokensCss (@theme→:root). Browser-only; a no-op without a document (jsdom/SSR
// guard) except for the activation block the unit test asserts.

const ACTIVATION_ID = "inspector-tailwind-runtime-activation";
let booted: Promise<void> | null = null;

/** Ensure the runtime compiler is loaded and its activation block is present. Idempotent. */
export function ensureRuntimeTailwind(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!document.getElementById(ACTIVATION_ID)) {
    const style = document.createElement("style");
    style.id = ACTIVATION_ID;
    style.setAttribute("type", "text/tailwindcss");
    style.textContent = '@import "tailwindcss";';
    document.head.appendChild(style);
  }
  if (booted === null) {
    // Dynamic import keeps the compiler out of the main bundle and out of jsdom.
    // The default side-effect of @tailwindcss/browser installs a DOM observer that
    // compiles utility classes (incl. arbitrary values) found in the document.
    booted = import("@tailwindcss/browser").then(() => undefined).catch(() => undefined);
  }
  return booted;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/app/composables/use-runtime-tailwind.test.ts`
Expected: PASS (2 tests). The dynamic `import("@tailwindcss/browser")` is swallowed in jsdom (its DOM observer just finds nothing); the test asserts only the activation block.

- [ ] **Step 6: `/browse` spike — confirm the compiler actually resolves arbitrary classes (the load-bearing proof)**

Start the dev server, then in a `/browse` session call `ensureRuntimeTailwind()` via a temporary harness OR rely on Task 3's Real tab. Minimal harness check (run after `import`ing the composable somewhere reachable, or inline-eval the activation + import):

```
$B js "const s=document.createElement('style'); s.type='text/tailwindcss'; s.textContent='@import \"tailwindcss\";'; document.head.appendChild(s);"
# load @tailwindcss/browser (it's bundled once imported by the app; for the bare spike, confirm via Task 3 instead)
$B js "document.documentElement.style.setProperty('--probe','9px'); const d=document.createElement('div'); d.className='rounded-[7px] p-[var(--probe)]'; document.body.appendChild(d);"
# give the runtime compiler a tick, then:
$B js "const d=document.querySelector('.rounded-\\\\[7px\\\\]'); getComputedStyle(d).borderRadius+' / '+getComputedStyle(d).padding"
```

Expected: `7px / 9px` once the compiler is active (vs `0px / 0px` in the spike without it). **If it does not resolve, STOP** — the `@tailwindcss/browser` activation differs from the assumed `<style type="text/tailwindcss">@import "tailwindcss">` mechanism; read the installed package's entry/README and adjust `ensureRuntimeTailwind` until the `/browse` check is green. This is the foundation; do not proceed to Task 2 until it is.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/app/composables/use-runtime-tailwind.ts src/app/composables/use-runtime-tailwind.test.ts
git commit -m "feat(fidelity): runtime Tailwind compiler composable (@tailwindcss/browser)"
```

---

### Task 2: `LiveRealButton.vue` — the real Nuxt UI button

**Files:**
- Create: `src/app/components/LiveRealButton.vue`
- Test: `src/app/components/LiveRealButton.test.ts`

- [ ] **Step 1: Write the failing test** (`LiveRealButton.test.ts`) — jsdom can't compute styles, so assert the `:ui` prop wiring on a stubbed `UButton`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealButton from "./LiveRealButton.vue";

function buttonGraph() {
  const global = { button: { radius: { $value: 8, $type: "number" }, bg: { $value: "#3b82f6", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
// capture the :ui prop the real UButton would receive
const UButtonStub = {
  props: ["ui", "variant", "size"],
  template: '<button data-testid="real-ubutton" :data-ui="JSON.stringify(ui)">slot</button>',
};
const mountOpts = { global: { stubs: { UButton: UButtonStub, UIcon: true } } };

describe("LiveRealButton", () => {
  it("renders a real UButton and passes the generated recipe's base classes via :ui", () => {
    const w = mount(LiveRealButton, { props: { graph: buttonGraph(), componentName: "button" }, ...mountOpts });
    const btn = w.find('[data-testid="real-ubutton"]');
    expect(btn.exists()).toBe(true);
    const ui = JSON.parse(btn.attributes("data-ui") ?? "{}");
    expect(typeof ui.base).toBe("string");
    expect(ui.base.length).toBeGreaterThan(0); // carries the generated recipe classes
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealButton, { props: { graph: null, componentName: "button" }, ...mountOpts });
    expect(w.find('[data-testid="real-ubutton"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `src/app/components/LiveRealButton.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

// Pick a representative variant (solid if defined, else the first) for v1's resting render.
const variantKey = computed(() => {
  const v = recipe.value?.variants.variant ?? {};
  return Object.keys(v).includes("solid") ? "solid" : Object.keys(v)[0] ?? null;
});

// The :ui prop is a slot→classes override map. Compose the generated base + representative
// size base + the chosen variant's base, so the real UButton paints with the user's tokens.
const ui = computed<Record<string, string> | null>(() => {
  const r = recipe.value;
  if (!r) return null;
  const variantBase = variantKey.value ? r.variants.variant?.[variantKey.value]?.["base"] ?? "" : "";
  const base = [r.slots["base"] ?? "", representativeSizeClasses(r), variantBase].filter(Boolean).join(" ");
  const out: Record<string, string> = { base };
  if (r.slots["label"]) out.label = r.slots["label"];
  if (r.slots["leadingIcon"]) out.leadingIcon = r.slots["leadingIcon"];
  return out;
});

// Boot the runtime compiler so the generated arbitrary classes get CSS.
onMounted(() => { void ensureRuntimeTailwind(); });
</script>

<template>
  <div class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <UButton v-else :ui="ui" :variant="variantKey ?? undefined" size="md">Button</UButton>
    <p class="mt-2 text-[10px] text-muted">
      Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
    </p>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveRealButton.vue src/app/components/LiveRealButton.test.ts
git commit -m "feat(fidelity): LiveRealButton — real UButton themed by the generated recipe"
```

---

### Task 3: App.vue "Real" tab + `/browse` fidelity proof

**Files:**
- Modify: `src/app/App.vue` (the `paneTab` ref ~line 169, the component-pane tab bar ~line 1030, the pane body)
- Test: `src/app/App.coverage.test.ts` (extend — it already mounts App + drives `selectedComponent`)

- [ ] **Step 1: Write the failing test** — add to `src/app/App.coverage.test.ts`:

```ts
import LiveRealButton from "./components/LiveRealButton.vue";
// ... inside describe("App coverage view", …) — or a new describe:

it("offers a Real tab for button and mounts LiveRealButton when clicked", async () => {
  const wrapper = await mountLoaded();
  const tree = wrapper.findComponent(ComponentTree);
  tree.vm.$emit("select", "");
  tree.vm.$emit("select-component", "button");
  await flushPromises();

  const realTab = wrapper.find('[data-testid="real-tab"]');
  expect(realTab.exists()).toBe(true);
  expect(wrapper.findComponent(LiveRealButton).exists()).toBe(false); // default = preview
  await realTab.trigger("click");
  await flushPromises();
  expect(wrapper.findComponent(LiveRealButton).exists()).toBe(true);
});

it("does not offer a Real tab for a non-button component", async () => {
  const wrapper = await mountLoaded();
  const tree = wrapper.findComponent(ComponentTree);
  tree.vm.$emit("select", "");
  tree.vm.$emit("select-component", "nav");
  await flushPromises();
  expect(wrapper.find('[data-testid="real-tab"]').exists()).toBe(false);
});
```

Note: add `LiveRealButton: true` is NOT needed in the stub list (we assert it mounts); ensure the mountOpts in this file don't stub `LiveRealButton`. If the file's mountOpts stub-list would otherwise swallow it, leave it unstubbed.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/App.coverage.test.ts -t "Real tab"`
Expected: FAIL — no `real-tab`.

- [ ] **Step 3: Widen `paneTab` + import LiveRealButton** in `src/app/App.vue`.

Change (line 169): `const paneTab = ref<"preview" | "coverage">("preview");`
to: `const paneTab = ref<"preview" | "coverage" | "real">("preview");`

Add the import near the other component imports: `import LiveRealButton from "./components/LiveRealButton.vue";`

Add a computed for gating (near `coverage`): `const realRenderSupported = computed(() => selectedComponent.value === "button");`

- [ ] **Step 4: Add the Real tab + pane body.**

In the component-pane tab bar (after the Coverage tab button, ~line 1048), add:
```vue
                <button
                  v-if="realRenderSupported"
                  type="button"
                  role="tab"
                  data-testid="real-tab"
                  :aria-selected="paneTab === 'real'"
                  class="px-3 py-1 text-xs"
                  :class="paneTab === 'real' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'real'"
                >Real</button>
```

Where `<CoverageView … />` is rendered (the `paneTab === 'coverage'` branch), add a sibling for the real render:
```vue
              <LiveRealButton
                v-if="realRenderSupported && paneTab === 'real'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
              />
```

And wrap-guard the existing preview chain so it hides when the Real tab is active: the chain is already wrapped in `<template v-if="!coverage || paneTab === 'preview'">` (from the coverage feature). Change that condition to also exclude the real tab:
`<template v-if="(!coverage || paneTab === 'preview') && paneTab !== 'real'">`
(So: preview shows on the preview tab; coverage on coverage; real on real.)

Also widen the tab-bar `v-if` so the bar shows for button even without coverage: the bar currently renders `v-if="coverage"`. Change to `v-if="coverage || realRenderSupported"` so button (no curated anatomy → `coverage` is null) still gets a tab bar with Preview + Real.

- [ ] **Step 5: Run the App test + the routing regression**

Run: `npx vitest run src/app/App.coverage.test.ts src/app/App.preview-routing.test.ts`
Expected: PASS — Real tab present for button, absent for nav; routing unchanged.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(fidelity): Real render tab in the component pane (button)"
```

- [ ] **Step 8: `/browse` fidelity proof (the actual point — browser-only)**

```
npm run dev   # background
# in /browse: load assets/tokens-20260615-161804.zip, select button group, click the Real tab
$B js "const b=document.querySelector('[data-testid=real-ubutton], .p-4 button'); getComputedStyle(b).borderRadius+' / '+getComputedStyle(b).backgroundColor"
```
Expected: the radius/bg reflect the `button-*` token values (not Nuxt defaults) — the spike's question answered green. Screenshot it. Document the result in the PR/release notes. Stop the dev server.

## Self-Review

**1. Spec coverage:**
- `@tailwindcss/browser` lazy-loaded only when needed → Task 1 (dynamic import, gated by Real tab via `onMounted` in Task 2 / tab in Task 3). ✓
- `use-runtime-tailwind` composable → Task 1. ✓
- `LiveRealButton` real `<UButton :ui=recipe>` → Task 2. ✓
- "Real" tab (Preview|Coverage|Real), button-gated, aria → Task 3. ✓
- Testing split (jsdom plumbing + /browse fidelity) → Task 1 Step 6, Task 2/3 jsdom tests, Task 3 Step 8. ✓
- Out-of-scope (diff, composites, variant matrix, Figma-frame) omitted. ✓

**2. Placeholder scan:** none — every code step shows actual code. Task 1 Step 6 is an explicit `/browse` validation with a STOP condition, not a placeholder.

**3. Type consistency:** `ensureRuntimeTailwind(): Promise<void>` defined in Task 1, called in Task 2 (`LiveRealButton`). `usePreviewRecipe`/`representativeSizeClasses` reused with their real signatures. `paneTab` union widened consistently (Task 3). `LiveRealButton` props `{graph, componentName}` match its test + the App usage.

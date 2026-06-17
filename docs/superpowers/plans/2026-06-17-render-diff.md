# Render-vs-Tokens Diff (Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. NOTE: the actual fidelity verdict is browser-only (`getComputedStyle` + the runtime compiler); prefer INLINE execution so the `/browse` proof in Task 3 can run.

**Goal:** In the Real tab, diff the rendered `<UButton>`'s computed base styles against the recipe's intent and show a per-property ✓/✗ delta table.

**Architecture:** A pure `diffComputed` (maps → deltas, jsdom-testable). A presentational `RenderDeltaTable` (fixture-testable). A browser glue `computeRenderDiff` (extractArbitrary → hidden probe → getComputedStyle for both sides → diffComputed) wired into `LiveRealButton` after the compiler paints. The probe routes both sides through the browser's canonicalizer, so the differ is a plain string compare.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + jsdom (pure/plumbing), `/browse` (the real verdict), reuses `extractArbitrary`.

---

### Task 1: Pure differ — `diffComputed`

**Files:**
- Create: `src/app/render-diff.ts`
- Test: `src/app/render-diff.test.ts`

- [ ] **Step 1: Write the failing test** (`src/app/render-diff.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { diffComputed } from "./render-diff.js";

describe("diffComputed", () => {
  it("matches identical maps (no false deltas)", () => {
    const m = { backgroundColor: "rgb(86, 103, 167)", borderRadius: "4px" };
    const deltas = diffComputed(m, { ...m });
    expect(deltas.every((d) => d.match)).toBe(true);
    expect(deltas).toHaveLength(2);
  });

  it("flags a differing property with both values", () => {
    const deltas = diffComputed(
      { borderRadius: "8px", backgroundColor: "rgb(0, 0, 0)" },
      { borderRadius: "4px", backgroundColor: "rgb(0, 0, 0)" },
    );
    const radius = deltas.find((d) => d.property === "borderRadius")!;
    expect(radius.match).toBe(false);
    expect(radius.expected).toBe("8px");
    expect(radius.actual).toBe("4px");
    expect(deltas.find((d) => d.property === "backgroundColor")!.match).toBe(true);
  });

  it("treats a key missing from actual as a mismatch (actual empty)", () => {
    const deltas = diffComputed({ padding: "16px" }, {});
    expect(deltas[0]!.match).toBe(false);
    expect(deltas[0]!.actual).toBe("");
  });

  it("ignores trailing whitespace when comparing", () => {
    const deltas = diffComputed({ color: "rgb(1, 2, 3)" }, { color: "rgb(1, 2, 3) " });
    expect(deltas[0]!.match).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/render-diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/render-diff.ts`**

```ts
// Pure comparison of a recipe's intended computed styles (expected) vs the rendered
// element's computed styles (actual). One delta per expected property. Both sides arrive
// already getComputedStyle-normalized (see use-render-diff), so plain string equality is sound.

export interface RenderDelta {
  property: string;
  expected: string;
  actual: string;
  match: boolean;
}

export function diffComputed(
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
): RenderDelta[] {
  return Object.keys(expected).map((property) => {
    const exp = (expected[property] ?? "").trim();
    const act = (actual[property] ?? "").trim();
    return { property, expected: exp, actual: act, match: exp === act };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/render-diff.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/render-diff.ts src/app/render-diff.test.ts
git commit -m "feat(fidelity): diffComputed — pure expected-vs-actual computed-style differ"
```

---

### Task 2: Presentational `RenderDeltaTable.vue`

**Files:**
- Create: `src/app/components/RenderDeltaTable.vue`
- Test: `src/app/components/RenderDeltaTable.test.ts`

- [ ] **Step 1: Write the failing test** (`src/app/components/RenderDeltaTable.test.ts`)

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import type { RenderDelta } from "@core/../app/render-diff.js";

const deltas: RenderDelta[] = [
  { property: "backgroundColor", expected: "rgb(86, 103, 167)", actual: "rgb(86, 103, 167)", match: true },
  { property: "borderRadius", expected: "8px", actual: "4px", match: false },
];

describe("RenderDeltaTable", () => {
  it("renders one row per delta with expected/actual + a marker", () => {
    const w = mount(RenderDeltaTable, { props: { deltas } });
    const rows = w.findAll('[data-testid="render-delta"]');
    expect(rows).toHaveLength(2);
    const radius = w.find('[data-testid="render-delta"][data-property="borderRadius"]');
    expect(radius.attributes("data-match")).toBe("false");
    expect(radius.text()).toContain("8px");
    expect(radius.text()).toContain("4px");
    expect(radius.text()).toContain("✗");
  });

  it("shows an N/M match headline", () => {
    const w = mount(RenderDeltaTable, { props: { deltas } });
    expect(w.find('[data-testid="render-diff"]').text()).toContain("1/2");
  });

  it("renders nothing meaningful for an empty delta list", () => {
    const w = mount(RenderDeltaTable, { props: { deltas: [] } });
    expect(w.findAll('[data-testid="render-delta"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/RenderDeltaTable.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/app/components/RenderDeltaTable.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { RenderDelta } from "../render-diff.js";

const props = defineProps<{ deltas: readonly RenderDelta[] }>();

const matched = computed(() => props.deltas.filter((d) => d.match).length);
</script>

<template>
  <div v-if="deltas.length" data-testid="render-diff" class="mt-3 space-y-1">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
      Fidelity · {{ matched }}/{{ deltas.length }} match
    </div>
    <div role="list" class="space-y-0.5">
      <div
        v-for="d in deltas"
        :key="d.property"
        data-testid="render-delta"
        :data-property="d.property"
        :data-match="d.match"
        class="flex items-center gap-2 text-xs py-0.5 font-mono"
      >
        <span class="w-3 text-center" :class="d.match ? 'text-success' : 'text-error'">
          {{ d.match ? "✓" : "✗" }}
        </span>
        <span class="w-40 shrink-0">{{ d.property }}</span>
        <span class="text-muted">{{ d.expected }}</span>
        <span v-if="!d.match" class="text-error">→ {{ d.actual }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/RenderDeltaTable.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RenderDeltaTable.vue src/app/components/RenderDeltaTable.test.ts
git commit -m "feat(fidelity): RenderDeltaTable — presentational per-property delta list"
```

---

### Task 3: Browser glue + wire into LiveRealButton

**Files:**
- Create: `src/app/composables/use-render-diff.ts`
- Test: `src/app/composables/use-render-diff.test.ts`
- Modify: `src/app/components/LiveRealButton.vue`

- [ ] **Step 1: Write the failing test** (`src/app/composables/use-render-diff.test.ts`) — jsdom can't resolve Tailwind/var, so test only the safe-guards:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeRenderDiff } from "./use-render-diff.js";

describe("computeRenderDiff", () => {
  it("returns [] when the base classes carry no extractable arbitrary styles", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    expect(computeRenderDiff(el, "inline-flex items-center")).toEqual([]);
    el.remove();
  });

  it("returns one delta per extracted property (keys come from extractArbitrary)", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    // rounded-[8px] + bg-[#fff] extract to borderRadius + backgroundColor
    const deltas = computeRenderDiff(el, "rounded-[8px] bg-[#ffffff]");
    const props = deltas.map((d) => d.property).sort();
    expect(props).toContain("borderRadius");
    expect(props).toContain("backgroundColor");
    el.remove();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/composables/use-render-diff.ts`**

```ts
// Browser glue for the render-vs-tokens diff: resolve the recipe's base classes to expected
// computed values via a hidden probe, read the rendered element's actual computed values, and
// diff them. Both sides go through getComputedStyle so the comparison is a plain string match.
// Browser-only (getComputedStyle); jsdom returns empty computed values, so the real verdict is /browse.

import { extractArbitrary } from "../extract-arbitrary.js";
import { diffComputed, type RenderDelta } from "../render-diff.js";

export function computeRenderDiff(el: Element, baseClasses: string): RenderDelta[] {
  if (typeof document === "undefined") return [];
  const { style } = extractArbitrary(baseClasses);
  const keys = Object.keys(style);
  if (keys.length === 0) return [];

  const probe = document.createElement("div");
  Object.assign(probe.style, style); // camelCase CSSProperties → CSSStyleDeclaration
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const probeCs = getComputedStyle(probe) as unknown as Record<string, string>;
  const actualCs = getComputedStyle(el) as unknown as Record<string, string>;
  const expected: Record<string, string> = {};
  const actual: Record<string, string> = {};
  for (const k of keys) {
    expected[k] = String(probeCs[k] ?? "");
    actual[k] = String(actualCs[k] ?? "");
  }
  probe.remove();
  return diffComputed(expected, actual);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts`
Expected: PASS (2 tests). (In jsdom, `expected`/`actual` are empty strings so deltas all `match:true` with empty values — fine; the test only checks the property KEYS exist and the no-arbitrary case returns `[]`.)

- [ ] **Step 5: Wire it into `LiveRealButton.vue`.**

Replace the `<script setup>` block to add the host ref, the deltas ref, and the post-paint refresh; and the template to add the host ref + `<RenderDeltaTable>`. New script:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeRenderDiff } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import type { RenderDelta } from "../render-diff.js";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const variantKey = computed<string | null>(() => {
  const v = recipe.value?.variants.variant ?? {};
  const keys = Object.keys(v);
  return keys.includes("solid") ? "solid" : keys[0] ?? null;
});

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

const hostRef = ref<HTMLElement | null>(null);
const deltas = ref<RenderDelta[]>([]);

async function refreshDiff(): Promise<void> {
  await ensureRuntimeTailwind();
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const el = hostRef.value?.querySelector("button");
  const base = ui.value?.base;
  deltas.value = el && base ? computeRenderDiff(el, base) : [];
}

onMounted(refreshDiff);
watch([() => props.graph, () => props.componentName], refreshDiff);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <UButton :ui="ui" :variant="variantKey ?? undefined" size="md">Button</UButton>
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable :deltas="deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 6: Run LiveRealButton's existing tests + the full suite**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts && npm test`
Expected: LiveRealButton's Spec-1 tests still pass (the button still renders; `deltas` is `[]` in jsdom so the table is absent — its `v-if="deltas.length"` hides it). Full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts src/app/components/LiveRealButton.vue
git commit -m "feat(fidelity): render-vs-tokens diff wired into the Real tab (base slot)"
```

- [ ] **Step 8: `/browse` fidelity verdict (the real point — browser-only)**

```
npm run dev   # background
# /browse: load assets/tokens-20260615-161804.zip, select button group, click Real tab, wait ~2s
$B js "const t=document.querySelector('[data-testid=render-diff]'); t? t.innerText : 'no diff table'"
$B js "[...document.querySelectorAll('[data-testid=render-delta]')].map(r=>r.getAttribute('data-property')+':'+r.getAttribute('data-match')).join(' | ')"
```
Expected: a delta table with rows for the base properties; a faithful pipeline reads mostly/all ✓.
Then inject a deliberate override and re-check it flips a row to ✗:
```
$B js "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Button'); b.style.borderRadius='99px';"
# (the table is computed once on mount; to see it react, the override must precede the diff — instead, confirm the ✗ path by reading a known Nuxt-override property, or document the all-✓ baseline)
```
Screenshot the table. Document the all-✓ baseline (and any genuine ✗ the real export surfaces — those are real findings). Stop the dev server.

## Self-Review

**1. Spec coverage:**
- Pure `diffComputed` + `RenderDelta` (one delta per expected key, string-equality, missing→mismatch) → Task 1. ✓
- Browser `computeRenderDiff`: extractArbitrary → probe → getComputedStyle both sides → diffComputed → Task 3. ✓
- `LiveRealButton` surfaces deltas (host ref, post-paint refresh, RenderDeltaTable) → Task 3. ✓
- Delta table UI (per-property expected/actual/✓-✗ + N/M headline) → Task 2 (`RenderDeltaTable`). ✓
- Testing split (pure unit + table mount + /browse verdict) → Tasks 1/2 jsdom, Task 3 Step 8 /browse. ✓
- Scope (base slot, button, resting variant, extractArbitrary property set) + out-of-scope honored. ✓

**2. Placeholder scan:** none — every code step shows real code. Task 3 Step 8 is an explicit /browse procedure.

**3. Type consistency:** `RenderDelta {property, expected, actual, match}` defined in Task 1, imported by `RenderDeltaTable` (Task 2), `computeRenderDiff` (Task 3), and `LiveRealButton` (Task 3). `diffComputed(expected, actual)` signature consistent. `computeRenderDiff(el, baseClasses)` matches its test + the LiveRealButton call. `extractArbitrary` returns `{ classes, style }` (confirmed) — `.style` is the camelCase CSS map applied to the probe.

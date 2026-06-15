# Tier-2 Component Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live previews for `modal`, `dropdown`, `accordion`, `nav`, `table`, reusing the v0.26.0 pattern (`usePreviewRecipe` + `extractArbitrary(projectToState(...))` → inline styles; fallback when no tokens; wired into both App.vue chains).

**Tech Stack:** Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom), `@core/*`→`./src/*`. Pre-commit runs `vue-tsc` + full vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-tier2-previews-design.md`

**Shared facts:**
- Props for every preview: `{ graph: TokenGraph|null; componentName?: string; highlightUtility?: string; completeness?: ReadonlyArray<CompletenessScore> }`.
- `const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);` — fallback `<p>No …</p>` when `!recipe`.
- `extractArbitrary(classes) → { classes, style }`; `projectToState(classes, state)` promotes that state's pseudo-prefixed classes.
- **Test fixtures use literal hex colors** (not aliases) so inline styles are literal and jsdom retains them.
- **Wiring gotcha:** `LiveButton` is the catch-all final `v-else-if` in BOTH chains. Add each name to `COMPONENTS_WITH_PREVIEW` AND a branch in both chains (before `LiveButton`) together. Chain-1 gate: `previewSupported && selectedComponent === '<n>' && selectedNode.id.split('-')[0] === selectedComponent` (+`:highlight-utility`). Chain-2 gate: `previewSupported && selectedComponent === '<n>'` (no highlight-utility). Anchor each chain's edit on its distinct `LiveButton` block.

Each task: write test → run (FAIL) → create SFC → run (PASS) → wire into App.vue → `npm test` (App.test mounts App) → commit.

---

### Task 1: LiveModal

Test `src/app/components/LiveModal.test.ts` — fixture `{ modal: { bg:{#FFFFFF,color}, "overlay-bg":{rgba(0,0,0,0.5)? use "#000000",color}, padding:{12,number}, radius:{12,number}, border:{#E4E4E7,color} } }`. Assert: `graph:null` → `0` `[data-testid="modal-overlay"]`; with graph → `modal-overlay` + `modal-content` exist, `modal-content` `style.backgroundColor !== ""`.

SFC `src/app/components/LiveModal.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props { graph: TokenGraph | null; componentName?: string; highlightUtility?: string; completeness?: ReadonlyArray<CompletenessScore>; }
const props = withDefaults(defineProps<Props>(), { componentName: "modal", highlightUtility: undefined, completeness: undefined });

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const overlay = computed(() => extractArbitrary(recipe.value?.slots["overlay"] ?? ""));
const content = computed(() => extractArbitrary(recipe.value?.slots["content"] ?? ""));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.</p>
    <template v-else>
      <div data-testid="modal-overlay" class="flex items-center justify-center p-6 rounded-md" :class="overlay.classes" :style="overlay.style">
        <div data-testid="modal-content" class="max-w-xs w-full" :class="content.classes" :style="content.style">
          <p class="font-medium">Modal title</p>
          <p class="text-sm text-zinc-500">Modal body content.</p>
        </div>
      </div>
    </template>
  </div>
</template>
```

Wire: import `LiveModal`; `COMPONENTS_WITH_PREVIEW` += `"modal"`; branch in both chains. Commit `feat(app): LiveModal preview (content on overlay)`.

---

### Task 2: LiveTable

Test `LiveTable.test.ts` — fixture `{ table: { bg:{#FFFFFF}, border:{#E4E4E7}, radius:{8}, "th-bg":{#F4F4F5}, "th-text":{#52525B}, "td-text":{#18181B} } }` (all colors literal, `$type:"color"`; radius `$type:"number"`). Assert: fallback on null; with graph → `table-root` exists, ≥1 `table-th` with `style.backgroundColor !== ""`, ≥1 `table-td` with `style.color !== ""`.

SFC `LiveTable.vue` — script builds `base`/`th`/`td` via `extractArbitrary(recipe.value?.slots[...] ?? "")`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props { graph: TokenGraph | null; componentName?: string; highlightUtility?: string; completeness?: ReadonlyArray<CompletenessScore>; }
const props = withDefaults(defineProps<Props>(), { componentName: "table", highlightUtility: undefined, completeness: undefined });

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const base = computed(() => extractArbitrary(recipe.value?.slots["base"] ?? ""));
const th = computed(() => extractArbitrary(recipe.value?.slots["th"] ?? ""));
const td = computed(() => extractArbitrary(recipe.value?.slots["td"] ?? ""));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.</p>
    <template v-else>
      <div data-testid="table-root" class="max-w-sm overflow-hidden" :class="base.classes" :style="base.style">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr>
              <th data-testid="table-th" class="px-3 py-1.5 font-medium" :class="th.classes" :style="th.style">Name</th>
              <th data-testid="table-th" class="px-3 py-1.5 font-medium" :class="th.classes" :style="th.style">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Row one</td>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Active</td>
            </tr>
            <tr>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Row two</td>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Idle</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
```

Wire `"table"` + branches. Commit `feat(app): LiveTable preview (base/th/td)`.

---

### Task 3: LiveDropdown

Test `LiveDropdown.test.ts` — fixture `{ dropdown: { bg:{#FFFFFF}, border:{#E4E4E7}, radius:{8}, "item-bg-hover":{#F4F4F5}, "item-bg-active":{#E4E4E7}, "item-padding":{8,number}, "item-radius":{6,number}, "item-text":{#18181B} } }`. Assert: fallback on null; with graph → `dropdown-content` exists, exactly `3` `dropdown-item` rows, the hover row (index 1) has `style.backgroundColor !== ""`.

SFC `LiveDropdown.vue` — script:

```ts
import { computed, type CSSProperties } from "vue";
// + usePreviewRecipe, extractArbitrary, projectToState, types
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const content = computed(() => extractArbitrary(recipe.value?.slots["content"] ?? ""));
interface Row { label: string; classes: string; style: CSSProperties; }
const items = computed<Row[]>(() => {
  const item = recipe.value?.slots["item"] ?? "";
  if (!item) return [];
  return (["default", "hover", "active"] as const).map((s) => {
    const { classes, style } = extractArbitrary(projectToState(item, s));
    return { label: s === "default" ? "Item" : s === "hover" ? "Hovered" : "Active", classes, style };
  });
});
```

Template: a `dropdown-content` surface (`:class="content.classes" :style="content.style"`, `class="max-w-xs w-full p-1 space-y-0.5"`) containing `<div v-for="row in items" data-testid="dropdown-item" :class="row.classes" :style="row.style">{{ row.label }}</div>`; plus the fallback `<p>`. Wire `"dropdown"` + branches. Commit `feat(app): LiveDropdown preview (content + item states)`.

---

### Task 4: LiveAccordion

Test `LiveAccordion.test.ts` — fixture `{ accordion: { "item-text":{#52525B,color}, "item-padding-y":{14,number}, "item-border":{#E4E4E7,color} } }`. Assert: fallback on null; with graph → exactly `2` `accordion-item` rows, the first (default) row has a non-empty `style` (e.g. `style.color !== ""`).

SFC `LiveAccordion.vue` — script mirrors LiveDropdown but states `["default", "disabled"]` on `slots.item`, labels "Section" / "Disabled", `data-testid="accordion-item"`, rows stacked (`class="space-y-1"` container). Wire `"accordion"` + branches. Commit `feat(app): LiveAccordion preview (item states)`.

---

### Task 5: LiveNav

Test `LiveNav.test.ts` — fixture `{ nav: { "item-outline-text":{#52525B,color}, "item-ghost-text":{#71717A,color} } }` (variant-after-sub-element → `variants.variant.{outline,ghost}.item`). Assert: fallback on null; with graph → one `nav-item` row per variant present (here `2`), each with `style.color !== ""`.

SFC `LiveNav.vue` — script:

```ts
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
interface Row { label: string; classes: string; style: CSSProperties; }
const variants = computed<Row[]>(() => {
  const base = recipe.value?.slots["item"] ?? "";
  const vmap = (recipe.value?.variants?.variant ?? {}) as Record<string, { item?: string }>;
  return Object.keys(vmap).map((key) => {
    const merged = [base, vmap[key]?.item ?? ""].filter((s) => s.length > 0).join(" ");
    const { classes, style } = extractArbitrary(projectToState(merged, "default"));
    return { label: key, classes, style };
  });
});
```

Template: fallback `<p>`; else a `space-y-1` column of `<div v-for="row in variants" data-testid="nav-item" :class="row.classes" :style="row.style">{{ row.label }}</div>`. Wire `"nav"` + branches. Commit `feat(app): LiveNav preview (per-variant item rows)`.

---

### Task 6: Verify + release

- [ ] `npm test` (full) + `npm run typecheck` — expect green.
- [ ] (optional) `npm run dev`, load the live export, click modal/dropdown/accordion/nav/table, confirm renders.
- [ ] **Release v0.27.0** — bump `package.json`; `CHANGELOG.md` entry (Tier-2 previews modal/dropdown/accordion/nav/table; representative fidelity; Tier-3 chip/sidebar deferred); README roadmap row + "Next" (Tier-3 + data-blocked items); commit `chore(release): v0.27.0 — modal/dropdown/accordion/nav/table previews`, tag `v0.27.0`; merge `--ff-only` to `main`, push (`gh auth switch --user clawdbot3535` if 403, back to `d56de`), publish GitHub Release, delete branch.

---

## Self-Review

- **Spec coverage:** modal → T1, table → T2, dropdown → T3, accordion → T4, nav → T5, release → T6.
- **Placeholder scan:** T1/T2 have full SFCs; T3/T4/T5 give the differing script logic + the (identical-shape) template structure described concretely (testids, container classes, v-for source) — unambiguous given the LiveModal/LiveTable templates as the pattern.
- **Type consistency:** all use `usePreviewRecipe(() => props.graph, () => props.componentName)`; `extractArbitrary`/`projectToState` signatures as in the existing previews; props shape matches existing previews + App.vue bindings; `recipe.variants.variant` is `Record<string,{item?:string}>` (cast in LiveNav).
- **Wiring:** each task adds its `COMPONENTS_WITH_PREVIEW` name + both-chain branches together (never a name without a branch).

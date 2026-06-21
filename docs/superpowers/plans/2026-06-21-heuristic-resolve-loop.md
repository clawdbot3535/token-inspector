# (Y) v1 — Heuristic-Extension Resolution Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user resolve a "slot-mapping heuristic can't place this token" deviation by generating a `slot-mapping.json` override, applying it live (the Kit render updates in-session), and downloading it — the Heuristic-Extension owner of (Y), end to end.

**Architecture:** A pure `src/app/resolve/` module classifies the heuristic-extendable deviations + guesses an override per token. App.vue owns a session override ref and **provides** it; `usePreviewRecipe` **injects** it and threads it into the existing `buildComponentRecipes(graph, { slotMappingOverride })` (the override param already exists — no engine change). A `ResolvePanel.vue` edits the override; `ScanView` gets a Resolve affordance; the accumulated override exports as `slot-mapping.json`.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), Vitest + @vue/test-utils. Reuses `@tg/grammar` (`SlotMappingEntry`/`UtilityType`/`nuxtSlotsFor`/`defaultBaseSlot`) + `@core/recipe-engine` + `@core/slot-mapping-loader`.

---

## File Structure
- **Create `src/app/resolve/override-key.ts`** — the Vue `InjectionKey` shared by App.vue (provide) + `usePreviewRecipe` (inject).
- **Create `src/app/resolve/heuristic-extendable.ts`** — `heuristicExtendable(report) → ResolvableDeviation[]` + `guessUtilityType`.
- **Create `src/app/resolve/export-slot-mapping.ts`** — `buildSlotMappingFile(override) → string`.
- **Create `src/app/components/ResolvePanel.vue`** — the override editor.
- **Modify `src/app/composables/use-preview-recipe.ts`** — inject the override + thread it.
- **Modify `src/app/components/ScanView.vue`** — a Resolve affordance per heuristic-extendable issue.
- **Modify `src/app/App.vue`** — the session override ref, `provide`, ResolvePanel host, apply handler, download button.
- **Create matching `*.test.ts`** for the pure modules + ResolvePanel.

**Verified facts (recon, exact):**
- `SlotMappingEntry = { slot: string; utilityType: UtilityType; variantAxis: "size"|"color"|"variant"|null; variantKey: string|null; statePrefix?: string|null }`; `SlotMappingOverride = Readonly<Record<string, SlotMappingEntry|null>>` (both from `@tg/grammar`).
- `UtilityType` (24): `"padding-x"|"padding-y"|"rounded"|"font-weight"|"text-size"|"gap"|"icon-size"|"size"|"bg-color"|"text-color"|"border-color"|"border-width"|"ring-color"|"ring-width"|"underline-color"|"height"|"width"|"line-height"|"letter-spacing"|"placeholder-color"|"ring-offset"|"font-family"|"padding"|"overlay-bg"`.
- `buildComponentRecipes(graph, { components, slotMappingOverride? , ... })` (`src/recipe-engine.ts:151,165`) — override checked **before** heuristic. An empty `{}` override = no-op (heuristic fallback).
- `nuxtSlotsFor(component): ReadonlySet<string>|undefined`; `defaultBaseSlot(component): string` (from `@tg/grammar` / `component-vocab.ts`).
- `ScanIssue = { id; category; severity; kind; message; tokenIds: readonly string[]; componentName?: string; customParts?: readonly string[] }` (`src/token-graph.ts:167`).
- `useScanReport(graph) → ComputedRef<ScanReport>` (`.issues`) (`src/app/composables/use-scan-report.ts`).
- All live previews go through `usePreviewRecipe(() => props.graph, () => props.componentName)` (the LiveReal* components) — one seam.
- `SlotMappingFile = { components?; overrides?: SlotMappingOverride }` (`src/slot-mapping-loader.ts`); `parseSlotMappingFile(json)` round-trips it.
- App.vue already has `scanReport = useScanReport(state.graph)` (line ~102) + `downloadBlob` (in `./zip.js`).
- HEURISTIC-EXTENDABLE kinds for v1: **`unsupported-part`** and **`component-looks-custom`** ONLY. NOT `state-via-prop` / `unsupported-state` (by-design constraints, a different owner).

---

### Task 1: `heuristicExtendable` + `guessUtilityType` (pure classifier)

**Files:**
- Create: `src/app/resolve/heuristic-extendable.ts`
- Test: `src/app/resolve/heuristic-extendable.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/resolve/heuristic-extendable.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import { scanGraph } from "@core/scanner.js";
import type { SourceFile } from "@core/token-graph.js";
import { heuristicExtendable, guessUtilityType } from "./heuristic-extendable.js";

// `button-mystery-bg`: 2nd segment "mystery" is not a Nuxt slot → unsupported-part.
function mysteryGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { mystery: { bg: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("guessUtilityType", () => {
  it("guesses from the token name suffix", () => {
    expect(guessUtilityType("button-mystery-bg")).toBe("bg-color");
    expect(guessUtilityType("button-foo-padding-x")).toBe("padding-x");
    expect(guessUtilityType("button-foo-radius")).toBe("rounded");
  });
});

describe("heuristicExtendable", () => {
  it("returns a resolvable for an unsupported-part token with candidate slots + a guess", () => {
    const report = scanGraph(mysteryGraph(), { components: ["button"] });
    const resolvables = heuristicExtendable(report);
    const r = resolvables.find((x) => x.tokenId === "button-mystery-bg");
    expect(r, "expected button-mystery-bg to be resolvable").toBeDefined();
    expect(r!.component).toBe("button");
    expect(r!.candidateSlots).toContain("base"); // nuxtSlotsFor("button") includes base
    expect(r!.guess.utilityType).toBe("bg-color");
    expect(typeof r!.guess.slot).toBe("string");
  });

  it("ignores by-design kinds (no state-via-prop / unsupported-state)", () => {
    const report = scanGraph(mysteryGraph(), { components: ["button"] });
    const kinds = new Set(heuristicExtendable(report).map((r) => r.kind));
    expect(kinds.has("state-via-prop")).toBe(false);
    expect(kinds.has("unsupported-state")).toBe(false);
  });
});
```
(If `button-mystery-bg` doesn't produce `unsupported-part` for this fixture, grep `scanner.ts` around line 312-350 for the exact trigger and adjust the token path so the 2nd segment is a non-slot, non-NON_PART word. The intent: one `unsupported-part` resolvable.)

- [ ] **Step 2: Run to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/app/resolve/heuristic-extendable.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement.** Create `src/app/resolve/heuristic-extendable.ts`:

```ts
import type { ScanReport } from "@core/token-graph.js";
import type { SlotMappingEntry, UtilityType } from "@tg/grammar";
import { nuxtSlotsFor, defaultBaseSlot } from "@tg/grammar";

/** The deviation kinds v1 can resolve by extending the slot-mapping heuristic. */
const HEURISTIC_EXTENDABLE_KINDS: ReadonlySet<string> = new Set([
  "unsupported-part",
  "component-looks-custom",
]);

/** Ordered suffix → utilityType guesses (first match wins; order matters — the
 *  more specific patterns come first). A best guess the user can override. */
const SUFFIX_UTILITY: ReadonlyArray<readonly [RegExp, UtilityType]> = [
  [/padding-x$/, "padding-x"],
  [/padding-y$/, "padding-y"],
  [/padding$/, "padding"],
  [/(radius|rounded)$/, "rounded"],
  [/border-width$/, "border-width"],
  [/border(-color)?$/, "border-color"],
  [/ring-width$/, "ring-width"],
  [/ring(-color)?$/, "ring-color"],
  [/gap$/, "gap"],
  [/icon(-size)?$/, "icon-size"],
  [/(font-weight|weight)$/, "font-weight"],
  [/(text-size)$/, "text-size"],
  [/height$/, "height"],
  [/width$/, "width"],
  [/(bg|background)$/, "bg-color"],
  [/(text|fg|foreground|color)$/, "text-color"],
];

export function guessUtilityType(tokenId: string): UtilityType {
  for (const [re, ut] of SUFFIX_UTILITY) {
    if (re.test(tokenId)) return ut;
  }
  return "bg-color"; // sensible default; the user adjusts via the dropdown
}

export type ResolvableDeviation = {
  tokenId: string;
  component: string;
  kind: string;
  candidateSlots: string[];
  guess: SlotMappingEntry;
};

/** Classifies the report's heuristic-extendable issues into resolvable
 *  deviations, each with candidate slots + a best-guess override entry. Pure. */
export function heuristicExtendable(report: ScanReport): ResolvableDeviation[] {
  const out: ResolvableDeviation[] = [];
  const seen = new Set<string>();
  for (const issue of report.issues) {
    if (!HEURISTIC_EXTENDABLE_KINDS.has(issue.kind)) continue;
    for (const tokenId of issue.tokenIds) {
      if (seen.has(tokenId)) continue;
      seen.add(tokenId);
      const component = issue.componentName ?? tokenId.split("-")[0] ?? tokenId;
      const slots = [...(nuxtSlotsFor(component) ?? new Set<string>())];
      const candidateSlots = [...new Set([...slots, ...(issue.customParts ?? [])])];
      out.push({
        tokenId,
        component,
        kind: issue.kind,
        candidateSlots,
        guess: {
          slot: defaultBaseSlot(component),
          utilityType: guessUtilityType(tokenId),
          variantAxis: null,
          variantKey: null,
          statePrefix: null,
        },
      });
    }
  }
  return out;
}
```
(Confirm `@tg/grammar` re-exports `nuxtSlotsFor`, `defaultBaseSlot`, `SlotMappingEntry`, `UtilityType` — `grep -n "nuxtSlotsFor\|defaultBaseSlot\|SlotMappingEntry" packages/grammar/src/index.ts`. If a name isn't on the barrel, add the export there or import from the deep path the rest of `src/` uses.)

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/resolve/heuristic-extendable.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/resolve/heuristic-extendable.ts src/app/resolve/heuristic-extendable.test.ts
git commit -m "feat(resolve): heuristicExtendable classifier + utilityType guess"
```

---

### Task 2: The live override seam (provide/inject) + the routing behaviour test

**Files:**
- Create: `src/app/resolve/override-key.ts`
- Modify: `src/app/composables/use-preview-recipe.ts`
- Test: `src/app/resolve/override-routing.test.ts` (engine-level) + extend `src/app/composables/use-preview-recipe.test.ts` (inject wiring)

- [ ] **Step 1: Write the failing test (the core behaviour — override routes a token).** Create `src/app/resolve/override-routing.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { SourceFile } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";

function mysteryGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { mystery: { radius: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("slotMappingOverride routes a previously-unmapped token", () => {
  it("places button-mystery-radius into base/rounded when overridden", () => {
    const g = mysteryGraph();
    const override: SlotMappingOverride = {
      "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const withOverride = buildComponentRecipes(g, { components: ["button"], slotMappingOverride: override })["button"];
    const without = buildComponentRecipes(g, { components: ["button"] })["button"];
    // the override makes the token land in base; the heuristic-only build differs
    expect(JSON.stringify(withOverride)).not.toBe(JSON.stringify(without));
    expect(withOverride?.slots?.base ?? "").toContain("rounded");
  });
});
```
(If `rounded`+`8` emits `rounded-*` not literally "rounded", assert on the emitted class shape you observe — the point is the overridden token now appears in `slots.base` whereas without the override it doesn't. Adjust the assertion to the real emitted class.)

- [ ] **Step 2: Run to verify it passes ALREADY (characterisation).**
Run: `npx vitest run src/app/resolve/override-routing.test.ts`
Expected: PASS (the engine already supports the override; this guards the behaviour the live loop depends on). If it FAILS, the override mechanism differs from recon — STOP and report.

- [ ] **Step 3: Create the injection key.** Create `src/app/resolve/override-key.ts`:

```ts
import type { InjectionKey, Ref } from "vue";
import type { SlotMappingOverride } from "@tg/grammar";

/** Session slot-mapping override, provided by App.vue and injected by
 *  usePreviewRecipe so the live Kit render reflects applied resolutions.
 *  An empty `{}` override is a no-op (the recipe engine falls back to the
 *  heuristic for unkeyed tokens). */
export const RESOLVE_OVERRIDE_KEY: InjectionKey<Ref<SlotMappingOverride>> = Symbol("resolve-override");
```

- [ ] **Step 4: Thread the override through `usePreviewRecipe`.** In `src/app/composables/use-preview-recipe.ts`, add the inject + pass it to the recipe build. Change the imports + the `usePreviewRecipe` body:

```ts
import { computed, inject, ref, type ComputedRef } from "vue";
import { buildComponentRecipes, type ComponentRecipe } from "@core/recipe-engine.js";
import { buildCustomRecipes } from "@core/custom-recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { RESOLVE_OVERRIDE_KEY } from "../resolve/override-key.js";
```
and inside `usePreviewRecipe`, before the `recipe` computed:
```ts
  const override = inject(RESOLVE_OVERRIDE_KEY, ref<SlotMappingOverride>({}));
```
then change the build call:
```ts
    return buildComponentRecipes(g, { components: [name], slotMappingOverride: override.value })[name] ?? null;
```
(`inject(..., ref({}))` supplies a default empty override when no provider exists — so existing direct-call tests and non-App usage keep current behaviour. Leave `useCustomPreviewRecipe` unchanged.)

- [ ] **Step 5: Add an inject-wiring test.** Append to `src/app/composables/use-preview-recipe.test.ts` a test that, with a provided override, the recipe reflects it. Read the existing test file first to match its setup; add:

```ts
// (uses @vue/test-utils to provide the injection key; mirror the file's imports)
import { defineComponent, ref, h } from "vue";
import { mount } from "@vue/test-utils";
import { RESOLVE_OVERRIDE_KEY } from "../../resolve/override-key.js";
// ...
it("applies an injected slot-mapping override to the built recipe", () => {
  const g = mysteryGraph(); // a graph with button-mystery-radius (see Task 1/2 fixtures)
  let captured: any = null;
  const Probe = defineComponent({
    setup() {
      const { recipe } = usePreviewRecipe(() => g, () => "button");
      captured = recipe;
      return () => h("div");
    },
  });
  mount(Probe, {
    global: {
      provide: {
        [RESOLVE_OVERRIDE_KEY as symbol]: ref({
          "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
        }),
      },
    },
  });
  expect(JSON.stringify(captured.value)).toContain("rounded");
});
```
(If the existing test file has no `mysteryGraph` helper, inline the 3-line `buildGraph` fixture. Provide-by-symbol-key in @vue/test-utils uses the symbol as the object key.)

- [ ] **Step 6: Run + typecheck.**
Run: `npx vitest run src/app/resolve/override-routing.test.ts src/app/composables/use-preview-recipe.test.ts && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit.**
```bash
git add src/app/resolve/override-key.ts src/app/composables/use-preview-recipe.ts src/app/resolve/override-routing.test.ts src/app/composables/use-preview-recipe.test.ts
git commit -m "feat(resolve): inject session slot-mapping override into the live recipe build"
```

---

### Task 3: `ResolvePanel.vue` — the override editor

**Files:**
- Create: `src/app/components/ResolvePanel.vue`
- Test: `src/app/components/ResolvePanel.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/components/ResolvePanel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResolvePanel from "./ResolvePanel.vue";
import type { ResolvableDeviation } from "../resolve/heuristic-extendable.js";

const deviation: ResolvableDeviation = {
  tokenId: "button-mystery-bg",
  component: "button",
  kind: "unsupported-part",
  candidateSlots: ["base", "label"],
  guess: { slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: null },
};
const stubs = {
  UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' },
  USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="i in items" :key="i" :value="i">{{ i }}</option></select>' },
};

describe("ResolvePanel", () => {
  it("pre-fills from the guess and emits apply with the entry on click", async () => {
    const wrapper = mount(ResolvePanel, { props: { deviation }, global: { stubs } });
    await wrapper.get("[data-testid=resolve-apply]").trigger("click");
    const ev = wrapper.emitted("apply");
    expect(ev).toBeTruthy();
    const [tokenId, entry] = ev![0] as [string, any];
    expect(tokenId).toBe("button-mystery-bg");
    expect(entry.slot).toBe("base");
    expect(entry.utilityType).toBe("bg-color");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/ResolvePanel.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement.** Create `src/app/components/ResolvePanel.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { SlotMappingEntry, UtilityType, VariantAxis } from "@tg/grammar";
import type { ResolvableDeviation } from "../resolve/heuristic-extendable.js";

const props = defineProps<{ deviation: ResolvableDeviation }>();
const emit = defineEmits<{ (e: "apply", tokenId: string, entry: SlotMappingEntry): void }>();

const UTILITY_TYPES: readonly UtilityType[] = [
  "padding-x", "padding-y", "padding", "rounded", "gap", "icon-size", "size",
  "font-weight", "text-size", "line-height", "letter-spacing", "font-family",
  "bg-color", "text-color", "border-color", "border-width", "ring-color",
  "ring-width", "underline-color", "placeholder-color", "ring-offset",
  "height", "width", "overlay-bg",
];
const AXES: readonly (VariantAxis | "none")[] = ["none", "size", "color", "variant"];

const slot = ref<string>(props.deviation.guess.slot);
const utilityType = ref<UtilityType>(props.deviation.guess.utilityType);
const axis = ref<VariantAxis | "none">(props.deviation.guess.variantAxis ?? "none");
const variantKey = ref<string>(props.deviation.guess.variantKey ?? "");
const statePrefix = ref<string>(props.deviation.guess.statePrefix ?? "");

function apply(): void {
  if (!slot.value) return;
  emit("apply", props.deviation.tokenId, {
    slot: slot.value,
    utilityType: utilityType.value,
    variantAxis: axis.value === "none" ? null : axis.value,
    variantKey: variantKey.value.trim() === "" ? null : variantKey.value.trim(),
    statePrefix: statePrefix.value.trim() === "" ? null : statePrefix.value.trim(),
  });
}
</script>

<template>
  <div class="flex flex-col gap-2 text-xs" data-testid="resolve-panel">
    <div class="font-mono text-zinc-700 dark:text-zinc-300">{{ deviation.tokenId }}</div>
    <label class="flex items-center gap-2">slot
      <USelect v-model="slot" :items="deviation.candidateSlots" data-testid="resolve-slot" />
    </label>
    <label class="flex items-center gap-2">utility
      <USelect v-model="utilityType" :items="UTILITY_TYPES" data-testid="resolve-utility" />
    </label>
    <label class="flex items-center gap-2">axis
      <USelect v-model="axis" :items="AXES" />
    </label>
    <label v-if="axis !== 'none'" class="flex items-center gap-2">variant key
      <input v-model="variantKey" class="border rounded px-1" />
    </label>
    <label class="flex items-center gap-2">state prefix
      <input v-model="statePrefix" placeholder="(none)" class="border rounded px-1" />
    </label>
    <p class="text-zinc-500">before: unmapped → after: <code>{{ slot }}</code> / <code>{{ utilityType }}</code></p>
    <div>
      <UButton size="xs" :disabled="!slot" data-testid="resolve-apply" @click="apply">Apply</UButton>
    </div>
  </div>
</template>
```
(If `USelect`'s real @nuxt/ui API differs (e.g. `items` shape), the stub in the test already abstracts it; in the app it renders the real USelect — confirm `items` accepts a string array in this @nuxt/ui version, else map to `{label,value}`. Keep the `v-model` contract.)

- [ ] **Step 4: Run + typecheck.**
Run: `npx vitest run src/app/components/ResolvePanel.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit.**
```bash
git add src/app/components/ResolvePanel.vue src/app/components/ResolvePanel.test.ts
git commit -m "feat(resolve): ResolvePanel override editor"
```

---

### Task 4: Wire into App.vue (session override + provide) + ScanView affordance

**Files:**
- Modify: `src/app/App.vue`, `src/app/components/ScanView.vue`
- Test: a focused `src/app/components/ScanView.resolve.test.ts`

- [ ] **Step 1: Write the failing test (ScanView surfaces a Resolve affordance).** Create `src/app/components/ScanView.resolve.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport } from "@core/token-graph.js";

function reportWith(kind: string): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "warning", kind, message: "m", tokenIds: ["button-mystery-bg"], componentName: "button" }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView resolve affordance", () => {
  it("shows a Resolve button for a heuristic-extendable issue and emits resolve with the tokenId", async () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("unsupported-part") }, global: { stubs } });
    const btn = wrapper.find("[data-testid=resolve-issue]");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(wrapper.emitted("resolve")?.[0]?.[0]).toBe("button-mystery-bg");
  });

  it("shows NO Resolve button for a non-extendable issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("malformed-value") }, global: { stubs } });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/ScanView.resolve.test.ts`
Expected: FAIL — no `resolve-issue` button / no `resolve` emit.

- [ ] **Step 3: Implement the ScanView affordance.** In `src/app/components/ScanView.vue`:
  - Add to the imports a heuristic-extendable check. At the top of `<script setup>`:
    ```ts
    import { heuristicExtendable } from "../resolve/heuristic-extendable.js";
    ```
  - Add a computed set of resolvable token ids + an emit. Near the existing `Emits` interface, extend it:
    ```ts
    interface Emits {
      (event: "select-tokens", tokenIds: readonly string[]): void;
      (event: "resolve", tokenId: string): void;
    }
    ```
    and add:
    ```ts
    const resolvableTokenIds = computed<Set<string>>(
      () => new Set(heuristicExtendable(props.report).map((r) => r.tokenId)),
    );
    function issueResolvableToken(issue: ScanIssue): string | null {
      return issue.tokenIds.find((t) => resolvableTokenIds.value.has(t)) ?? null;
    }
    ```
    (Ensure `computed` is imported from `vue` in this file.)
  - In the issue row template (around line 119-130, the `v-for="issue in group.issues"` block), after the message span, add a Resolve button gated on resolvability:
    ```html
    <UButton
      v-if="issueResolvableToken(issue)"
      size="xs" variant="soft" class="ml-2"
      data-testid="resolve-issue"
      @click.stop="$emit('resolve', issueResolvableToken(issue)!)"
    >Resolve →</UButton>
    ```
    (`@click.stop` so it doesn't also trigger the row's `onIssueClick` select-tokens.)

- [ ] **Step 4: Run the ScanView test.**
Run: `npx vitest run src/app/components/ScanView.resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire App.vue — the session override + provide + ResolvePanel host + apply + download.** In `src/app/App.vue`:
  - Imports (near the other resolve/scan imports ~line 33-36):
    ```ts
    import { provide, ref } from "vue"; // merge into the existing vue import
    import ResolvePanel from "./components/ResolvePanel.vue";
    import { heuristicExtendable, type ResolvableDeviation } from "./resolve/heuristic-extendable.js";
    import { RESOLVE_OVERRIDE_KEY } from "./resolve/override-key.js";
    import { buildSlotMappingFile } from "./resolve/export-slot-mapping.js"; // Task 5
    import type { SlotMappingOverride, SlotMappingEntry } from "@tg/grammar";
    ```
  - The session override ref + provide (near `scanReport`, ~line 102):
    ```ts
    const resolveOverride = ref<SlotMappingOverride>({});
    provide(RESOLVE_OVERRIDE_KEY, resolveOverride);
    const resolvables = computed<ResolvableDeviation[]>(() => heuristicExtendable(scanReport.value));
    const activeResolve = ref<string | null>(null); // tokenId being resolved
    const activeDeviation = computed<ResolvableDeviation | null>(
      () => resolvables.value.find((r) => r.tokenId === activeResolve.value) ?? null,
    );
    function onResolve(tokenId: string): void { activeResolve.value = tokenId; }
    function onApply(tokenId: string, entry: SlotMappingEntry): void {
      resolveOverride.value = { ...resolveOverride.value, [tokenId]: entry };
      activeResolve.value = null;
    }
    function downloadSlotMapping(): void {
      const blob = new Blob([buildSlotMappingFile(resolveOverride.value)], { type: "application/json" });
      downloadBlob(blob, "slot-mapping.json"); // downloadBlob already imported from ./zip.js
    }
    ```
  - In the template, on the `<ScanView ... />` mount, add `@resolve="onResolve"`. Find the ScanView usage and add the handler.
  - Add a ResolvePanel host (a small panel/section that shows when `activeDeviation` is set) + a download button gated on `Object.keys(resolveOverride).length`. Place it adjacent to the ScanView mount (the implementer picks the least-disruptive spot in the scan view region):
    ```html
    <ResolvePanel v-if="activeDeviation" :deviation="activeDeviation" @apply="onApply" />
    <UButton v-if="Object.keys(resolveOverride).length > 0" size="xs" variant="outline" data-testid="download-slot-mapping" @click="downloadSlotMapping">Download slot-mapping.json</UButton>
    ```
  (Confirm `downloadBlob` is already imported in App.vue from `./zip.js`; if not, add it. Match the existing template structure around the ScanView/scan-view region — see `App.scan-view.test.ts` for how ScanView mounts.)

- [ ] **Step 6: Run full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green. (Task 5 creates `export-slot-mapping.ts`; if you do Task 4 before Task 5, temporarily stub `buildSlotMappingFile` or do Task 5 first — recommended order: Task 5 before Task 4 Step 5. Adjust commit order accordingly.)

- [ ] **Step 7: Commit.**
```bash
git add src/app/App.vue src/app/components/ScanView.vue src/app/components/ScanView.resolve.test.ts
git commit -m "feat(resolve): ScanView Resolve affordance + App.vue session override wiring"
```

---

### Task 5: Export — `buildSlotMappingFile` + download

**Files:**
- Create: `src/app/resolve/export-slot-mapping.ts`
- Test: `src/app/resolve/export-slot-mapping.test.ts`

**(Do this BEFORE Task 4 Step 5 so App.vue's import resolves.)**

- [ ] **Step 1: Write the failing test.** Create `src/app/resolve/export-slot-mapping.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseSlotMappingFile } from "@core/slot-mapping-loader.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { buildSlotMappingFile } from "./export-slot-mapping.js";

describe("buildSlotMappingFile", () => {
  it("serialises an override that round-trips through parseSlotMappingFile", () => {
    const override: SlotMappingOverride = {
      "button-mystery-bg": { slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const json = buildSlotMappingFile(override);
    expect(json).toContain('"overrides"');
    const loaded = parseSlotMappingFile(json);
    expect(loaded.overrides).toEqual(override);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/resolve/export-slot-mapping.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement.** Create `src/app/resolve/export-slot-mapping.ts`:

```ts
import type { SlotMappingOverride } from "@tg/grammar";
import type { SlotMappingFile } from "@core/slot-mapping-loader.js";

/** Serialise the session override into the slot-mapping.json shape the
 *  CLI/build consumes (parseSlotMappingFile round-trips it). */
export function buildSlotMappingFile(override: SlotMappingOverride): string {
  const file: SlotMappingFile = { overrides: override };
  return JSON.stringify(file, null, 2) + "\n";
}
```

- [ ] **Step 4: Run + typecheck.**
Run: `npx vitest run src/app/resolve/export-slot-mapping.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit.**
```bash
git add src/app/resolve/export-slot-mapping.ts src/app/resolve/export-slot-mapping.test.ts
git commit -m "feat(resolve): buildSlotMappingFile export (round-trips parseSlotMappingFile)"
```

---

### Task 6: Manual integration validation (live loop — not a unit test)

- [ ] Start the dev server: `npm run dev`. In a browser (use the `/browse` skill), open the local URL, upload a token export that contains a heuristic-extendable token (e.g. one whose 2nd segment isn't a Nuxt slot — use the live export `assets/tokens-20260619-214856.zip` and look for an `unsupported-part`/`component-looks-custom` issue in the Scan view; if none, hand-make a tiny `*.tokens.json` with `button.mystery.bg`).
- [ ] In the Scan/Issues view, find the heuristic-extendable issue → click **Resolve →** → the ResolvePanel opens pre-filled → pick a slot + utilityType → **Apply**. Confirm: the Kit render for that component re-renders and the token now lands (the diagnostics/coverage reflect it). Then **Download slot-mapping.json** and confirm the file parses + carries the override.
- [ ] Record the result (resolved / what was adjusted). This is the Phase-1 success proof: a deviation became a live, exported fix.

---

## Self-review checklist (run before handoff)
- README test-count: bump if the harness total changed after Tasks 1–5.
- Confirm the override default (`inject(..., ref({}))`) keeps existing previews unchanged when no resolution is active.
- Confirm `@tg/grammar` re-exports `nuxtSlotsFor`/`defaultBaseSlot`/`SlotMappingEntry`/`UtilityType`/`VariantAxis` (or fix imports to the path the rest of `src/` uses).
- Task 5 before Task 4 Step 5 (App.vue imports `buildSlotMappingFile`).
- The Task 6 live loop MUST work before considering v1 done.

## Out of scope (parked → later (Y) rounds)
The other 4 owners (Figma-Fix / Manual-Dev / by-design-Constraint / Data-Quality) + their actions; the full 24-kind→owner routing table + an owner filter in ScanView; auto-including `slot-mapping.json` in the existing export bundle; loading an existing override file back into the app. See the spec's "Future".

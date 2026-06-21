# (Y) #1 — Custom-Component Live-Re-Render on Resolve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolving a `chip`/`sidebar` token updates the live Kit render — thread the session slot-mapping override into `buildCustomRecipes` (merged over its auto-mapping, session wins) and `useCustomPreviewRecipe` (inject), so `LiveRealChip`/`LiveRealSidebar` re-render with the resolved slot.

**Architecture:** `buildCustomRecipes` already computes a per-token auto-override and delegates to `buildComponentRecipes`; we merge the session override over the auto one. `useCustomPreviewRecipe` injects `RESOLVE_OVERRIDE_KEY` (the same provide/inject seam the standard `usePreviewRecipe` already uses) and passes it through. Live-render only — no scanner/output/standard-path change.

**Tech Stack:** TypeScript, Vitest + @vue/test-utils.

---

## File Structure
- **Modify `src/custom-recipe-engine.ts`** — `BuildCustomRecipesOptions` gains `slotMappingOverride?`; merge it over the auto-override at the delegation.
- **Modify `src/app/composables/use-preview-recipe.ts`** — `useCustomPreviewRecipe` injects + passes the override.
- **Test:** `src/custom-recipe-engine.test.ts` (extend) + a composable inject test.

**Verified facts (recon, exact):**
- `src/custom-recipe-engine.ts:20` — `export interface BuildCustomRecipesOptions { readonly defaultSizeByComponent?: ...; readonly remBase?: number; }`. `SlotMappingOverride` is ALREADY imported there (`:10`). The delegation at `:55-61` passes `slotMappingOverride: override as SlotMappingOverride` (the auto-override built at `:44-53`).
- `src/app/composables/use-preview-recipe.ts:52` — `useCustomPreviewRecipe(graphFn, componentNameFn, partsFn)` calls `buildCustomRecipes(g, partsFn(), {})[name] ?? null`. The file ALREADY imports `inject`, `ref`, `SlotMappingOverride`, `RESOLVE_OVERRIDE_KEY` (from the standard-path seam) — no new imports needed.
- `chip` has slots `{root, base}` + custom parts; `chip-close-*` auto-maps to the `close` slot.

---

### Task 1: `buildCustomRecipes` accepts + merges the session override

**Files:**
- Modify: `src/custom-recipe-engine.ts`
- Test: `src/custom-recipe-engine.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `src/custom-recipe-engine.test.ts` (read its existing imports/fixtures first; reuse `buildGraph`):

```ts
// (add near the other buildCustomRecipes tests; ensure these imports exist in the file)
// import { buildGraph } from "...";  import type { SlotMappingOverride } from "@tg/grammar";
describe("buildCustomRecipes slotMappingOverride (session)", () => {
  function chipGraph() {
    return buildGraph([
      { name: "global", data: { chip: { close: { radius: { $value: 8, $type: "dimension" } } } } },
    ] as any);
  }
  it("lets a session override take precedence over the auto-mapping for a token", () => {
    const g = chipGraph();
    const parts = new Map([["chip", ["close"]]]);
    const override: SlotMappingOverride = {
      "chip-close-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const withOverride = buildCustomRecipes(g, parts, { slotMappingOverride: override })["chip"];
    const auto = buildCustomRecipes(g, parts, {})["chip"];
    expect(JSON.stringify(withOverride)).not.toBe(JSON.stringify(auto));
    expect(withOverride?.slots?.base ?? "").toContain("rounded");
  });
});
```
(Adjust the `slots.base` assertion to the REAL emitted class if `rounded`+`8` emits e.g. `rounded-lg` — assert the override token lands in `slots.base` whereas the auto build places it elsewhere. If the existing test file's import style differs, match it; the fixture token id is `chip-close-radius`.)

- [ ] **Step 2: Run to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/custom-recipe-engine.test.ts`
Expected: FAIL — `BuildCustomRecipesOptions` has no `slotMappingOverride`, so the override is ignored and `withOverride` === `auto` (or a type error).

- [ ] **Step 3: Implement.** In `src/custom-recipe-engine.ts`:
  - Extend the options interface (`:20`):
    ```ts
    export interface BuildCustomRecipesOptions {
      readonly defaultSizeByComponent?: Readonly<Record<string, string>>;
      readonly remBase?: number;
      /** Session slot-mapping override (from the user's resolutions); merged OVER
       *  the auto-computed per-token override so resolved tokens win. */
      readonly slotMappingOverride?: SlotMappingOverride;
    }
    ```
  - At the delegation (`:55-61`), merge the session override over the auto one. Change:
    ```ts
    slotMappingOverride: override as SlotMappingOverride,
    ```
    to:
    ```ts
    slotMappingOverride: { ...override, ...(options.slotMappingOverride ?? {}) } as SlotMappingOverride,
    ```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/custom-recipe-engine.test.ts && npm run typecheck`
Expected: PASS; typecheck clean. (`buildOverlayRecipes` in the same file is NOT changed — overlays aren't a resolve target.)

- [ ] **Step 5: Commit.**
```bash
git add src/custom-recipe-engine.ts src/custom-recipe-engine.test.ts
git commit -m "feat(resolve): buildCustomRecipes merges the session override over its auto-mapping"
```

---

### Task 2: `useCustomPreviewRecipe` injects + passes the override

**Files:**
- Modify: `src/app/composables/use-preview-recipe.ts`
- Test: `src/app/composables/use-preview-recipe.inject.test.ts` (extend the existing inject test file from the standard-path seam)

- [ ] **Step 1: Write the failing test.** Append to `src/app/composables/use-preview-recipe.inject.test.ts` (it already mounts a probe + provides `RESOLVE_OVERRIDE_KEY` for the standard path; mirror it for the custom path):

```ts
import { useCustomPreviewRecipe } from "./use-preview-recipe.js"; // add to imports if not present
it("applies an injected override to the custom (chip) recipe", () => {
  const g = buildGraph([
    { name: "global", data: { chip: { close: { radius: { $value: 8, $type: "dimension" } } } } },
  ] as any);
  const parts = new Map([["chip", ["close"]]]);
  let captured: any = null;
  const Probe = defineComponent({
    setup() {
      const { recipe } = useCustomPreviewRecipe(() => g, () => "chip", () => parts);
      captured = recipe;
      return () => h("div");
    },
  });
  mount(Probe, {
    global: {
      provide: {
        [RESOLVE_OVERRIDE_KEY as symbol]: ref({
          "chip-close-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
        }),
      },
    },
  });
  expect(JSON.stringify(captured.value)).toContain("rounded"); // adjust to the real emitted class (match Task 1)
});
```
(Reuse the file's existing `defineComponent`/`mount`/`ref`/`h`/`buildGraph`/`RESOLVE_OVERRIDE_KEY` imports — add `useCustomPreviewRecipe` to the import from `./use-preview-recipe.js`.)

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/composables/use-preview-recipe.inject.test.ts`
Expected: FAIL — `useCustomPreviewRecipe` doesn't inject/pass the override yet, so the recipe is the auto-only build (no `rounded` in `slots.base`).

- [ ] **Step 3: Implement.** In `src/app/composables/use-preview-recipe.ts`, in `useCustomPreviewRecipe` ONLY (leave `usePreviewRecipe` as-is), add the inject + thread it. Before the `recipe` computed add:
```ts
  const override = inject(RESOLVE_OVERRIDE_KEY, undefined) ?? ref<SlotMappingOverride>({});
```
and change the build call from:
```ts
    return buildCustomRecipes(g, partsFn(), {})[name] ?? null;
```
to:
```ts
    return buildCustomRecipes(g, partsFn(), { slotMappingOverride: override.value })[name] ?? null;
```
(All needed symbols — `inject`, `ref`, `SlotMappingOverride`, `RESOLVE_OVERRIDE_KEY` — are already imported in this file from the standard-path seam.)

- [ ] **Step 4: Run to verify pass + full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green; typecheck clean. Existing `useCustomPreviewRecipe` / LiveRealChip / LiveRealSidebar tests stay green (the `inject(..., undefined) ?? ref({})` default keeps no-provider behaviour identical).

- [ ] **Step 5: Commit.**
```bash
git add src/app/composables/use-preview-recipe.ts src/app/composables/use-preview-recipe.inject.test.ts
git commit -m "feat(resolve): useCustomPreviewRecipe injects the session override (chip/sidebar live-render)"
```

---

### Task 3: Manual check (light)
- [ ] `npm run dev` → `/browse` the live export → Scan view → **Resolve** a `chip` deviation → pick a slot → **Apply** → switch the component pane to **chip** (select a chip token / the chip group) so `LiveRealChip` renders → confirm the chip render reflects the resolved slot (vs before). (Engine + inject are unit-tested; this confirms the live surface.)

---

## Self-review checklist (run before handoff)
- README test-count: bump if the harness total changed (Tasks 1–2 add 2 tests).
- Confirm `buildOverlayRecipes` (same file) is untouched.
- Confirm the `inject(..., undefined) ?? ref({})` default keeps existing custom previews unchanged with no provider.
- The Task 3 live check confirms the chip render updates.

## Out of scope (parked)
The `customComponentsRenderer` output tab reflecting the override; the deep override-aware `scanGraph` (now unblocked by this change). See the spec's "Future".

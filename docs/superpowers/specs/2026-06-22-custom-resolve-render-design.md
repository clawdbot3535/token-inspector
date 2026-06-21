# (Y) #1 — Custom-Component Live-Re-Render on Resolve — Design Spec

**Status:** Draft for review
**Date:** 2026-06-22
**Topic:** Make resolving a **custom-component** (`chip`/`sidebar`) deviation update the live Kit render, by threading the session slot-mapping override into the custom-recipe path (`buildCustomRecipes` + `useCustomPreviewRecipe`). Closes (Y) v1 limitation #1. Live-render only.

---

## Mission context

(Y) v1 (v0.54.0, [[deviation-routing-y]]) lets the user resolve a deviation into a session `slot-mapping.json` override that re-renders the live Kit view — but **only for standard components**: the override threads into `usePreviewRecipe` → `buildComponentRecipes`. `chip`/`sidebar` render via `LiveRealChip`/`LiveRealSidebar` → `useCustomPreviewRecipe` → `buildCustomRecipes`, which never received the override. Since the live token export's heuristic-extendable deviations are all on `chip`, this is the case the user actually hits — resolving a chip token applies + exports correctly but doesn't update the in-app render.

**Confirmed mechanism (recon):** `buildCustomRecipes(graph, partsByComponent, options)` (`src/custom-recipe-engine.ts:35`) already **computes a per-token auto-override** (`getSlotMapping(normId, undefined, node.type, extraSlots)` where `extraSlots` = the component's foreign parts) and **delegates to `buildComponentRecipes(graph, { components:[component], slotMappingOverride: <auto> , … })`** (`:55-61`). `chip` has slots `{root, base}` + custom parts (`close`, …), so a chip token is already auto-placed; the scanner only flags it (it calls `getSlotMapping` WITHOUT `extraSlots`). `LiveRealChip.vue` / `LiveRealSidebar.vue` render chip/sidebar live via `useCustomPreviewRecipe`, dispatched by `LiveKitPanel` (`:56-57`). So threading the session override is the **same shape as the standard-component seam** — merge it into the auto-override (session wins) and inject it in the composable.

---

## Goal

Resolving a `chip`/`sidebar` token (Apply in the ResolvePanel) updates the live `LiveRealChip`/`LiveRealSidebar` render in the Kit view, with the token placed in the user's chosen slot — the session override takes precedence over `buildCustomRecipes`' auto-mapping.

**Success criteria:**
- `buildCustomRecipes(graph, parts, { slotMappingOverride })` places an overridden token per the session override, overriding its auto-computed mapping for that token (other tokens keep the auto-mapping).
- `useCustomPreviewRecipe` injects the session override (default empty when no provider) and passes it through, so `LiveRealChip`/`LiveRealSidebar` re-render when the override changes.
- No change to `buildComponentRecipes`, the scanner, the `customComponentsRenderer` output, or standard-component behaviour.
- Existing tests stay green.

---

## Scope

**In scope:**
- `custom-recipe-engine.ts`: `BuildCustomRecipesOptions` gains `slotMappingOverride?: SlotMappingOverride`; merge it into the auto-override (session precedence) at the `buildComponentRecipes` delegation.
- `use-preview-recipe.ts` (`useCustomPreviewRecipe`): inject `RESOLVE_OVERRIDE_KEY` + pass `slotMappingOverride` into `buildCustomRecipes`.

**Out of scope (parked):**
- The **`customComponentsRenderer` output** (the `custom-components.ts` tab/download) reflecting the override — separate renderer; it already exports correctly and the override reaches the CLI/build via the downloaded `slot-mapping.json`.
- The **deep override-aware `scanGraph`** (warnings count drops, export re-routes) — still a separate item; #1 only removes its "resolved custom tokens vanish" blocker.

---

## Current state (key seams)

- `src/custom-recipe-engine.ts:35` — `buildCustomRecipes(graph, partsByComponent, options: BuildCustomRecipesOptions = {})`; builds `override` (auto, per token) `:44-53`; delegates `:55-61` with `slotMappingOverride: override as SlotMappingOverride`.
- `src/app/composables/use-preview-recipe.ts:52` — `useCustomPreviewRecipe(graphFn, componentNameFn, partsFn)` calls `buildCustomRecipes(g, partsFn(), {})`.
- `src/app/resolve/override-key.ts` — `RESOLVE_OVERRIDE_KEY` (already provided by App.vue; already injected by `usePreviewRecipe`).
- `src/app/components/LiveRealChip.vue` / `LiveRealSidebar.vue` — consume `useCustomPreviewRecipe`; mounted by `LiveKitPanel` for `chip`/`sidebar`.

---

## Design — units

### 1. `custom-recipe-engine.ts` — accept + merge the session override
- `BuildCustomRecipesOptions` gains `slotMappingOverride?: SlotMappingOverride` (the session override, keyed by original token id).
- At the per-component delegation, merge the session override **over** the auto-computed one so resolved tokens win:
  ```ts
  slotMappingOverride: { ...override, ...(options.slotMappingOverride ?? {}) } as SlotMappingOverride,
  ```
  (Session entries for tokens of OTHER components are harmless — `buildComponentRecipes` only processes `components: [component]`.)

### 2. `useCustomPreviewRecipe` — inject + pass the override
- Inject `RESOLVE_OVERRIDE_KEY` (mirroring `usePreviewRecipe`'s `inject(KEY, undefined) ?? ref({})`), and pass it:
  ```ts
  return buildCustomRecipes(g, partsFn(), { slotMappingOverride: override.value })[name] ?? null;
  ```
- Default empty override when no provider → existing direct-call tests + non-App usage unchanged.

---

## Data flow

`App.resolveOverride (ref, provided) → useCustomPreviewRecipe injects it → buildCustomRecipes(parts, { slotMappingOverride }) → merge { ...auto, ...session } → buildComponentRecipes → LiveRealChip/Sidebar recipe`. Applying a chip resolution updates `resolveOverride` → the injected override changes → the custom recipe recomputes → the chip render updates. The standard-component path (`usePreviewRecipe`) and the scanner/output are untouched.

## Error handling

- No session override (empty `{}`) → merge is a no-op → identical to today (auto-mapping only).
- A session override entry for a token of a different component → ignored (component-scoped build).
- A `null` session entry → explicitly skips that token (existing `buildComponentRecipes` semantics) — consistent.

## Testing

- **Engine (pure):** `buildCustomRecipes(graph, new Map([["chip", ["close"]]]), { slotMappingOverride: { "chip-…": <entry placing it in a chosen slot> } })` — the chip recipe reflects the override for that token, differing from the no-override (auto-only) build. A token NOT in the session override keeps its auto-mapping.
- **Composable (inject):** mirror the `usePreviewRecipe` inject test — a probe component providing `RESOLVE_OVERRIDE_KEY` with a chip override → `useCustomPreviewRecipe`'s recipe reflects it; without a provider it's the auto-only recipe (regression).
- Existing `custom-recipe-engine` + `useCustomPreviewRecipe` + LiveRealChip/Sidebar tests stay green.
- Pre-commit gate (vue-tsc + full vitest) green.
- **Manual (light):** resolve a chip deviation on the live export → confirm the chip render in the Kit view updates.

## Resolved decisions (review-approved)
1. **Live-render only** — not the `customComponentsRenderer` output tab, not the deep override-aware `scanGraph`.
2. **Session override wins** over `buildCustomRecipes`' auto-mapping (merge `{ ...auto, ...session }`).
3. Threaded via the **same `RESOLVE_OVERRIDE_KEY` provide/inject** seam as the standard path (consistency).

## Flagged for the plan
- Confirm `BuildCustomRecipesOptions` is exported / where it's defined (top of `custom-recipe-engine.ts`).
- Whether `buildOverlayRecipes` (same file, also builds a per-token override + delegates) should likewise merge the session override — likely NOT in scope (overlays aren't a resolve target); confirm and leave untouched unless trivial.

## Future (parked)
- `customComponentsRenderer` output reflecting the session override (the `custom-components.ts` preview tab).
- Deep override-aware `scanGraph` (warnings count drops + export re-routes) — now unblocked by #1 (resolved custom tokens have a landing spot).

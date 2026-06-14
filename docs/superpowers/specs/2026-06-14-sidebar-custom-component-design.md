# Sidebar as a Known-Custom Component (Bucket D, part 2) — Design

**Date:** 2026-06-14
**Status:** Approved (a `KNOWN_CUSTOM_COMPONENTS` registry seeds the custom-emit path; sidebar emits `sidebarRecipe`; 3 stragglers deferred)
**Feature:** Emit the export's `sidebar` tokens as a custom recipe (`output/nuxt/custom-components.ts`), since Nuxt UI v4 (free) has no sidebar component.

## Problem

The 2026-06-12 export carries 16 `sidebar-*` tokens (a navigation sidebar: a `base`/root surface, `item` rows, and `section` labels). Nuxt UI v4 (free) has no `Sidebar` component, so it cannot map to a `ui.sidebar` recipe. The Stage C custom-emit path (`chip`) routes flagged-custom components to `custom-components.ts` — but it is **100% scanner-flag-driven**: `customPartsByComponent` only returns components the `component-looks-custom` detector flagged, and that detector **skips any component with no `NUXT_SLOTS` entry** (`src/scanner.ts:245`, `if (!slots) continue`). `sidebar` has no `NUXT_SLOTS` entry, so it never flags and never emits — it just reads as an "unmapped component" (correctly distinguished from the layout primitives by Bucket E).

`sidebar` is a *known* custom component — we know its anatomy by hand — not a divergence to *discover* like `chip`. Routing it through the scanner flag would require lying in two Nuxt-only vocabularies (`NUXT_SLOTS` + `COMPONENT_ALLOW_LIST`) with a sparse-slots hack.

## Goal

A small registry of known-custom components seeds the custom-emit path directly, so `sidebar` emits a `sidebarRecipe` with hand-defined anatomy — without polluting the Nuxt vocabularies.

Verified on the real export (`item` passed as `extraSlots`): **13 of 16** sidebar tokens map (`base`: bg/border/padding-x/y/width; `item`: bg with `active`/`hover` states, text with `active`, icon-size, padding-x/y, radius→rounded); 3 stay NULL (see Non-goals).

Success criteria (asserted by unit tests):
- `KNOWN_CUSTOM_COMPONENTS` (in `@tg/grammar`) maps `sidebar` → `["item"]`.
- `customPartsByComponent({ issues: [] })` (no scanner flags) returns a map containing `sidebar → ["item"]` (seeded from the registry).
- A scanner-flagged component (`chip`) and a registry component (`sidebar`) coexist in the returned map.
- `customComponentsRenderer.render(<synthetic sidebar graph>, { customParts })` emits `export const sidebarRecipe` with a `base` slot (e.g. `bg-[…]`) and an `item` slot carrying an `active:` / `hover:` prefixed class.
- `appConfigRenderer` does not emit a `ui.sidebar` block (sidebar is in `customComponents` and not in `COMPONENT_ALLOW_LIST`).

## Non-goals

- The 3 straggler tokens: `sidebar-section-label-{color,size}` (the two-word `section-label` sub-element does not route — the same camelCase / multi-segment slot limit as nav's `childLink`; `buildGraph` lowercases ids) and `sidebar-width-collapsed` (`collapsed` is not a `STATE_KEY` or size). Left NULL and documented.
- Adding `sidebar` to `NUXT_SLOTS` or `COMPONENT_ALLOW_LIST` — those stay Nuxt-only; the registry is the explicit seam for known-custom components.
- A live preview / bespoke `LiveSidebar` — out of scope (recipe emit only).
- Grammar mapping changes — `sidebar-item-*` already maps via the existing sub-element routing once `item` is an `extraSlot`.

## Approach

### Part 1 — `KNOWN_CUSTOM_COMPONENTS` registry (grammar package)

In `packages/grammar/src/component-vocab.ts`, add (near `NON_COMPONENT_PREFIXES`):

```ts
/**
 * Components with no Nuxt UI recipe that the inspector emits as hand-anatomy
 * custom recipes (custom-components.ts), independent of the scanner's
 * component-looks-custom flag. Maps component → its routable sub-element slots
 * (used as extraSlots; base-level tokens use the default `base` slot).
 */
export const KNOWN_CUSTOM_COMPONENTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["sidebar", ["item"]],
]);
```

### Part 2 — Seed the custom-parts map (scanner)

In `src/scanner.ts`, `customPartsByComponent` (line ~787) seeds the registry before the scanner-flagged entries (import `KNOWN_CUSTOM_COMPONENTS` from `@tg/grammar`):

```ts
export function customPartsByComponent(
  report: { issues: ReadonlyArray<ScanIssue> },
): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const [comp, parts] of KNOWN_CUSTOM_COMPONENTS) {
    out.set(comp, [...parts]);
  }
  for (const i of report.issues) {
    if (i.kind !== "component-looks-custom") continue;
    if (i.componentName === undefined || i.customParts === undefined) continue;
    out.set(i.componentName, [...i.customParts]);
  }
  return out;
}
```

Both consumers — `scripts/build-cli.ts:71` and the web `App.vue:105` — derive `customParts` from this single function, so both emit `sidebarRecipe` with no further wiring. `buildCustomRecipes` (which applies `normalizeTrailingColorRole` + trailing-state handling) and `customComponentsRenderer` already do the rest; `appConfigRenderer` receives `customComponents = new Set(customParts.keys())` and so does not emit a `ui.sidebar` block (it would not anyway — sidebar is not allow-listed).

## Module / file layout

- **Modify** `packages/grammar/src/component-vocab.ts` — add `KNOWN_CUSTOM_COMPONENTS`.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — registry membership.
- **Modify** `src/scanner.ts` — seed the registry in `customPartsByComponent` (import it).
- **Modify** `src/scanner.test.ts` — `customPartsByComponent` includes `sidebar` (registry) alongside a flagged component.
- **Modify** `src/renderers/renderers.test.ts` — `customComponentsRenderer` emits `sidebarRecipe` (base + item, active prefix).

No `slot-mapping.ts` / `app-config.ts` allow-list / `build-cli.ts` / `App.vue` change — the seam is `customPartsByComponent`.

## Testing (TDD)

- **Grammar (`component-vocab.test.ts`):** `KNOWN_CUSTOM_COMPONENTS.get("sidebar")` equals `["item"]`.
- **Scanner (`scanner.test.ts`):** `customPartsByComponent({ issues: [] })` contains `sidebar → ["item"]`; with a synthetic `component-looks-custom` issue for `chip`, the map contains both `sidebar` and `chip`.
- **Renderer (`renderers.test.ts`):** a synthetic graph with `sidebar-bg`, `sidebar-item-text`, `sidebar-item-bg-active` → `customComponentsRenderer.render(g, { customParts })` text contains `export const sidebarRecipe`, an `item:` slot, and an `active:` prefix.
- **Gate:** full suite + `vue-tsc`; `npm run build`; `npm run build:tokens` — digest unchanged (no `sidebar` in the committed `components/` fixture; no-op there, like nav). Optional real-export spot-check via git-import: `custom-components.ts` carries `sidebarRecipe` (base + item).

## Known boundaries

- 3 straggler tokens deferred (above): `section-label` ×2 and `width-collapsed`.
- The emitted `sidebarRecipe` anatomy is `base` + `item`; `section` is not a routable single-segment slot, so section-label tokens are not emitted.
- The real `sidebar-*` tokens live only in the 914-token export, not the committed fixture — unit tests on synthetic graphs are authoritative.
- The registry currently holds only `sidebar`; it is the seam for future known-custom components (each entry = component → routable sub-element slots).

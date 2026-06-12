# Design: Overlay recipes — `overlay-light`/`overlay-dark` context overrides

- **Date:** 2026-06-12
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/overlay-recipes`
- **Relates to:** `docs/superpowers/specs/2026-06-12-stage-c-custom-emit-design.md` (the
  `custom-components.ts` artifact + `buildCustomRecipes` delegation pattern this feature reuses)

## Problem

The current Figma export (`clawdbot3535/design-token-export`, 914 tokens, +481 vs the previous set)
introduced a new naming axis: component tokens are now also exported under an
`overlay-light` / `overlay-dark` segment — e.g. `button-overlay-dark-solid-bg`,
`badge-overlay-light-accent-bg`, `nav-item-overlay-dark-ghost-bg`.

These account for **233 of the 388 unmapped component-layer tokens (60%)** — by far the largest
NULL bucket. The grammar does not recognise the `overlay-{light,dark}` segment, so it folds it into
the utility word (`overlay-dark-solid-bg` → no rule → null) and drops every one.

**What they mean (verified empirically against the real values):** they are the component's
appearance when it sits on a dark (resp. light) **overlay surface** — a popover, a scrim, a coloured
panel. This is *not* the page dark-mode:

| token | base | overlay-dark | overlay-light |
|---|---|---|---|
| `button-solid-bg` | `#5667A7` (brand) | `#FAFAFA` (white) | `#18181B` (black) |
| `badge-default-text` | `#52525B` | `#FAFAFA` | `#18181B` |

`overlay-dark` ≠ `overlay-light` and both exist simultaneously, so they cannot be page-mode values
(a component has one dark-mode value, not two). They are a genuine, orthogonal surface context.

**How many are real vs redundant (measured):**

- **90** are byte-identical to their base token → redundant, droppable.
- **135** genuinely differ from base → real overlay overrides.
- **14** have no base counterpart at all → real.

So ~149 carry design intent the base recipe does not. Nuxt UI has **no `surface`/`overlay` prop**,
so a standard `variants` axis would be dead config (cf. the `state-variant` dead-config bug). They
need a deliberate home, not a forced mapping.

## Goal

Recognise the `overlay-{light,dark}` segment, drop the redundant ones, and emit the genuine
overrides as **sparse delta recipes** in the existing `custom-components.ts` artifact — one per
(component, mode) — that a developer merges onto the base recipe via `tv()` / `:ui` in overlay
contexts.

```ts
// custom-components.ts (appended)
export const buttonOverlayDarkRecipe = {
  variants: { color: { solid: { base: "bg-[#FAFAFA] text-[#18181B]" } /* ghost, outline, link … */ } },
} as const;
```

Success criteria:

- `buildOverlayRecipes(graph)` returns recipes named `buttonOverlayDark`, `buttonOverlayLight`,
  `badgeOverlayDark`, `badgeOverlayLight` (the in-scope set), and `{}` for a graph with no overlay
  tokens.
- Each recipe is a **sparse delta** — it contains ONLY the tokens that diverge from base. The ~16
  (badge-dark) / ~7 (button-dark) overlay tokens identical to base produce **no** entries.
- `button-overlay-dark-solid-bg` (#FAFAFA) lands at `variants.color.solid.base` of
  `buttonOverlayDarkRecipe` as a `bg-[…]` class; the matching identical token is absent.
- `custom-components.ts` emits the overlay recipes (alongside any Stage C custom recipes), and
  `app.config.ts` is **unchanged** — overlay tokens never reach the `ui:` block (they were already
  null there, and base recipes are untouched).
- `npm run typecheck` + full `vitest` green; production build succeeds.

Non-goals (YAGNI / scope boundary):

- **`nav-item-overlay-*` is deferred.** `stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")` →
  `nav-item-ghost-bg`, which is itself unmapped today (the *variant-after-sub-element* gap, bucket B).
  Overlay recipes are built only for components where the stripped id is mappable AND the
  `overlay-*` segment sits directly after the component name (no sub-element between). In this export
  that is **badge** and **button**. `nav` overlay recipes follow once bucket B lands.
- No `dark:`-prefix folding (conflates overlay-surface with page dark-mode — the data shows they are
  different concepts).
- No standard `variants` axis (no Nuxt prop → dead config).
- No change to base recipes, the divergence flag, or the Stage C custom path.

## Architecture

Three units, reusing the Stage C delegation pattern.

### 1. `stripOverlayPrefix(id)` — new pure helper (in `custom-recipe-engine.ts`)

Removes a leading `overlay-light` / `overlay-dark` segment that sits **immediately after the
component name**, returning the logical base id and the detected mode. No-op (returns
`{ logicalId: id, mode: null }`) when the segment is absent or sits after a sub-element (the
deferred nav case).

```ts
// "button-overlay-dark-solid-bg" → { logicalId: "button-solid-bg", mode: "dark" }
// "nav-item-overlay-dark-ghost-bg" → { logicalId: "nav-item-overlay-dark-ghost-bg", mode: null }  // sub-element → deferred
// "button-solid-bg" → { logicalId: "button-solid-bg", mode: null }
```

Detection rule: `parts[1] === "overlay" && (parts[2] === "light" || parts[2] === "dark")`. Only the
2nd-segment position qualifies, which naturally excludes the sub-element case.

### 2. `buildOverlayRecipes(graph)` — new builder (in `custom-recipe-engine.ts`)

Reuses `buildComponentRecipes` via the same per-token-override delegation as `buildCustomRecipes`.

For each component that has overlay tokens, and for each mode (`dark`, `light`):

1. Build an override map over **all** of that component's component-layer nodes:
   - If the node is a genuine overlay token **for this mode** (its `stripOverlayPrefix` mode matches
     AND it passes the dedup test below) → `override[node.id] = getSlotMapping(logicalId, undefined, node.type)`.
   - Otherwise (base tokens, the other mode, identical-to-base overlay tokens, sub-element overlay
     tokens) → `override[node.id] = null` (skip).
2. `buildComponentRecipes(graph, { components: [component], slotMappingOverride: override })` — emits
   a recipe containing only this mode's genuine overlay overrides, bucketed by the logical
   slot/variant, with values resolved from the real (overlay-valued) nodes.
3. Store under the key `<component>Overlay<Mode>` (e.g. `buttonOverlayDark`).

Empty recipes (no genuine overrides for that component+mode) are omitted.

**Dedup test (conservative):** a genuine override is one where the base token is absent OR
`resolveTokenToValue(overlayId)` ≠ `resolveTokenToValue(baseId)`. When the base cannot be resolved
to a concrete terminal value (e.g. a mode-variant alias), treat the overlay token as **genuine**
(never silently drop on uncertainty).

Returns `Record<string, ComponentRecipe>` (reusing the `ComponentRecipe` type), keyed by the export
name stem (`buttonOverlayDark` → renderer emits `buttonOverlayDarkRecipe`).

### 3. Renderer integration (`custom-components.ts` renderer)

`customComponentsRenderer` already emits `export const <name>Recipe = { … } as const` for each entry
in a recipe map and reuses `emitCustomRecipe`. Extend it to merge `buildOverlayRecipes(graph)` into
the recipe set it renders (the Stage C `buildCustomRecipes` output stays as-is). The header comment
generalises to: *"custom components AND overlay-surface overrides — recipes Nuxt UI cannot express
natively."* The map key already drives the `<name>Recipe` export name, so `buttonOverlayDark`
produces `export const buttonOverlayDarkRecipe`.

The file is emitted when **either** custom recipes **or** overlay recipes are non-empty (the build-cli
+ web gates widen from `customParts.size > 0` to "either source non-empty"). No new output tab is
needed — overlay recipes share the existing `custom-components.ts` tab.

## Data flow

```
graph ─┬─ buildCustomRecipes(graph, customParts)   → { chip: … }            (Stage C)
       └─ buildOverlayRecipes(graph)                → { buttonOverlayDark: …,
                                                        buttonOverlayLight: …,
                                                        badgeOverlayDark: …,
                                                        badgeOverlayLight: … }
                      │  per (component, mode):
                      │    override = genuine-overlay → getSlotMapping(stripOverlayPrefix(id))
                      │               everything else → null (skip)
                      │    delegate to buildComponentRecipes
                      ▼
        customComponentsRenderer merges both maps → custom-components.ts
        (app.config.ts unchanged; overlay tokens never were in the ui: block)
```

## Testing

- **`stripOverlayPrefix`** (unit): the three cases above — 2nd-segment overlay → stripped+mode;
  sub-element overlay → no-op (mode null); no overlay → no-op.
- **`buildOverlayRecipes`** (unit, real fixtures from `components/`… see note): a graph with
  `button-overlay-dark-solid-bg` (genuine) and a base-identical overlay token yields
  `buttonOverlayDark` with `variants.color.solid.base` matching `/bg-\[/` and NO entry for the
  identical token; a graph with no overlay tokens → `{}`; `nav-item-overlay-*` tokens produce no
  `navOverlay*` recipe (deferred). **Fixture note:** the inspector's local `components/` fixture must
  be refreshed to the new export (or a dedicated overlay fixture added) for these assertions — see
  Open questions.
- **Renderer** (extend `renderers.test.ts`): `customComponentsRenderer` emits
  `export const buttonOverlayDarkRecipe` when overlay tokens are present; empty graph → empty text.
- **Regression:** `appConfigRenderer` output unchanged (overlay tokens were already null in `ui:`).
- **Build gate:** typecheck + full vitest + production build green.

## Risks / open questions for planning

- **Test fixtures.** The inspector ships `components/*.tokens.json` as its local fixture; it predates
  the overlay export. The plan must decide: refresh the local fixture to the new export (largest,
  most realistic — but touches many existing snapshot expectations), or add a small dedicated
  overlay fixture for the new tests. Recommendation: a focused overlay fixture for unit tests, and
  refresh the full fixture as a separate follow-up so existing snapshots are reviewed deliberately.
- **`buildComponentRecipes` with mostly-null overrides.** Emitting only a subset of a component's
  tokens by nulling the rest is the same mechanism Stage C uses; confirm the ring-pairing /
  size-default pre-scans behave when most tokens are null-skipped (they read the override too, so
  they should see the skips consistently — verify in the plan).
- **Recipe key → export name.** Confirm `customComponentsRenderer` derives the export name purely
  from the map key (so `buttonOverlayDark` → `buttonOverlayDarkRecipe`) without assuming the key is a
  bare component name.

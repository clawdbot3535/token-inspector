# Design Spec — chip close-button: route `close-button-size` + render a button

**Date:** 2026-06-19
**Status:** Approved
**Topic:** The chip's close element should reflect the Figma mechanic — a **button**. Currently (a) the previews render the close as a `<span>×</span>`, and (b) the designer's `chip-close-button-size` token is dropped (maps to `null`), so the chip recipe has no `close` slot and the `×` is unstyled. Route the token to the `close` slot and render the close as a `<button>`.

## Context

`chip` is a custom component (no Nuxt analog — `UChip` is a dot-indicator, not a closeable tag; see [[collection-aware-custom-routing]]). Its custom recipe is built from foreign parts (`label`, `close`). In the current export the only close token is `chip-close-button-size`, which maps to `null`: the parser consumes `close` as the slot-prefix, leaving `button-size`, and `button-size` is not a known utility type. So the recipe has only `base` + `label` slots, no `close` slot, and the previews draw a literal unstyled `×` in a `<span>`.

**Why not a generic fix:** a generic "absorb structural words" rule would be wrong, because nested named elements differ semantically — `close-button` is a *descriptor* (the close element IS a button → one `close` slot), whereas `badge`-in-nav-item is a *distinct element* (its own Nuxt slot `linkTrailingBadge`). The grammar already handles nested elements **explicitly per type** (`icon` via the icon-size machinery; `dot`→`indicator` via `FIGMA_NUXT_PART_ALIAS`). This spec follows that precedent. The general nested-element case (badge-in-nav) has **no tokens in the export today** and is separately blocked by the camelCase-slot issue — out of scope.

## Changes

### 1. Grammar — curated composite part alias (`packages/grammar/src/`)

- **`component-vocab.ts`:** add `["close-button", "close"]` to `FIGMA_NUXT_PART_ALIAS` (alongside `dot`→`indicator` etc.). This is an explicit, curated Figma-part-name → slot rename — **not** a generic absorber.
- **`slot-mapping.ts`:** in the slot-prefix detection (currently ~lines 123-139), before the single-segment slot/alias checks, add a **2-segment composite lookup**: form `composite = parts[start] + "-" + parts[start+1]`, and if `FIGMA_NUXT_PART_ALIAS.get(composite)` resolves to a slot the component has (`componentSlots.has(aliased)`), set `slotPrefix = aliased` and `start += 2`. Gated on `componentSlots !== undefined` (so it only fires in the custom/extraSlots pass) and only consults the curated alias map (not a dynamic match against all slots).

Result: `chip-close-button-size` → `{ slot: "close", utilityType: "size" }` → emits `size-[Npx]` on the `close` slot, identical to how the already-working `chip-close-size` behaves. The chip recipe gains a `close` slot, which is emitted into `custom-components.ts`.

**Blast radius:** `close-button` is the only 2-segment entry, so the composite lookup matches nothing else; all existing tokens (`chip-close-icon-size`, `chip-close-size`, every other component) parse unchanged. Future composites (e.g. `link-trailing-badge`→`linkTrailingBadge`) would each need their own explicit entry (and the separate camelCase fix) — they are not auto-handled.

### 2. Previews — render the close as a `<button>`

In both `src/app/components/LiveChip.vue` (Preview tab) and `src/app/components/LiveRealChip.vue` (Real tab), replace the close `<span>×</span>` with a `<button>` that **wraps** the close-slotted element:

```html
<button type="button" class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none">
  <span :class="<close-slot-classes>">×</span>
</button>
```

- The `<button>` carries **static scaffolding only** (UA-chrome reset + centering) — it is **not** sentinel-bearing.
- The inner `<span>` carries the `close` slot's recipe classes (in `LiveRealChip` this is the diff sentinel `build.ui.close` / `cell.ui.close`; in `LiveChip` it is `pill.close.classes` + `:style`). This preserves the sentinel-purity rule (sentinel-bearing element holds only recipe classes — see [[real-render-fidelity-tab]]): the reset/layout classes stay on the button, never on the sentinel span.
- `LiveRealChip` has **two** close spots — the resting render and the variant-cell render — both get the button wrapper. `LiveChip` has one (the pill template). The literal `×` stays as the button's content (a placeholder glyph; the tokens style size, not content).

## Data flow

`chip-close-button-size` → grammar composite-alias (`close-button`→`close`) + size utility → recipe `close` slot = `size-[Npx]` → previews render `<button><span class="close…">×</span></button>`; the Real tab diffs the `close` slot's `size` (width/height) on the sentinel span.

## Error handling / edge cases

- A chip with no `close-button`/`close` token → no `close` slot → the previews still render the `<button><span>×</span></button>` but the span has no recipe classes (unstyled glyph) — same graceful degradation as today, now in a button.
- The composite lookup only fires when `componentSlots` is provided (custom pass) and the composite is a curated alias key → zero effect on standard components / the normal first pass.
- jsdom: the Real-tab diff early-returns `[]`; mount tests assert the `<button>` structure + sentinel span classes.

## Testing

- **Grammar unit** (`slot-mapping.test.ts`): `heuristicSlotMapping("chip-close-button-size", undefined, new Set(["label","close"]))` → `{ slot:"close", utilityType:"size", … }`; `chip-close-icon-size` still → `{ slot:"close", utilityType:"icon-size" }`; `chip-close-size` still → `{ slot:"close", utilityType:"size" }`; a non-aliased composite (e.g. `chip-foo-bar-size`) is unaffected (no spurious 2-seg match).
- **Grammar/recipe** (`recipe-engine.test.ts` or `custom-recipe-engine.test.ts`): a chip graph with `chip-close-button-size` yields a recipe whose `close` slot contains `size-[…]`.
- **`component-vocab` unit:** `FIGMA_NUXT_PART_ALIAS.get("close-button") === "close"`.
- **Preview mount** (`LiveChip.test.ts`, `LiveRealChip.test.ts`): the chip close renders a `<button>` (e.g. `w.find("button")` exists) wrapping a span that carries the close-slot classes; the `<button>` is not the sentinel-bearing element.
- **Browser verification** via `/browse`: the chip preview shows a sized close **button** (not an unstyled faint `×`); the Real-tab `close` slot diff shows its `size` (width/height). Capture before/after.

## Out of scope / future

- General nested-element routing (badge-in-nav-item, button-in-accordion, etc.) — each would get its own explicit slot/alias entry when tokens exist, plus the separate camelCase-slot fix (Nuxt slots like `linkTrailingBadge`). No such tokens today.
- A distinct `closeIcon` slot (the old export's `close-icon-*` tokens are gone) — if the designer re-adds an icon-inside-button anatomy, that is a separate two-slot increment.
- Making the preview button interactive (click handler) — it is a visual/structural mechanic only.

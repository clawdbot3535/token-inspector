# Render-vs-Tokens Diff — Spec 2 — Design

**Date:** 2026-06-17
**Status:** Approved
**Type:** Feature — the fidelity verdict (Spec 2 of the render-vs-tokens check)
**Parent:** office-hours direction `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260617-040911.md` + Spec 1 (`2026-06-17-real-render-fidelity-design.md`, the compiler-enabled real render, shipped v0.32.0).

## Context

Spec 1 shipped the foundation: a real Nuxt UI v4 `<UButton>` themed by the generated recipe in the
"Real" tab, runtime-compiled by `@tailwindcss/browser` (proven: the button's bg === its
`--color-action-bg` token). Spec 2 adds the **verdict**: diff the rendered button's computed styles
against what the recipe intends, and report attributed per-property deltas. This is the "does my
config faithfully render" answer the Coverage Guide doesn't give.

**What it catches:** the rendered `base` vs the recipe's `base` intent — i.e. Nuxt UI's merge
overriding or dropping a token-driven class, or a compile miss. (Grammar slot-misrouting is a
recipe-level bug caught by the recipe-engine/scanner tests; this validates "Nuxt UI faithfully
applied my recipe to the pixel.")

## Scope (locked)

Base slot only (the `<button>` element — unambiguous, no fragile per-slot child-querying); button;
the resting/default variant `LiveRealButton` already renders; the property set `extractArbitrary`
yields for the base classes (bg → `backgroundColor`, `rounded` → `borderRadius`, `p` → `padding`,
`border` → `borderWidth`/`borderColor`, ring → `boxShadow`, `text` → `color`, font → …). Auto-run
when the Real tab is open (after the compiler paints).

## Architecture

### 1. Pure differ — `src/app/render-diff.ts`

```ts
export interface RenderDelta {
  property: string;   // e.g. "backgroundColor"
  expected: string;   // getComputedStyle-resolved expected value
  actual: string;     // getComputedStyle of the rendered element
  match: boolean;
}

/** Compare expected (recipe-intent) vs actual (rendered) computed maps, one entry per expected key. */
export function diffComputed(
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
): RenderDelta[];
```

Pure (maps in, deltas out), no DOM. One `RenderDelta` per key in `expected`; `match = expected[k].trim() === actual[k]?.trim()`. jsdom-unit-testable with fed maps. Both sides arrive already
`getComputedStyle`-normalized (see §2), so plain string equality is sound — no `rgb()`-vs-hex or
unit reconciliation.

### 2. Browser resolution — `src/app/composables/use-render-diff.ts`

A composable that, given the rendered button element and the base class string, produces the deltas:
- **Expected:** `const { style } = extractArbitrary(baseClasses)` → apply `style` to a hidden probe
  `<div>` appended to `document.body` → `getComputedStyle(probe)[prop]` for each `prop` in
  `keys(style)` → the expected-resolved map. Remove the probe.
- **Actual:** `getComputedStyle(buttonEl)[prop]` for the same keys.
- Return `diffComputed(expected, actual)`.

Browser-only (jsdom can't compute Tailwind/`var()`; the composable guards `typeof document` and is a
no-op / returns `[]` outside a browser). It reuses the existing `extractArbitrary` (the same resolver
the `Live*` previews use) for the expected side, and the probe routes both sides through the
browser's own canonicalizer.

### 3. `LiveRealButton.vue` — surface the deltas

After the real `<UButton>` renders (and `@tailwindcss/browser` paints — a `requestAnimationFrame` /
microtask after mount), `LiveRealButton` obtains the rendered button element (a template ref) and the
composed `baseClasses` (the same `ui.base` it already builds), runs `useRenderDiff`, and renders a
compact **delta table** under the button: one row per property — `property · expected · actual` with a
`✓`/`✗` marker — plus a headline `N/M properties match`. Mismatches are visually flagged.
`data-testid="render-delta"` per row + `data-testid="render-diff"` on the table for tests.

### 4. Data flow

```
recipe.base classes
   ├─▶ extractArbitrary → style map → hidden probe → getComputedStyle  = EXPECTED
   └─▶ applied to real <UButton :ui> (Spec 1) → rendered button → getComputedStyle = ACTUAL
                              ▼
                   diffComputed(expected, actual) → RenderDelta[]  → delta table
```

## Testing

The pure/DOM split mirrors Spec 1.

- **`src/app/render-diff.test.ts`** (jsdom, pure): identical maps → all `match: true`, no false deltas;
  a differing property → one `RenderDelta` with both values and `match: false`; a key present in
  `expected` but missing in `actual` → `match: false` (actual `""`/undefined handled).
- **`src/app/components/LiveRealButton.test.ts`** (extend): given a fixture delta list (inject via the
  composable mocked, or feed a computed), the delta table renders one `render-delta` row per property
  with the right marker + the `N/M match` headline. (Plumbing, not computed styles.)
- **`/browse` smoke (the real verdict):** load the export, button → Real tab; assert the delta table
  shows all-✓ for the faithful pipeline; then inject a deliberate override (e.g. force the button's
  `border-radius` via devtools/JS) and confirm a ✗ row appears. This is the fidelity proof; it lives
  in `/browse`, not jsdom.

## Out of scope (later increments)

Other slots (label/leadingIcon — needs per-slot DOM querying); the full variant × size matrix;
pseudo-states (`hover:`/`active:`); the multi-element composites; the Figma-frame diff (Approach B).

## Success criteria

- `diffComputed` is pure + jsdom-tested; one delta per expected property; string-equality sound.
- The Real tab shows a per-property expected/actual/✓-✗ table for button's base slot, auto-computed.
- `/browse`: a faithful pipeline reads all-✓; an injected override reads ✗.
- Unit suites green; the browser verdict documented via `/browse`.

## Release

Minor — the fidelity verdict (delta table) in the Real tab. README "Inspector UI" note; test-count bump.

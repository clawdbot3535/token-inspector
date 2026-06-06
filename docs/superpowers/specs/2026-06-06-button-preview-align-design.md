# Design: align the `button` preview with `badge` (size switch + header score)

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/button-preview-align`
- **Theme:** bring `LiveButton` in line with the badge preview's size handling — drop the
  size-axis row (the `sm/md/lg` buttons), move the completeness score into the header next to the
  size switcher, and derive the switcher's sizes from the recipe.

## Problem / goal

`LiveButton` renders, per variant row: a **size-axis** row (`sizeCells` — all sizes side by
side, each with a per-size completeness badge), a **state-axis** row (`stateCells` at the
switcher-selected size), and a size switcher in the header (`stateAxisSize`, fixed `sm/md/lg`).
The size-axis row is redundant with the switcher, and the per-cell score is scattered. `LiveBadge`
(just shipped) settled on the cleaner pattern: a size switcher + a single active-size score in the
header, and one row for the selected size. Align `LiveButton` to it.

Success criteria, per variant row:
- The header reads `[variant label] [size switch] [active-size score n/m] [copy]`.
- The **size switch derives its sizes from the recipe** (so `button`'s real `xs/sm/md/lg` show,
  not a fixed `sm/md/lg`), mirroring `LiveBadge`'s `selectedSize`/`activeSize` mechanism.
- The **size-axis row is gone** (`sizeCells` removed).
- The **state-axis row stays**, rendered at the active size (button is interactive, unlike the
  static badge) — and becomes the only row (the axis-label column drops, like badge).
- `LiveBadge`/`LiveInput` and the engine/scanner are untouched; full suite + typecheck + build
  green; headless QA confirms the switch flips the state row's size and the score updates.

## Decisions

- **Reuse `LiveBadge`'s switch mechanism.** Replace the fixed `SIZES = ["sm","md","lg"]` const +
  `stateAxisSize: Size` ref with: a `sizes` computed (recipe `variants.size` keys, ordered via
  `SIZE_ORDER`, `"default"` fallback), a `selectedSize` ref (default `"md"`), and an `activeSize`
  computed guard (`sizes.includes(selectedSize) ? selectedSize : sizes[0] ?? "default"`). Same
  shape as `LiveBadge` — consistent, and fixes that the switch never showed `xs`.
- **Score → header, active size.** The completeness badge moves from the per-size `sizeCells` to
  the variant-row header, showing `cellCompleteness(activeSize)` (one n/m), mirroring badge's
  `activeCompleteness`.
- **Keep the switch per variant row.** It is already per-row today (every row's switch is bound
  to the same shared ref). Hoisting it to a single global header is a larger restructure and out
  of scope; the per-row header is the minimal faithful change.
- **State row only, at the active size.** `stateCells` already projects at the selected size;
  point it at `activeSize`. Drop the `size`/`state` axis-label grid column — with one row it is
  clutter (badge has no axis label).
- **No shared composable.** Same call as the badge cycle: the duplication is acceptable; extract
  only if a later component forces it. (`LiveBadge` and `LiveButton` now share the
  `selectedSize`/`activeSize`/`sizes` shape by convention, not code — intentional for now.)

## Design

### `src/app/components/LiveButton.vue` (revise)

- **Script:**
  - Remove `SIZES`, the `Size` type, and the `sizeCells` field of `VariantRow`.
  - Add (mirroring `LiveBadge`): `const SIZE_ORDER: readonly string[] = ["xs","sm","md","lg","xl"]`;
    `const sizes = computed(() => { const k = Object.keys(buttonRecipe.value?.variants.size ?? {}); return k.length ? [...k].sort((a,b)=>SIZE_ORDER.indexOf(a)-SIZE_ORDER.indexOf(b)) : ["default"]; })`;
    `const selectedSize = ref<string>("md")`; `const activeSize = computed(() => sizes.value.includes(selectedSize.value) ? selectedSize.value : (sizes.value[0] ?? "default"))`.
  - `variantRows` keeps `stateCells` (built at `activeSize.value` instead of `stateAxisSize.value`),
    `inspectClasses`, `segments`; drops `sizeCells`.
  - Add `const activeCompleteness = computed(() => cellCompleteness(activeSize.value))` — used in
    each row header. (`cellCompleteness` stays; it is keyed by size = `variantKey`.)
- **Template (per variant row):**
  - Header: variant label, then the size switcher (now `v-for="s in sizes"`, `activeSize === s`
    highlight, `@click="selectedSize = s"`, `data-testid="button-size-switch"`), then the
    active-size score (`v-if="activeCompleteness"`, the same emerald/amber n/m markup), then the
    existing copy button (`ml-auto`).
  - Remove the entire **size-axis** block (the `size` label cell + the `sizeCells` loop).
  - Keep the **state-axis** block but drop the `grid-cols-[72px_1fr]` axis-label layout: render
    the `stateCells` as a single wrapping flex row (the `<button>` cells unchanged, incl. the
    leading icon gate and the blue fallback styling). Keep `data-testid` parity if any exists; the
    cell `<button>`s stay as-is.
  - Code block unchanged.

### Tests (`src/app/components/LiveButton.test.ts`) — update

Read the current tests first; they assert on the size-axis + state-axis structure. Update to the
new shape:
- Any assertion counting **size-axis** cells / a `size`-labelled row → removed.
- **switcher present:** `findAll('[data-testid="button-size-switch"]').length` equals the recipe's
  size count (≥2 for a multi-size fixture).
- **state row at active size + switch flips it:** capture a state cell's inline `style` (e.g.
  `fontSize` or `height`) for the default active size, click another size button (`await trigger`),
  assert it changes — mirror the badge switch test (compare an inline style, not the class
  attribute, since `extractArbitrary` inlines scale/arbitrary values).
- **score in header:** with a `completeness` prop for the active size, the header renders the n/m.
- Keep: the JIT-class guard (state cells resolve ring/height to inline styles), the disabled
  opacity/cursor cue, the fallback ("No … tokens") message.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Headless QA (committed `components/*.tokens.json`): select `button`; confirm per variant the
  header shows the size switch (xs/sm/md/lg) + a score, **no** size-axis row, the state row
  changes size when the switch is toggled (compare an inline metric after the Vue flush — wait a
  tick, the badge-switcher QA lesson), console clean. Screenshot.

## Out of scope
- Hoisting the switch/score into a single header above all variant rows.
- A shared switcher composable across `LiveButton`/`LiveBadge`.
- Any change to `LiveBadge`, `LiveInput`, the recipe engine, or the scanner.

## Risks
- **Test churn:** the existing LiveButton tests are coupled to the size-axis grid; several
  assertions change. Mitigated by reading them first and porting to the badge-style assertions.
- **`activeSize` reactivity across graph changes** — same guard as badge (`activeSize` never
  trusts the raw ref against the current size set).
- **Headless flush timing** — assert size changes only after a Vue flush (the badge-switcher QA
  false-negative lesson): wait a tick between click and read.

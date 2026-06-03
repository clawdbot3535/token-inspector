# Design: `input` recipe verification + LiveInput preview (Cycle A)

- **Date:** 2026-06-03
- **Status:** DRAFT (awaiting user review)
- **Target version:** v0.5.0 (recipe-output track)
- **Sequencing:** This is **Cycle A**. **Cycle B** (deviation-detection layer) follows
  as a separate spec → plan → implementation cycle and consumes the deviations this
  cycle surfaces.
- **QA constraint:** No push until QA is complete and the user approves. CI runs only
  after an explicit push decision.

## Context

The recipe engine (`buildComponentRecipes`) is component-agnostic: it iterates every
component-layer node whose name is in `COMPONENT_ALLOW_LIST` (which already contains
`input`). So `input-*` tokens already emit a `ui.input.*` block today — but that output
has never been verified against Nuxt UI v4, and nothing pins it (the golden snapshot
has zero `input` references). Only `button` has a bespoke live preview (`LiveButton.vue`);
`LiveInput` is listed as v0.5.0+ work in the README roadmap.

The Figma export (`components/*.tokens.json`) carries **23 real `input` leaf tokens**:

```
input-bg-disabled            input-border                 input-border-disabled
input-border-error           input-border-focus           input-border-hover
input-border-success         input-font-size              input-font-weight
input-height                 input-icon-size-md           input-outline-bg
input-padding-x              input-padding-y              input-placeholder
input-placeholder-disabled   input-radius                 input-radius-focus
input-ring-focus             input-ring-offset            input-solid-bg
input-text                   input-text-disabled
```

## Goal

Ship a **verified, golden-pinned `ui.input` recipe** and a bespoke **`LiveInput.vue`**
preview, matching the treatment `button` already has, **without changing the recipe
engine or slot-mapping grammar**. Every deviation the engine produces for `input` is
surfaced and documented as a seed case for Cycle B, never silently corrected.

Success criteria:

- A snapshot test pins the exact `ui.input` recipe block. Future engine changes that
  alter it become visible diffs.
- `LiveInput.vue` renders a real `<input>` with the recipe's resolved styles and a
  static row of interaction states, with **no reliance on Tailwind JIT** (arbitrary
  values resolved to inline styles via `extractArbitrary`).
- A LiveInput component test verifies state rendering and arbitrary→inline-style.
- The full suite + typecheck pass; golden `app.config.ts` snapshot stays consistent.
- The known `input` deviations are written down as Cycle-B seeds.

## Verify findings — current `ui.input` output (baseline)

Running the existing CLI (`tsx scripts/build-cli.ts`) over the real `components/`
export emits today:

```js
input: {
  slots: {
    base: "border-[var(--color-border-default)] disabled:bg-[var(--color-state-disabled-bg)] \
disabled:border-[var(--color-state-disabled-border)] disabled:placeholder:text-[var(--color-text-disabled)] \
disabled:text-[#A1A1AA] focus:border-[var(--color-state-focus-ring)] focus:ring-[var(--color-state-focus-ring)] \
focus:rounded-lg font-[400] h-[36px] hover:border-[var(--color-border-strong)] \
placeholder:text-[var(--color-text-muted)] px-1.5 py-2 ring-offset-[4px] rounded-md text-[#18181B] text-sm",
  },
  variants: {
    size:    { md: { leadingIcon: "size-4" } },
    variant: {
      outline: { base: "bg-[var(--color-bg-base)]" },
      solid:   { base: "bg-[var(--color-bg-subtle)]" },
    },
  },
}
```

Findings:

1. **State prefixes are correct** (`focus:`, `hover:`, `disabled:`, and the nested
   `disabled:placeholder:text-…`). The v0.4.4 state-encoding fix carries `input` cleanly.
2. **`input-border-error` and `input-border-success` are silently dropped** — 2 of 23
   tokens produce no output. Their shape is `<comp>-border-<colorrole>`; the grammar
   checks the 2nd segment for a variant and finds `border` (a utility), so the trailing
   `error`/`success` color-role never maps and `getSlotMapping` returns `null`. This
   violates "never silently swallow."
3. **`solid` is not a valid Nuxt UI v4 `input` variant** (valid: `outline`/`soft`/
   `subtle`/`ghost`/`none`). `outline` is correct; `solid` is a deviation.
4. **`ring-offset-[4px]` without a base ring is invisible** (only `focus:ring-…` exists);
   known Tailwind ring-offset semantics from the v0.4.5 work.

## Decisions

- **Approach:** verify-pin-preview. No engine or grammar changes. (Alternatives —
  correcting deviations in A, or generalizing `LiveButton` into a generic
  `LiveComponent` — were rejected: the first pre-empts Cycle B's job ad-hoc; the
  second is premature DRY before the Rule of Three and risks regressing the working
  button preview.)
- **LiveInput state matrix:** render only the states the recipe actually produces —
  **default / hover / focus / disabled** — plus a `leadingIcon` cell. `error`/`success`
  are dropped by the engine and are therefore **not** rendered; they are documented as
  a Cycle-B seed rather than fixed here.
- **No new live-preview abstraction:** `LiveInput.vue` is a focused, standalone
  component that reuses `extractArbitrary`, mirroring `LiveButton.vue`'s pattern.

## Design

### A1 — Verify & golden-pin the `ui.input` recipe

- Add a snapshot/assertion test (in `recipe-engine.test.ts` or a dedicated
  `app-config` golden) that pins the exact `ui.input` block shown above, built from a
  representative `input` token fixture (or the real export, consistent with how the
  existing golden snapshot is produced).
- The pinned snapshot **includes** the `solid` variant and the `ring-offset` artifact —
  this is the honest baseline. Future Cycle-B resolution will change the snapshot
  intentionally and visibly.
- No production code changes in this step.

### A2 — `LiveInput.vue` (new, standalone)

- **Props** (mirroring `LiveButton.vue`): `graph`, `componentName` (default `"input"`),
  `highlightClass`, `completeness`.
- Builds the recipe via `buildComponentRecipes(graph, { components: ["input"] })` and
  reads `recipe.slots.base`, `recipe.variants.size.md.leadingIcon`.
- **State cells:** for each of `default | hover | focus | disabled`, project
  `slots.base` and **promote** the matching pseudo-class-prefixed utilities to the base
  (strip the `focus:` / `hover:` / `disabled:` prefix so the state is statically
  visible without interaction), exactly as `LiveButton` promotes its state cells. Run
  the projected class string through `extractArbitrary` → `{ classes, style }`. The
  `disabled` cell additionally applies `opacity` / `cursor` overrides via an immutable
  spread (no mutation of the `extractArbitrary` result — per the immutability rule and
  the existing LiveButton precedent).
- Renders a real `<input>` element with placeholder text so the placeholder color is
  visible, plus a `leadingIcon` cell showing `size-4`.
- A small `n/m` completeness badge mirrors LiveButton.

### A3 — Tests

- `LiveInput.test.ts` (`@vue/test-utils` + jsdom, like `LiveButton.test.ts`): asserts
  the four state cells render, arbitrary values land as inline styles (not classes),
  and the disabled cell carries the opacity/cursor overrides.
- Golden snapshot for the `ui.input` recipe (A1).
- If A2 introduces any class-resolution path, add a highlight↔recipe parity test
  consistent with the `utilityForMapping` single-source precedent.

### A4 — End-to-end QA (no push)

- Run the CLI over the real `components/` export and confirm the emitted `ui.input`
  block matches the pinned snapshot.
- Mount `LiveInput` in the Inspector and visually confirm the four states render with
  correct borders/radius/padding/placeholder. User performs this locally.
- Full `typecheck` + `test` + `build` green locally before any push decision.

## Out of scope — Cycle B seeds (documented, not fixed here)

These are written down so Cycle B's detection layer has concrete first cases:

- **`silently-dropped-token`:** `input-border-error`, `input-border-success` produce no
  output because `<comp>-border-<colorrole>` matches no mapping rule. Cycle B should
  detect and surface dropped component tokens.
- **`variant-not-in-target`:** `input-solid-bg` emits `variants.variant.solid`, but
  `solid` is not a Nuxt UI v4 `input` variant. Cycle B's detection + resolution
  (`nuxt` alias / accept / custom) covers this.
- **`ring-offset-without-ring`:** already understood (v0.4.5); listed for completeness.

This is consistent with the deviation-workflow design (detect → show → resolve): the
job is to make every deviation visible, not to enumerate or silently correct them.

## Risks

- **JIT preview pitfall (recurring):** if any `input` recipe utility family is new to
  `extractArbitrary`'s `ARBITRARY_TO_CSS` / `SCALE_TO_CSS` maps, the LiveInput cell
  renders nothing for that property. Mitigation: verify each emitted utility resolves;
  add missing families to the maps (this is the documented recurrence point).
- **Snapshot brittleness:** the pinned `ui.input` block depends on the real export and
  on `component-vocab.ts` vocabulary. A token-source change will (correctly) require a
  snapshot update; that is the intended signal, not a flake.

## Cycle B (next, separate spec)

Detection layer: a `silently-dropped-token` detector and a `variant-not-in-target`
detector in the scanner, reusing the `single-mode-semantic` pattern from v0.4.2,
surfaced in the Scan View. Alias/custom resolution (`nuxt?: string`,
`custom: true` → `customRecipes`) follows in later sub-cycles. The deviations listed
above are its first test cases. Full prior design: the May 31 office-hours DRAFT at
`~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260531-144712.md`.

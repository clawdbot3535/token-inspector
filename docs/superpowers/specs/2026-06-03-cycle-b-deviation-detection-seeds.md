# Cycle B — Deviation Detection Seeds (from `input` QA)

- **Date:** 2026-06-03
- **Status:** SEEDS (input for the Cycle-B brainstorm → spec → plan)
- **Relates to:**
  - Cycle-A spec `docs/superpowers/specs/2026-06-03-input-recipe-and-live-preview-design.md`
  - Deviation-workflow DRAFT (detect → show → resolve), May 31 office-hours:
    `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260531-144712.md`

## Purpose

Cycle A shipped the `input` recipe + LiveInput and deliberately left every `input`
deviation **visible but unresolved**, as seeds for Cycle B's detection layer. QA of the
rendered `input` surfaced concrete deviation cases, grounded against the real Nuxt UI v4
`input` theme and the real `components/*.tokens.json` export. They cluster into three
detector families below. Each names: the smell, the evidence, why it is wrong, the
proposed resolution, and whether it needs an engine extension.

Unifying observation: in every case the **Figma model and the Nuxt UI model diverge in a
way the current recipe schema (`slots` + `variants.{size,color,variant}`) cannot express**.
The detection layer's job is to make each divergence visible and never silently emit
plausible-but-wrong output.

Nuxt UI v4 `input` theme facts used below (from the Nuxt UI MCP, `get-component Input`):
- The input frame is a **`ring`**, not a CSS border: `variant.outline = 'text-highlighted
  bg-default ring ring-inset ring-accented'`.
- **error/success are the `color` prop**, not a state. Coloring is in `compoundVariants`,
  e.g. `{ color: 'error', highlight: true, class: 'ring ring-inset ring-error' }` and
  `{ color: 'error', variant: ['outline','subtle'], class: 'focus-visible:ring-2
  focus-visible:ring-error' }`. A `UFormField` sets `color="error"` + `highlight=true`
  on validation.
- Leading/trailing padding is a `compoundVariant` on `leading`/`trailing` × `size`
  (e.g. `{ leading: true, size: 'md', class: 'ps-9' }`).

---

## D1 — Bare `text` color token misclassified as `text-size` (FIXED 2026-06-03)

**Root cause (corrected):** the alias machinery is healthy — `input-text` resolves to
`color-text-primary` and the color resolver returns a `var()` reference. The bug was in
`heuristicSlotMapping` (`src/slot-mapping.ts`): a bare `text` utility only routed to
`text-color` when a variant/color-role axis was present, so axis-less color tokens
(`input-text`, `input-text-disabled`, `textarea/text`) fell through to `text-size`,
bypassing the color path and leaking a hardcoded `text-[#hex]`.

**Fix:** classify bare `text` as `text-color` when the token's value type is `color`,
threaded through all `getSlotMapping` call sites. See
`docs/superpowers/specs/2026-06-03-d1-text-color-classification-design.md`.

**Follow-up (not done):** a `hardcoded-color` detector for genuinely alias-less color
tokens. A scan of the current export found exactly one (`modal-overlay-bg`), so this is
deferred as low-value for now.

---

## D2 — `border` vs `ring` (utility/semantic mismatch)

**Smell:** `input-border-*` tokens emit CSS `border-[…]`, but a Nuxt UI input has **no
border** — its frame is a `ring`.

**Evidence:** Nuxt theme `variant.outline = '… ring ring-inset ring-accented'` (no
`border`). Our recipe emits `border-[var(--color-border-default)]`,
`hover:border-[var(--color-border-strong)]`, `focus:border-[var(--color-state-focus-ring)]`
(alongside a `focus:ring-…`, so the focus case currently emits **both** a border and a
ring — doubled/!conflicting).

**Why it is wrong:** the Figma "border" of an input maps semantically to Nuxt's **ring**.
Emitting a CSS border paints a second frame Nuxt never uses and can conflict with the
ring on focus.

**Detector (`border-is-ring`):** for ring-framed components (input, and likely textarea,
select), `*-border-*` tokens → flag that the target utility is `ring`, not `border`.

**Resolution (decision for Cycle B):** a per-component utility remap (border-color →
ring-color) for ring-framed components, expressed in slot-mapping rather than hardcoded.
Touches the slot grammar / a remap rule; weigh against keeping border for genuinely
border-framed components elsewhere.

---

## D3 — Validation color (`error` / `success`) = `color` prop × compoundVariant

**Smell:** `input-border-error` / `input-border-success` are silently dropped today, and
are **structurally inexpressible** in the current recipe schema even if the grammar were
patched.

**Evidence:**
- Grammar: `input-border-error` is `<comp>-<utility>-<colorrole>` — the color-role is the
  trailing segment after the utility, which the 2nd-segment variant grammar does not
  recognize, so `getSlotMapping` returns `null` → dropped.
- Nuxt semantics: error/success are the `color` prop, colored via `compoundVariants`
  (`{ color:'error', highlight:true, class:'ring ring-inset ring-error' }`), applied on
  focus or persistently with `highlight` — **not** a state and **not** a plain
  color-variant base. The recipe schema has no `compoundVariants`.

**Why a naive grammar fix is wrong:** mapping to `variants.color.error.base =
border-[…]` would (1) emit a CSS `border` (Nuxt uses `ring`), and (2) place it
persistently on base (Nuxt shows error only via focus/highlight). Silent mis-emit.

**Detector (`validation-color-not-expressible`):** a `*-border-<error|success|…>` (or any
validation color-role) token on a component whose Nuxt theme colors that role via
`color` + `compoundVariants` → flag as not expressible in the current schema.

**Resolution (decision for Cycle B):**
- (A) **Treat as semantic color (often zero-config):** `ring-error` already references the
  global `--ui-error` / error color token. If the Figma `input-border-error` value equals
  the global error color, the token is redundant — it belongs to the color layer and the
  input inherits it via `color="error"`; `ui.input` emits nothing. The detector should say
  "matches the semantic error color, no input override needed."
- (B) **Input-specific override (value differs):** emit a `compoundVariant`
  `{ color:'error', variant:'outline', class:'ring-[<value>]' }` in
  `ui.input.compoundVariants`. This is a **new engine emit path** (compoundVariants do not
  exist today) — its own design decision / sub-cycle.

---

## Cross-cutting: engine capability gaps these expose

1. **`com.figma.aliasData` resolution** — recover semantic var() refs for override-resolved
   tokens (D1).
2. **Per-component utility remap** — `border` → `ring` for ring-framed components (D2).
3. **`compoundVariants` emit path** — for color × variant × highlight/state combinations
   (D3, and likely needed for other Nuxt components later).

These are candidate scope for the Cycle-B spec. D1 is the most bug-like (lost data) and the
cheapest standalone win; D2/D3 are Nuxt-fidelity deviations that interact with the recipe
schema. The Cycle-B brainstorm should decide ordering and which capability gaps to take on
first, consistent with the detect → show → resolve layering from the May 31 design.

# Design: `textarea` live preview

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/textarea-live-preview`
- **Theme:** a live preview for the `textarea` component, the third after `button` and `input`.
  A gap-filler between the larger roadmap cycles (sub-element routing → divergence-flag rebuild
  → custom layer).

## Problem / goal

`textarea` has a recipe but no rendered preview, so the sidebar shows no `Live` pill for it and
the inspector can't show its resolved output. Add a faithful, JIT-safe preview like `LiveInput`.

Key finding that shapes (and shrinks) this cycle: the `textarea` recipe emits a base whose
**structure is identical to `input`** — ring-framed, `px-1.5 py-2`, `text-sm`, `font-[400]`,
placeholder, and the `hover:`/`focus:`/`disabled:` state prefixes — and it has **no icon-size
token** (so no leading/trailing icons). Its `min-height` and `resize` tokens are **unmapped**
(adapter gaps, excluded from the unsupported-part hint via `NON_PART_SEGMENTS`), so they are
**not in the output**. Therefore the preview needs **no new `extract-arbitrary` work**: every
utility family in `textarea.slots.base` is already handled by the `LiveInput` pipeline.

So the preview is, at its core, the `LiveInput` pipeline rendering a `<textarea>` instead of an
`<input>`, with no icons. **Approach A (chosen): generalise `LiveInput`** rather than duplicate
(`LiveTextarea`) or refactor into a shared composable — the two form fields differ only by the
rendered element, so the element swap is the smallest, lowest-risk change.

Success criteria:
- Selecting the `textarea` component (or a `textarea-*` token) renders a multi-line `<textarea>`
  preview across `default` / `hover` / `focus` / `disabled` states, with no icons.
- The sidebar shows the `Live` pill for `textarea`.
- The preview is JIT-safe (classes resolved to inline styles by the existing `extractArbitrary`),
  matching the CLI output — no new `extract-arbitrary` entries.
- Existing `input`/`button` previews unchanged; full suite + typecheck + build green; headless QA
  clean.

## Decisions

- **Generalise `LiveInput` (Approach A).** `textarea` is `input` as a multi-line element; the
  recipe pipeline, state projection, completeness badge, copy button, and highlight code block
  are identical. Derive multi-line from the component name — no new prop, no duplication, no
  refactor of the (tested) `LiveInput` internals.
- **Element swap by `v-if`/`v-else`**, not `<component :is>` — `<input>` and `<textarea>` differ
  in attributes (`type="text"` vs `rows`), so explicit branches are clearer than a dynamic tag.
- **No resize handle in the preview.** `resize` is not in the recipe output and a draggable
  handle is a distraction in a static preview → `style="resize:none"` on the preview `<textarea>`.
  `rows="3"` gives a sensible multi-line height (the recipe emits no `min-height`).
- **Icons stay recipe-gated.** `hasIcons` is already `false` for `textarea` (no icon-size
  token), so the existing `UIcon` elements simply don't render — no template branching for icons.
- **Out of scope:** surfacing the unmapped `min-height`/`resize` tokens in the preview (the
  preview shows what the recipe emits, not what Figma wishes); any `extract-arbitrary` additions;
  a shared composable refactor (Approach C) — revisit only if a third form field arrives.

## Design

### 1. `src/app/components/LiveInput.vue` (generalise)

- Add `const multiline = computed(() => props.componentName === "textarea");`.
- In the input wrapper (`<div class="relative inline-flex …">`), replace the single
  `<input type="text" …>` with two branches sharing every binding (`:class`, `:style`,
  `:disabled`, `:aria-label`, `placeholder`):
  ```vue
  <textarea
    v-if="multiline"
    rows="3"
    placeholder="Placeholder"
    :aria-label="`${componentName} preview — ${cell.label} state`"
    :class="[cell.inputClasses, 'w-full']"
    :style="{ ...cell.style, resize: 'none' }"
    :disabled="cell.label === 'disabled'"
  />
  <input
    v-else
    type="text"
    placeholder="Placeholder"
    :aria-label="`${componentName} preview — ${cell.label} state`"
    :class="[cell.inputClasses, 'w-full']"
    :style="cell.style"
    :disabled="cell.label === 'disabled'"
  />
  ```
  (The leading/trailing `UIcon`s and the wrapper stay; they render only when `hasIcons`.)
- Generalise the `aria-label` from the hard-coded "Input preview" to `${componentName} preview`
  (so the textarea is not announced as "Input").
- No change to the script's recipe/state/icon logic — `componentName="textarea"` already drives
  `buildComponentRecipes`, `hasIcons`, and `stateCells` correctly.

### 2. `src/app/App.vue` (wiring)

- `COMPONENTS_WITH_PREVIEW = new Set(["button", "input", "textarea"]);` — enables the `Live`
  pill (via `:preview-components`) and `previewSupported` for `textarea`.
- Both `LiveInput` mount sites (the token-selected block and the component-selected block):
  broaden the gate from `selectedComponent === 'input'` to also accept `'textarea'`, so
  `LiveInput` renders both form fields and the `v-else-if LiveButton` only fires for `button`.
  Use a shared predicate to avoid drift, e.g. `selectedComponent === 'input' || selectedComponent === 'textarea'`.

### 3. Tests (`src/app/components/LiveInput.test.ts`)

- Existing `input` tests stay green (no behaviour change for `input`).
- Add (using the existing mount harness + a graph that has `textarea` tokens — mirror the
  fixture style already in the file):
  - **renders a `<textarea>` for `componentName="textarea"`** — `wrapper.find("textarea").exists()`
    is true and `wrapper.find("input").exists()` is false.
  - **renders the four states** — one preview cell per `default`/`hover`/`focus`/`disabled`
    (assert the count of state cells / labels, as the input test does).
  - **no icons for textarea** — `wrapper.findAllComponents(UIcon)` (or the icon selector the file
    already uses) is empty, since the textarea recipe has no icon-size token.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Against the loaded export (the app ingests the committed `components/*.tokens.json`): headless
  QA — select the `textarea` component, confirm a multi-line `<textarea>` preview with the four
  states and no icons; confirm the sidebar `Live` pill on `textarea`; console clean. Screenshot
  for the record.

## Risks
- **`LiveInput` now renders two element types.** Mitigated: the swap is a single `v-if`/`v-else`
  on a derived `multiline`; all other logic is shared and already tested. The component's name
  stays `LiveInput` (the form-field preview); a rename is scope creep.
- **A future third form field** (e.g. a select) would push toward the composable (Approach C).
  Noted, not pre-built (YAGNI).
- **`min-height` unmapped** means the preview height comes from `rows="3"`, not the token. This
  is faithful to the output (the token isn't emitted); if routing later maps `min-height`, the
  preview will pick it up automatically through `extractArbitrary` (it already maps `h-[…]`; a
  `min-h-[…]` entry would be that cycle's concern, not this one).

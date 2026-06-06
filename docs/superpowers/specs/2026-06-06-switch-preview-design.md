# Design: switch preview (inventory extension + LiveSwitch)

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/switch-preview`
- **Theme:** first of the form-control previews. Extend `NUXT_SLOTS` to `switch`/`radio` (so
  `switch-thumb-*` can route), add a `checked` projection state, and build `LiveSwitch` — a
  token-driven track + a decorative thumb, unchecked/checked.

## Problem / goal

The `switch` recipe's **track is fully token-driven** (`switch-bg`, `switch-bg-checked` [checked
state], `switch-border`, `switch-width-*`, `switch-height-*`, `switch-radius`, `switch-padding`,
`switch-ring-offset` all map to `base`), but `switch` has no `NUXT_SLOTS` entry and no preview.
Build `LiveSwitch` to render the track in its unchecked + checked states with the size switch,
and add `switch`/`radio` to the inventory so their sub-elements route per Item A.

Findings that shape it:
- After adding `switch` to `NUXT_SLOTS`, `switch-thumb-border` routes to `slots.thumb`, but
  `switch-thumb-color`/`switch-thumb-size-*` stay null — their utility names (`color`, `size`) are
  not recognised by the grammar. So the **thumb is not meaningfully token-driven**. Nuxt's default
  thumb is a plain `bg-default` (white) circle, so a **decorative thumb is faithful enough**.
- The checked track colour is encoded as `checked:bg-[…]` in the recipe base, but `projectToState`
  doesn't know `checked` (it leaves the prefix untouched → JIT-invisible). Add `checked` to the
  projection.
- `radio`'s dot is the Nuxt `indicator` slot; `radio-dot` won't route (exact-match: `dot` ≠
  `indicator`) — it stays `unsupported-part`-flagged. Adding `dot`→`indicator` to
  `FIGMA_NUXT_PART_ALIAS` makes that flag suggest the rename (radio preview is a later cycle).

Success criteria:
- `NUXT_SLOTS` gains `switch` and `radio` (exact Nuxt slot sets). `switch-thumb-border` routes to
  `slots.thumb` (verify); the `unsupported-part`/`capability-gap` sets stay sane (switch's mapped
  track tokens aren't flagged; `radio-dot` flagged with a `dot`→`indicator` rename suggestion).
- `projectToState` supports `checked` (promotes `checked:`-prefixed classes; drops them on
  `default`). No change to existing previews (no component but switch has `checked:` classes).
- `LiveSwitch` renders a token-driven pill track (width/height/radius/bg/border) in **unchecked**
  and **checked** cells (the track bg differs), with a decorative thumb positioned left/right, and
  a `sm/md` size switch (badge-style). Wired into `App.vue` + the `Live` pill.
- Full suite + typecheck + build green; headless QA shows the toggle.

## Decisions

- **Token-driven track, decorative thumb.** The track is the bulk of a switch's appearance and is
  fully token-driven; the thumb's color/size tokens don't map (grammar doesn't know `color`/`size`
  utilities) and Nuxt's thumb is a plain circle anyway — so the preview draws a neutral thumb,
  positioned by the preview (not token-driven).
- **`checked` is a projection state**, not a prop-driven drop. Unlike `input`'s `active`→`highlight`
  (dropped), `switch-bg-checked` IS emitted as `checked:bg-[…]` in the recipe; the preview renders
  it by projecting `checked`. Add `checked` to `PREVIEW_STATES` + `STATE_PREFIXES`.
- **Inventory adds both `switch` and `radio`** (radio now, its preview later) so radio's routing +
  rename hint land in the same inventory pass; `dot`→`indicator` added to the alias for radio's hint.
- **Two cells: unchecked + checked** (the switch's defining axis), with a size switch. hover/focus/
  disabled are out of scope for v1 (a switch's identity is the on/off toggle).
- **No shared composable** — bespoke `LiveSwitch`, consistent with the other `LiveX` files.

## Design

### 1. `component-vocab.ts`
- `NUXT_SLOTS` += (exact Nuxt theme slots):
  - `switch`: `{ root, base, container, thumb, icon, wrapper, label, description }`
  - `radio`: `{ root, fieldset, legend, item, container, base, indicator, wrapper, label, description }`
- `FIGMA_NUXT_PART_ALIAS` += `["dot", "indicator"]` (radio dot → Nuxt indicator; drives the
  `unsupported-part` rename suggestion only — exact-match routing still won't route `dot`).

### 2. `project-to-state.ts`
- Add `"checked"` to `PREVIEW_STATES` and to `STATE_PREFIXES`. Then `projectToState(s, "checked")`
  promotes `checked:`-prefixed classes; `projectToState(s, "default")` drops them (unchecked look).
  Existing previews are unaffected (only `switch` emits `checked:` classes).

### 3. `src/app/components/LiveSwitch.vue` (new)
- Props: `graph`, `componentName?` (default `"switch"`), `highlightUtility?`, `completeness?`.
- `switchRecipe`, `baseClasses = recipe.slots.base`, `sizes`/`selectedSize`/`activeSize`
  (badge-style; switch sizes = `sm`/`md`).
- For the active size, build two cells:
  - `merged = [baseClasses, recipe.variants.size?.[activeSize]?.base].filter(Boolean).join(" ")`.
  - unchecked: `extractArbitrary(projectToState(merged, "default"))`.
  - checked: `extractArbitrary(projectToState(merged, "checked"))`.
- Template, per cell: a **track** `<span :class="cell.classes" :style="cell.style">` (the recipe
  gives `rounded-full`, width, height, bg/border, so it renders a real pill) containing a
  **decorative thumb** `<span>` — a circle (`rounded-full bg-white shadow`, size derived from the
  track height via inline style, e.g. ~`calc(height - 4px)`), positioned with `justify-start`
  (unchecked) / `justify-end` (checked) on the track's flex. Cell label: `unchecked` / `checked`.
- Header: `colour`/label + the `sm/md` size switch (`data-testid="switch-size-switch"`) +
  `activeCompleteness` (badge-style) + copy. A representative code block with `highlightSegments`.
- `data-testid="switch-track"` on the track, `data-testid="switch-thumb"` on the thumb (for tests).

### 4. `src/app/App.vue`
- `COMPONENTS_WITH_PREVIEW` += `"switch"`; import `LiveSwitch`; add a `LiveSwitch` `v-else-if`
  branch (`selectedComponent === 'switch'`) at both mount sites, after `LiveBadge`, before
  `LiveButton`. Update the "not yet available" copy to include `switch`.

### Tests
- `component-vocab.test.ts`: `nuxtSlotsFor("switch")?.has("thumb")` true; `nuxtSlotsFor("radio")?.has("indicator")` true; `FIGMA_NUXT_PART_ALIAS.get("dot") === "indicator"`.
- `project-to-state.test.ts`: `projectToState("bg-[#A] checked:bg-[#B]", "checked")` → contains `bg-[#B]`; `projectToState(…, "default")` → drops `checked:` (no `bg-[#B]`, no literal `checked:` token).
- `slot-mapping.test.ts`: `switch-thumb-border` → `slot: "thumb"` (routes after inventory).
- `LiveSwitch.test.ts`: a switch graph (`switch-bg`, `switch-bg-checked`, `switch-border`, `switch-width-md`, `switch-height-md`, `switch-radius`) → two `switch-track` cells; the checked track's inline `backgroundColor` differs from the unchecked one (JIT-safe, the checked: class resolved); a `switch-thumb` renders in each; fallback message on null graph.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Headless QA: select `switch`; confirm a pill track that changes background between the unchecked
  and checked cells, a visible thumb (left vs right), the `sm/md` switch, console clean. Wait a
  tick after a size-switch click before reading (the flush lesson). Screenshot.

## Out of scope
- `LiveCheckbox` / `LiveRadio` (follow-on; their indicators `check`/`dot` don't route).
- The `color`/`size` utility-name grammar gap (why `switch-thumb-color`/`-size` don't map).
- hover/focus/disabled switch states.

## Risks
- **Decorative thumb** — the thumb isn't token-driven (documented); acceptable since Nuxt's thumb
  is a plain circle. If the `color`/`size` grammar gap is later closed, `slots.thumb` fills and the
  preview can switch to a token-driven thumb.
- **`checked` projection touching other previews** — guarded: only `switch` emits `checked:`
  classes; adding `checked` to the projection drops those prefixes on `default` (correct) and
  promotes them on `checked` (new). Existing LiveInput/Button/Badge tests must stay green.
- **Adding `radio`/`switch` to `NUXT_SLOTS`** changes detector inputs: confirm `unsupported-part`
  doesn't newly over-fire for switch (its track tokens map; only thumb-color/size stay null and
  those are `color`/`size` segments — `color` is a NON_PART_SEGMENT? verify they don't flag).

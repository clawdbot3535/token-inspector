# Design: `size` utility — close the grammar gap + preview uptake

- **Date:** 2026-06-09
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/size-utility`
- **Theme:** teach the slot-mapping grammar the bare `size` utility (Tailwind `size-N` =
  width+height), emit it from the recipe engine, and let the form-control previews consume the
  now-mapped tokens (token-driven checkbox/radio box size, switch thumb size + colour).

## Problem / goal

Five real-export tokens fail to map only because the grammar has no rule for the bare utility
word `size`: `checkbox-size-{sm,md}`, `radio-size-{sm,md}` (→ `variants.size.{k}.base`) and
`switch-thumb-size-md` (→ `variants.size.md.thumb` via sub-element routing). Everything downstream
is already prepared: `extract-arbitrary.ts` has `size → [width, height]` in BOTH its arbitrary and
scale tables, and bare `color` already maps (so `switch-thumb-color` lands in `slots.thumb` today —
unused by the preview).

Scope notes (measured against the real export):
- Of the 23 color/size-named NULL tokens, most are NOT grammar-blocked: `check`/`dot`/`close`
  naming mismatches stay `unsupported-part`-flagged (Figma rename), `-error`/`-success` colours are
  the validation-via-prop domain, `typography-*-font-size` is the typography layer. All out of scope.
- The genuine grammar gap is exactly the bare `size` rule.

Success criteria:
- `checkbox-size-md` → `{slot: base, utilityType: size, variantAxis: size, variantKey: md}`;
  `switch-thumb-size-md` → `{slot: thumb, utilityType: size, …}`. `icon-size`/`text-size`/
  `font-size` rules unaffected (the new rule matches `u === "size"` exactly).
- The recipe engine emits `size-[<resolved>px]` (e.g. `size-[18px]`) for these tokens into
  `variants.size.{k}.{slot}`; the golden `app.config.ts` snapshot diff shows exactly these
  additions and nothing else.
- **LiveCheckbox/LiveRadio:** the box merges the recipe's size variant (prefer `md`, else the first
  size key in SIZE_ORDER) into its classes — the resolved `size-[…]` lands as inline width/height
  via `extractArbitrary`, overriding the static `size-5` fallback (which stays for token-less
  graphs).
- **LiveSwitch:** the decorative thumb additionally applies `slots.thumb` +
  `variants.size[activeSize].thumb` through the same `projectToState`+`extractArbitrary` pipeline —
  thumb size (`switch-thumb-size-md`) and the already-mapped thumb colour/border become
  token-driven; the static classes (`h-[70%] aspect-square rounded-full bg-white …`) stay as
  fallback (inline style wins when tokens exist).
- Full suite + typecheck + build green; headless QA shows a checkbox/radio box sized from the
  token and a switch thumb sized/coloured from its tokens.

## Decisions

- **`u === "size"` exact match only.** `icon-size`, `text-size`, `font-size` have their own earlier
  rules; the new rule cannot shadow them. (Note: `icon-size` already emits the `size-` class prefix,
  so `prefixForUtility` gains a `case "size": return "size-"` — same prefix, different utility type.)
- **Emit as arbitrary dimension** — add `"size"` to `ARBITRARY_VALUE_TYPES` (like `height`/`width`),
  so the resolved px value emits `size-[18px]` rather than a scale class.
- **Previews keep their decorative fallback.** The static classes remain; token-driven inline
  styles override them when present. No size-switch UI is added to LiveCheckbox/LiveRadio (single
  preferred size: `md`, else first) — the unchecked/checked axis stays their identity.
- **LiveSwitch thumb becomes a styled cell, not a redesign:** per cell, thumb classes =
  `[recipe.slots.thumb, recipe.variants.size?.[activeSize]?.thumb]` joined, projected to the cell's
  state, extracted to inline styles. Decorative position logic (justify-start/end) unchanged.

## Design

### 1. `src/slot-mapping.ts`
- `UtilityType` union (line ~32): add `"size"`.
- `HEURISTIC_RULES`: add (placed with the other dimension rules, after `icon-size`):
  ```typescript
  {
    match: (u) => u === "size",
    utilityType: "size",
  },
  ```
  (Mirror the exact shape of the `height`/`width` rule entries — same fields they carry.)

### 2. `src/recipe-engine.ts`
- `ARBITRARY_VALUE_TYPES`: add `"size"`.
- `prefixForUtility`: add `case "size": return "size-";`.

### 3. `src/app/components/LiveCheckbox.vue` + `LiveRadio.vue`
- Add a size-variant merge (identical in both):
  ```typescript
  const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];
  const sizeClasses = computed<string>(() => {
    const sizes = recipe.value?.variants.size ?? {};
    const keys = Object.keys(sizes);
    if (keys.length === 0) return "";
    const key = keys.includes("md")
      ? "md"
      : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
    return sizes[key]?.["base"] ?? "";
  });
  ```
  and build cells from `[baseClasses.value, sizeClasses.value].filter(s => s.length > 0).join(" ")`
  instead of `baseClasses.value` alone. Template unchanged (the static `size-5` stays).
- `inspectClasses` (the code block) also shows the merged string.

### 4. `src/app/components/LiveSwitch.vue`
- New computed for the thumb, per cell state:
  ```typescript
  function thumbFor(state: "default" | "checked"): { classes: string; style: CSSProperties } {
    const slotCls = switchRecipe.value?.slots["thumb"] ?? "";
    const sizeCls = switchRecipe.value?.variants.size?.[activeSize.value]?.["thumb"] ?? "";
    const merged = [slotCls, sizeCls].filter((s) => s.length > 0).join(" ");
    return extractArbitrary(projectToState(merged, state));
  }
  ```
  Extend the `Cell` interface with `thumbClasses: string; thumbStyle: CSSProperties` filled from
  `thumbFor(state)`; bind on the thumb span:
  `:class="cell.thumbClasses" :style="cell.thumbStyle"` (keeping the existing static classes).

### Tests
- `slot-mapping.test.ts`: `checkbox-size-md` → base/size {size: md}; `switch-thumb-size-md` →
  thumb/size {size: md}; `button-icon-size` (or the existing icon-size case) still icon-size —
  no shadowing.
- `recipe-engine.test.ts`: a checkbox graph with `size-md: 18` emits `variants.size.md.base`
  containing `size-[18px]`. Golden snapshot update reviewed: ONLY new `size-[…]` additions.
- `LiveCheckbox.test.ts` (+ Radio): graph with `checkbox-size-md: 18` → box inline style has
  `width: 18px` and `height: 18px`.
- `LiveSwitch.test.ts`: graph with `switch-thumb-color: #fff` + `switch-thumb-size-md: 16` → the
  thumb span's inline style carries the width/height (and bg from thumb-color).

### Verification
- `npm run typecheck && npx vitest run && npm run build`; `npm run build:tokens` → inspect the
  app.config.ts diff (only size additions).
- Headless QA: load the real export; checkbox box reflects `checkbox-size-md` (inline 18px-ish
  dimensions), switch thumb sized/coloured from tokens; console clean. Screenshot.

## Out of scope
- `check`/`dot`/`close` naming mismatches (Figma rename path), `-error`/`-success` validation
  colours, `typography-*-font-size` (typography layer), a size switch for checkbox/radio.
- The App.vue extraction (cycle 2, own spec).

## Risks
- **Golden snapshot churn** — expected; the diff must be exactly the new `size-[…]` classes.
- **Rule shadowing** — guarded by exact-match `u === "size"` and a no-shadowing test.
- **Preview regression** — static fallbacks stay; existing preview tests (fixed-size graphs without
  size tokens) must stay green unchanged.

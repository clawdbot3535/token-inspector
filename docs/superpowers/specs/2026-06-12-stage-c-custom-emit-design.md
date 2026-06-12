# Design: Stage C — `custom/<name>` emit for components that look custom

- **Date:** 2026-06-12
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/stage-c-custom-emit`
- **Cycle:** Stage C (the emit half of the divergence work; Stage B = detection)
- **Relates to:** `docs/superpowers/specs/2026-06-10-divergence-flag-design.md` (Stage B —
  `component-looks-custom` detection), `docs/superpowers/specs/2026-06-10-grammar-package-design.md`
  (`@tg/grammar` slot vocabulary the detector reads)

## Problem

Stage B taught the scanner to **flag** components whose Figma anatomy diverges from their
Nuxt UI counterpart: it raises a `component-looks-custom` hint when a component is carried by
*foreign parts* — Figma part-segments that are not a Nuxt slot, not a `NON_PART_SEGMENTS` word,
and not a rename alias. On the real export this fires for `chip` only.

But the **renderer never acted on the flag.** `chip` is still in `COMPONENT_ALLOW_LIST`, so
`appConfigRenderer` emits it inside the `ui:` block as if it were a clean Nuxt UI override:

```ts
chip: {
  slots: {
    base: "bg-[var(--color-bg-muted)] ring-[var(--color-border-default)] rounded-[999px] …",
  },
},
```

Two problems with this output:

1. **It is a silent footgun.** Nuxt UI receives `ui.chip` and tries to apply it to *its own*
   `chip` component, whose anatomy (`root`/`base` only) does not match the Figma chip. The
   override partially lands on the wrong component.
2. **It drops the component's real content.** The Figma chip's sub-elements — `label`, `close` —
   and its colour-role tokens (`chip-bg-error`, …) have no Nuxt `chip` slot, so they are mapped
   to `null` and silently discarded. The emitted block shows ~half the component and hides the
   rest.

The detector already knows which components are custom. Stage C makes the **output** honest:
route flagged components out of the Nuxt override block and into a dedicated `custom-components.ts`
artifact that captures their full anatomy as hand-implementation recipes.

## Goal

For every component flagged `component-looks-custom`:

1. **Remove it from `app.config.ts`'s `ui:` block** and leave a one-line pointer comment, so no
   custom component is silently misapplied to a Nuxt UI component.
2. **Emit a full-fidelity recipe object** into a new `output/nuxt/custom-components.ts` artifact —
   every part as a slot (including the dropped `label`/`close` sub-elements), plus reconstructed
   `color`/`size` variants — as a dependency-free `export const <name>Recipe = { … }` the dev team
   can drop into a hand-built Vue component via `tv()`.

Success criteria:

- A graph containing a flagged custom component (`chip`) produces a `custom-components.ts` string
  with `export const chipRecipe` whose `slots` include `base`, `label`, and `close`, and whose
  `variants.color` includes the colour-role tokens (`error`, …) that the normal pipeline drops.
- The same graph's `app.config.ts` no longer contains a `chip:` key under `ui:`, but does contain
  the pointer comment `// chip: looks custom → see custom-components.ts`.
- A graph with **no** flagged custom components produces **no** `custom-components.ts` (the renderer
  returns an empty result and the build/web layers skip it).
- Non-custom components (`button`, `badge`, …) are unchanged in `app.config.ts`.
- `npm run typecheck` and the full `vitest` suite stay green.

Non-goals (YAGNI):

- No new variant *axes* beyond what the engine already understands (`color`, `size`, plus state
  prefixes). The custom builder reconstructs those, not arbitrary new axes.
- No generated `.vue` markup — the inspector cannot know the component's DOM. It emits the styling
  recipe only.
- No `tv()` call wrapping in the generated file — pure recipe objects, with a usage-hint comment.
- The `@tg/grammar` profile system (`profile.ts`) is **not** extended into a full "custom profile".
  The custom builder is a local, self-contained unit.

## Architecture

Five units, each with one purpose.

### 1. Custom-component set (data flow)

`scanGraph()` already returns `component-looks-custom` issues. A small selector derives the set
of flagged component names from the scan report:

```ts
function customComponentNames(report: ScanReport): ReadonlySet<string>
// = new Set(issues.filter(i => i.kind === "component-looks-custom").map(i => i.componentName))
```

This set is threaded into the render pipeline alongside the existing `completeness` data — the
same pattern `app-config.ts` already uses. The scan runs before render in both consumers
(`scripts/build-cli.ts` and the web app), so the set is available at render time without
re-scanning.

### 2. `buildCustomRecipes(graph, customNames)` — new builder

A new, focused module (`src/custom-recipe-engine.ts`, target ≤ ~250 lines) decoupled from the
500-line `buildComponentRecipes`. It **reuses the engine's token→Tailwind-class resolution**
(the same value-resolution + arbitrary-utility emission the normal engine uses) but applies a
**permissive, Nuxt-agnostic slot/variant assignment** instead of the Nuxt-slot gating that drops
foreign parts:

- **Slot** = the component's part-segment. Base/property words and `NON_PART_SEGMENTS` collapse to
  the `base` slot; any other segment (`label`, `close`) becomes its own slot named after itself.
- **`variants.color`** = trailing colour-role word (`error`, `success`, `warning`, `info`,
  `primary`, `secondary`, `neutral`).
- **`variants.size`** = size word (`xs`, `sm`, `md`, `lg`, `xl`).
- **State prefix** (`hover`, `active`, `disabled`, `focus`) → emitted as a Tailwind state prefix on
  the class, as the normal engine does.

Returns `Record<string, ComponentRecipe>` — **reusing the existing `ComponentRecipe` type**
(`{ slots, variants }`), no new type. Only the flagged components are built.

> Reuse boundary (to be finalised in the plan): the token→class helpers in the recipe engine that
> are pure (value resolution, arbitrary-utility formatting, state-prefix application) are extracted
> or imported as-is. The custom builder supplies its own *assignment* logic only. If a helper is not
> cleanly importable, it is lifted into a shared `recipe-class.ts` with no behaviour change.

### 3. `customComponentsRenderer` — new renderer → `custom-components.ts`

A `TextRenderer` (mirrors `appConfigRenderer`) that takes the graph + `customNames` and emits a
dependency-free module:

```ts
// Generated by build-cli — custom component recipes.
// These components diverge from their Nuxt UI counterparts (foreign parts Nuxt has no slot for).
// They are NOT Nuxt UI overrides. Implement each as a hand-built component.
// Usage: const ui = tv(chipRecipe)

export const chipRecipe = {
  slots: {
    base:  "bg-[var(--color-bg-muted)] ring-[var(--color-border-default)] rounded-[999px] …",
    label: "text-[8px] tracking-[0.4px] …",
    close: "size-[12px] …",
  },
  variants: {
    color: { error: { base: "bg-[var(--color-chip-bg-error)] …" } },
    size:  { sm: { base: "…" } },
  },
} as const;
```

Slot/variant body emission **reuses the same `LineBuilder` shaping** as `emitRecipe` in
`app-config.ts` (factored so both renderers share the recipe-body writer). When `customNames` is
empty the renderer returns an empty/sentinel result so the build and web layers can skip writing.

### 4. `app-config.ts` — remove the lie

`AppConfigRendererOptions` gains `customComponents?: ReadonlySet<string>`. In the component loop:

- If `component ∈ customComponents`: do **not** call `emitRecipe`. Instead push one comment line
  `    // ${component}: looks custom → see custom-components.ts` and continue.
- Otherwise: unchanged.

`COMPONENT_ALLOW_LIST` is **not** edited — chip stays a known component; it is merely *routed*
based on the runtime flag. (Keeping it in the list means the scanner still analyses it.)

### 5. Wiring (build-cli + web + registry)

- `scripts/build-cli.ts`: after scanning, derive `customNames`, pass to `appConfigRenderer`, and —
  when non-empty — render and write `output/nuxt/custom-components.ts`.
- `src/renderers/index.ts`: register `customComponentsRenderer`.
- Web output panel: add a `custom-components.ts` tab, hidden when the renderer result is empty.
  (Exact component wiring confirmed during planning against the current output-panel structure.)

## Data flow

```
tokens → buildGraph → scanGraph ─┬─ issues (incl. component-looks-custom)
                                 │        │
                                 │        └─ customComponentNames(report) → Set<string>
                                 │                         │
                                 ├─ appConfigRenderer(graph, { …, customComponents }) → app.config.ts
                                 │        (flagged components skipped + pointer comment)
                                 │
                                 └─ customComponentsRenderer(graph, customComponents)
                                          → buildCustomRecipes(graph, names) → custom-components.ts
                                          (empty set → no file)
```

## Testing

- **`custom-recipe-engine.test.ts`** (unit): given a small graph with a custom component carrying
  `base`, `label`, `close`, a `bg-error` colour-role token, and a size token, assert the returned
  recipe has the three slots and the reconstructed `color.error` / `size` variants; assert a
  non-flagged graph yields `{}`.
- **`renderers.test.ts`** (extend): `customComponentsRenderer` emits `export const chipRecipe`
  with the expected slots; empty `customNames` → empty result. `appConfigRenderer` with
  `customComponents: {chip}` omits the `chip:` key and includes the pointer comment; without the
  option, output is byte-identical to today (regression pin).
- **Real-export probe** (manual / scripted): regenerate `output/nuxt/` and confirm `chip` left the
  `ui:` block and `custom-components.ts` now carries `label`/`close`.
- **Build gate:** `npm run typecheck` + full `vitest` green; production build succeeds.

## Risks / open questions for planning

- **Reuse boundary** (§2): whether the engine's class-resolution helpers are importable as-is or
  need a no-behaviour-change extraction into `recipe-class.ts`. Resolved during planning by reading
  `recipe-engine.ts`'s internals.
- **Colour-role variant key naming:** the normal pipeline drops `chip-bg-error` as a "Figma-fix";
  the custom builder must decide the variant key (`error`) and slot/property (`base` → `bg-*`).
  The grammar's colour-role vocabulary is the source of truth; reuse it, do not hardcode.
- **`base` slot composition:** a custom component's `base` may receive both resting classes and
  state-prefixed classes from several tokens; they merge into one ordered class string exactly as
  the normal engine merges the `base` slot today.

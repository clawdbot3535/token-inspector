# Design: @tg/grammar — extract the grammar package + scaffold (token-creator Stage 1)

- **Date:** 2026-06-10
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/grammar-package`
- **Parent design:** `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260610-113605.md`
  (token-creator, office-hours). This is **Stage 1** of that 3-stage plan.
- **Theme:** turn the inspector's grammar into a real workspace package consumed by the inspector
  (single source of truth), and add the forward direction: a profile + `scaffold()` that emits
  component token sets which map with **0 unmapped** — enforced by a test.

## Problem / goal

The inspector validates tokens against a Nuxt UI grammar but there is no way to GENERATE a correct
token set. Stage 1 lays the foundation: extract the grammar into `@tg/grammar` (so inspector,
creator, plugin can all consume one source), and ship the first forward capability — `scaffold()`
+ a hand-authored `nuxt-ui` profile — proven correct by a unit test (every scaffolded token maps).

The grammar is a clean leaf: `component-vocab.ts` imports nothing; `slot-mapping.ts` imports only
`component-vocab`. Neither touches `token-graph` or the rest of `src/`. So extraction is a
two-file move with ~6 consumer import-site updates.

Success criteria:
- `packages/grammar/` is a real npm workspace package `@tg/grammar`, publish-ready (proper
  `exports`/types), consumed by the inspector via standard node resolution (not a path alias).
- The grammar core (`component-vocab` + `slot-mapping` + their tests) lives in the package; the
  inspector imports them from `@tg/grammar`. Behaviour byte-identical: full suite, typecheck,
  `npm run build`, AND `npm run build:tokens` all green, golden snapshot unchanged.
- `@tg/grammar` exports a `Profile` type, a hand-authored `profiles/nuxt-ui.json` covering all 15
  `COMPONENT_ALLOW_LIST` components, and `scaffold(profile, component, opts) → DTCG tree`.
- `scaffold.test.ts`: for every component in the profile, every scaffolded token ID maps via
  `getSlotMapping` with **0 unmapped** — the package is self-contained (no `buildGraph`/inspector
  dependency; a local `flattenDtcg` derives IDs).

## Decisions

- **Real workspace package, not a path alias.** `@tg/grammar` resolves through `node_modules`
  (workspace symlink) in every tool context — vite, vitest, tsx (`build:tokens`), tsc, vue-tsc —
  avoiding the tsconfig-`paths`/tsx fragility a `@grammar` alias would introduce. This is the
  "publish-ready from day one" the parent design requires.
- **Grammar core moves (forced, not a fork).** The dependency arrow must be inspector → grammar
  (and later creator/plugin → grammar). `scaffold()` must sit WITH the validator it agrees with;
  the 0-unmapped test must run in the package without depending back on the inspector. So
  `component-vocab` + `slot-mapping` move into the package.
- **Package stays self-contained — no `buildGraph`.** `buildGraph` lives in the inspector;
  importing it would create a cycle. The test uses a tiny local `flattenDtcg(tree) → string[]`
  + `getSlotMapping` (both in the package). `flattenDtcg` mirrors buildGraph's ID derivation
  (join nested keys with `-`, **lowercase**) so the test matches runtime behaviour.
- **Lowercase, ID-shaped tokens only.** `buildGraph` lowercases IDs, so camelCase Nuxt slot names
  (`leadingIcon`) are unreachable as ID segments (known latent finding). `scaffold` emits
  lowercase Figma-part segments (base = no segment, `thumb`, `icon`, …) and grammar utility words
  (`bg`, `border`, `radius`, `icon-size`, `size`, …) — never camelCase slot names in IDs.
- **Profile is hand-authored forward data, test-locked.** The inspector grammar is backward
  (ID → mapping); the profile is the forward inventory (what tokens should exist). They overlap
  but are not identical. The 0-unmapped test is the consistency guarantee: author, run, trim the
  profile until green. Components with a thin mappable surface get a thin profile — correct, it
  reflects what the inspector can actually consume.
- **Two-stage execution** (in the plan): (1) workspace + move + rewire + verify (pure refactor,
  single-source-of-truth proof, zero behaviour change); (2) profile + scaffold + 0-unmapped test
  (additive).
- **v1 scaffold depth is modest, breadth is full.** All 15 components, but scaffold emits a
  correct, representative mapping set per component (base + sized + stated where the profile flags
  it) — not every conceivable token. Depth grows later; breadth (15) is the success criterion now.
- **Placeholder values.** Scaffolded `$value`s are placeholders (`#000000` / `0`); the 0-unmapped
  test checks slot mapping (ID → slot), which is value-independent. `alias-semantic` values are a
  Stage-2 UI concern (the `valueStrategy` opt exists but defaults to `placeholder`).

## Design

### Package layout — `packages/grammar/`
```
packages/grammar/
  package.json        # name "@tg/grammar", type module, exports → ./src/index.ts (types+default)
  tsconfig.json       # extends the repo base; referenced from root tsconfig.json
  src/
    index.ts          # barrel: export * from vocab, slot-mapping, profile, scaffold, dtcg
    component-vocab.ts # MOVED (git mv from src/)
    slot-mapping.ts    # MOVED
    component-vocab.test.ts  # MOVED
    slot-mapping.test.ts     # MOVED
    profile.ts         # NEW — Profile/ComponentProfile/UtilitySpec types + a profile loader
    dtcg.ts            # NEW — DtcgTree type + flattenDtcg(tree) → string[] (lowercase, "-"-joined)
    scaffold.ts        # NEW — scaffold(profile, component, opts) → DtcgTree
    scaffold.test.ts   # NEW — 0-unmapped for every component in nuxt-ui.json
  profiles/
    nuxt-ui.json       # NEW — forward inventory, 15 components
```
`package.json` (publish-ready, consumed as source):
```json
{
  "name": "@tg/grammar",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./profiles/nuxt-ui.json": "./profiles/nuxt-ui.json"
  }
}
```
(`@tg` is a private placeholder scope — never published yet; rename before any real publish.)

### Profile shape (`profile.ts`)
Refines the parent design's thin `utilities: Record<string,string[]>` into something expressive
enough to drive scaffold's state/size combinatorics:
```typescript
export interface UtilitySpec {
  utility: string;        // grammar word: "bg" | "border" | "radius" | "icon-size" | "size" | …
  parts: string[];        // Figma part segments it applies to: "" (base) | "thumb" | "icon" | …
  states?: string[];      // component states this utility takes (subset of component.states)
  sized?: boolean;        // emit a per-size variant (component.sizes)
  variants?: boolean;     // emit a per-variant token (component.variants)
}
export interface ComponentProfile {
  parts: string[];        // all Figma part segments ("" base + sub-elements)
  states: string[];       // e.g. ["checked","disabled","hovered","focus"]
  sizes: string[];        // e.g. ["sm","md"]
  variants: string[];     // e.g. ["solid","outline","ghost","link"]
  utilities: UtilitySpec[];
}
export interface Profile { target: string; components: Record<string, ComponentProfile>; }
```

### `scaffold(profile, component, opts) → DtcgTree`
```typescript
export interface ScaffoldOpts {
  states?: string[]; sizes?: string[]; parts?: string[];   // subset filters (default: all)
  valueStrategy?: "placeholder" | "alias-semantic";        // default "placeholder"
}
```
For the component's profile, for each `UtilitySpec`, for each `part` it applies to, emit token IDs
(then nest into a DTCG tree):
- base: `[component, part||∅, utility]`
- per state (if `states`): `…, state`
- per size (if `sized`): `…, size`
- per variant (if `variants`): `…, variant`
IDs are lowercase, segments joined by `-` (e.g. `switch-thumb-size-md`, `switch-bg-checked`,
`button-bg-solid`). Each leaf is a DTCG node `{ $value, $type }` (placeholder value; `$type`
inferred from the utility: color utils → `color`, dimension utils → `number`).

### `flattenDtcg(tree) → string[]` (`dtcg.ts`)
Recurse the DTCG tree; at each leaf (`$value` present) emit the `-`-joined, **lowercased** key
path. Mirrors buildGraph's ID derivation so the test reflects runtime mapping.

### `scaffold.test.ts` (the product promise)
```typescript
import nuxtUi from "../profiles/nuxt-ui.json";
for (const component of Object.keys(nuxtUi.components)) {
  it(`scaffolds ${component} with 0 unmapped tokens`, () => {
    const ids = flattenDtcg(scaffold(nuxtUi as Profile, component));
    const unmapped = ids.filter((id) => getSlotMapping(id) === null);
    expect(unmapped).toEqual([]);          // every scaffolded token maps
    expect(ids.length).toBeGreaterThan(0); // and it actually emitted tokens
  });
}
```

### Inspector-side integration test (truest form of the promise)
`flattenDtcg` (package-local) must match buildGraph's ID derivation
(`applyNameFixes(parts.join(…).toLowerCase())`). The package test can't import `buildGraph`
(cycle), so add ONE integration test in the inspector (which legitimately depends on the package):
`src/grammar-scaffold.test.ts` — feed `scaffold(nuxtUi, component)` output as a `SourceFile` to the
real `buildGraph`, iterate component-layer nodes, assert `getSlotMapping(node.id) !== null` for all.
This exercises the REAL pipeline and catches any `flattenDtcg`/`buildGraph` divergence. The
implementer reads `buildGraph` and makes `flattenDtcg` replicate its ID derivation exactly; this
test is the cross-check.

### Inspector wiring (refactor, behaviour-identical)
- `git mv` the four grammar files into `packages/grammar/src/`. Keep their internal imports
  relative (co-located).
- Root `package.json`: add `"workspaces": ["packages/*"]`; `npm install` to create the symlink.
- Update the ~6 consumer import sites (`src/recipe-engine.ts`, `src/scanner.ts`,
  `src/renderers/app-config.ts`, `src/slot-mapping-loader.ts`, `src/app/App.vue`, and any other
  grep turns up) from `./slot-mapping.js` / `./component-vocab.js` to `@tg/grammar`.
- `vitest.config.ts`: `include` → `["src/**/*.test.ts", "packages/**/*.test.ts"]`; coverage
  `include` add `"packages/grammar/src/**/*.ts"`.
- `tsconfig.json`: add `{ "path": "./packages/grammar" }` to `references` (package gets its own
  `tsconfig.json`). Confirm `tsconfig.scripts.json` resolves `@tg/grammar` (node_modules + the
  package's `exports.types`).
- No `@grammar`/`@core` alias change — node resolution handles `@tg/grammar` everywhere.

### Verification (all four tool contexts must pass)
- `npm install` (creates the workspace symlink).
- `npm run typecheck` (vue-tsc -b + tsc scripts) — green.
- `npx vitest run` — green, including the moved grammar tests now under `packages/`, and the new
  `scaffold.test.ts` (0-unmapped × 15).
- `npm run build` (vue-tsc -b + vite) — green; the app resolves `@tg/grammar`.
- `npm run build:tokens` (tsx) — green; `output/nuxt/app.config.ts` byte-identical to main
  (golden proof the move changed no behaviour).
- Headless smoke: app still loads a graph + renders previews (the grammar move is invisible).

## Out of scope (later stages)
- The creator app (`apps/creator`, Stage 2), the plugin import (Stage 3), `alias-semantic` value
  generation, codegen of the profile from `@nuxt/ui` theme source, shadcn profile, relocating the
  inspector into `apps/inspector`.
- Deep scaffold combinatorics beyond a correct representative set per component.

## Risks
- **Tool-context resolution.** The whole point of the workspace package is uniform resolution, but
  vue-tsc project references + tsx + vite each need to find `@tg/grammar`. Mitigation: the plan's
  Task 1 verifies ALL FOUR contexts green before any new code; if one resists, fall back to also
  adding a `@tg/grammar` path alias in that context (belt-and-suspenders) and report it.
- **Golden snapshot drift.** The move must not change recipe output. `build:tokens` diff vs main
  must be empty; if not, the move altered import resolution semantics — investigate before
  proceeding.
- **Profile authoring for 15 components.** Some (nav, dropdown, table, modal) have thinner
  well-understood grammar; their profiles will be smaller. The 0-unmapped test forces honesty —
  trim any entry that doesn't map. Acceptable; breadth is the goal, depth grows later.
- **`@tg` scope name** is a placeholder — trivially renameable before Stage 3 publish.

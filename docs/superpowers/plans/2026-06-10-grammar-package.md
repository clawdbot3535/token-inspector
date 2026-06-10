# @tg/grammar package + scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the grammar (`component-vocab` + `slot-mapping`) into a real workspace package `@tg/grammar` consumed by the inspector (single source of truth), then add `scaffold()` + a `nuxt-ui` profile that emits token sets mapping with 0 unmapped — for all 15 components.

**Architecture:** Task 1 = workspace + move + rewire (pure refactor, behaviour-identical, the hard monorepo mechanics). Task 2 = profile/dtcg/scaffold + tests + nuxt-ui.json for the 7 well-understood components. Task 3 = extend the profile to all 15.

**Tech Stack:** TS engine, npm workspaces, Vitest, vue-tsc + tsx. Pre-commit hook = `vue-tsc` + full vitest; every task commit must be green. FOUR resolution contexts must work: vite (`build`), vitest (`test`), tsx (`build:tokens`), tsc/vue-tsc (`typecheck`).

**Branch:** `feat/grammar-package` (spec at `ef694c4`).

**Spec:** `docs/superpowers/specs/2026-06-10-grammar-package-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`. Use `git mv` for moves (preserve history).
- The grammar is a clean leaf: `component-vocab.ts` imports nothing; `slot-mapping.ts` imports only `./component-vocab.js`. Their tests use relative imports (`./component-vocab`, `./slot-mapping.js`) — these stay relative after the move (co-located).

---

### Task 1: workspace package + move grammar + rewire inspector

**Files:** Create `packages/grammar/package.json`, `packages/grammar/tsconfig.json`, `packages/grammar/src/index.ts`; `git mv` 4 files; modify root `package.json`, `vitest.config.ts`, `tsconfig.json`, and 6 consumer source files.

- [ ] **Step 1: Create the package skeleton**

`packages/grammar/package.json`:
```json
{
  "name": "@tg/grammar",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./profiles/nuxt-ui.json": "./profiles/nuxt-ui.json"
  }
}
```
`packages/grammar/tsconfig.json`:
```json
{
  "extends": "@vue/tsconfig/tsconfig.node.json",
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "types": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Move the grammar core** (preserve history)
```bash
mkdir -p packages/grammar/src
git mv src/component-vocab.ts packages/grammar/src/component-vocab.ts
git mv src/slot-mapping.ts packages/grammar/src/slot-mapping.ts
git mv src/component-vocab.test.ts packages/grammar/src/component-vocab.test.ts
git mv src/slot-mapping.test.ts packages/grammar/src/slot-mapping.test.ts
```
(Their internal relative imports — `./component-vocab`, `./slot-mapping.js` — stay correct.)

- [ ] **Step 3: Barrel** — `packages/grammar/src/index.ts`:
```typescript
export * from "./component-vocab.js";
export * from "./slot-mapping.js";
```

- [ ] **Step 4: Root workspace + install**
- Root `package.json`: add top-level `"workspaces": ["packages/*"]`.
- Run `npm install` (creates the `node_modules/@tg/grammar` symlink). Expected: no errors.

- [ ] **Step 5: Rewire the 6 consumer import sites** to `@tg/grammar`:
- `src/slot-mapping-loader.ts:8` `import type { SlotMappingOverride } from "./slot-mapping.js";` → `from "@tg/grammar";`
- `src/renderers/app-config.ts:18` `import type { SlotMappingOverride } from "../slot-mapping.js";` → `from "@tg/grammar";`
- `src/scanner.ts:20-21` both `./slot-mapping.js` and `./component-vocab.js` → merge to one `import { getSlotMapping, KNOWN_VARIANT_NAMES, RING_FRAMED_VARIANTS, propDrivenStateFor, nuxtSlotsFor, NON_PART_SEGMENTS, FIGMA_NUXT_PART_ALIAS, SLOT_PAIRS, SLOT_MIRROR } from "@tg/grammar";`
- `src/recipe-engine.ts:19-20` the multi-line `} from "./slot-mapping.js";` block and `import { SLOT_MIRROR } from "./component-vocab.js";` → point both at `@tg/grammar` (keep the named lists).
- `src/app/App.vue:31` `import { getSlotMapping } from "@core/slot-mapping.js";` → `from "@tg/grammar";`
- Grep to confirm NO remaining `./slot-mapping`, `./component-vocab`, `@core/slot-mapping`, `@core/component-vocab` references in `src/` (except inside the moved files themselves, which are gone from src):
  ```bash
  grep -rn "slot-mapping\|component-vocab" src/ scripts/ | grep -vE "slot-mapping-loader|\.test\."
  ```

- [ ] **Step 6: Test + coverage globs** — `vitest.config.ts`:
- `include: ["src/**/*.test.ts", "packages/**/*.test.ts"]`
- coverage `include`: add `"packages/grammar/src/**/*.ts"`.

- [ ] **Step 7: Typecheck wiring** — make `npm run typecheck` cover the package source.
- Add `{ "path": "./packages/grammar" }` to the `references` array in root `tsconfig.json`.
- **Verify the package is actually type-checked:** temporarily add a deliberate type error to
  `packages/grammar/src/component-vocab.ts` (e.g. `const _x: number = "bad";`), run
  `npm run typecheck`, confirm it FAILS, then revert. If it does NOT fail, the package isn't in
  the tsc graph — fix the wiring (composite ref or include) until the deliberate error is caught.
  Report which wiring worked.

- [ ] **Step 8: Verify ALL FOUR resolution contexts** (the crux):
```bash
npm run typecheck         # tsc/vue-tsc resolves @tg/grammar
npx vitest run            # vitest resolves it (moved grammar tests now under packages/)
npm run build             # vite resolves it
npm run build:tokens      # tsx resolves it
```
All green. If `build:tokens` (tsx) fails to resolve `@tg/grammar`, that is the known risk — add a
`@tg/grammar` path mapping to `tsconfig.scripts.json` (and/or a tsx resolve shim) as a fallback and
report it; do NOT leave it red.

- [ ] **Step 9: Golden proof — behaviour unchanged**
```bash
git stash -q; git checkout -q main -- . 2>/dev/null; npm run build:tokens >/dev/null 2>&1; cp output/nuxt/app.config.ts /tmp/gp-before.ts
git checkout -q feat/grammar-package -- . 2>/dev/null; git stash pop -q 2>/dev/null || true
npm run build:tokens >/dev/null 2>&1
diff /tmp/gp-before.ts output/nuxt/app.config.ts && echo "IDENTICAL"
```
Must print `IDENTICAL` (the move changed no behaviour). If not, investigate before proceeding.
(If the stash/checkout dance is awkward, equivalently: `git show main:output/...` is not tracked,
so rebuild on main in a worktree — use whatever cleanly compares main's build:tokens output to the
branch's. The assertion is: byte-identical `app.config.ts`.)

- [ ] **Step 10: Commit**
```bash
git add -A
git commit -m "refactor(grammar): extract component-vocab + slot-mapping into @tg/grammar workspace"
```
Verify no trailer. Full pre-commit suite must pass.

---

### Task 2: profile + scaffold + tests (7 well-understood components)

**Files:** Create `packages/grammar/src/dtcg.ts`, `packages/grammar/src/profile.ts`, `packages/grammar/src/scaffold.ts`, `packages/grammar/src/scaffold.test.ts`, `packages/grammar/profiles/nuxt-ui.json`, `src/grammar-scaffold.test.ts`; modify `packages/grammar/src/index.ts`.

- [ ] **Step 1: `dtcg.ts`** — read `src/build-graph.ts` first to replicate its ID derivation EXACTLY (it does `applyNameFixes(parts.join("…").toLowerCase())`):
```typescript
export type DtcgNode = { $value: string | number; $type: "color" | "number" };
export type DtcgTree = { [key: string]: DtcgTree | DtcgNode };
/** Flatten a DTCG tree to the token IDs buildGraph would derive (lowercase, "-"-joined). */
export function flattenDtcg(tree: DtcgTree): string[] { /* recurse; leaf = $value present */ }
```
Match buildGraph's join + lowercase + any `applyNameFixes`. (If `applyNameFixes` is non-trivial and
inspector-only, the inspector integration test in Step 6 is the cross-check that catches divergence.)

- [ ] **Step 2: `profile.ts`** — the types from the spec (`UtilitySpec`, `ComponentProfile`,
  `Profile`), plus a typed loader `export function loadProfile(json: unknown): Profile` (light
  validation: components is a record, each has parts/states/sizes/variants/utilities).

- [ ] **Step 3: `scaffold.ts`**
```typescript
export interface ScaffoldOpts { states?: string[]; sizes?: string[]; parts?: string[]; valueStrategy?: "placeholder" | "alias-semantic"; }
export function scaffold(profile: Profile, component: string, opts?: ScaffoldOpts): DtcgTree;
```
For the component's profile, for each `UtilitySpec`, for each applicable `part`, emit IDs:
base `[component, part||∅, utility]`; + per state (if `spec.states`); + per size (if `spec.sized`,
from `component.sizes`); + per variant (if `spec.variants`, from `component.variants`). Build the
nested DTCG tree from the dash-joined ID (split on `-`… — but careful: utilities like `icon-size`
contain a dash. Nest by the SEGMENTS you generated, not by re-splitting the joined string. Keep the
segment list and nest directly). Leaf `$type`: color for `bg`/`border`/`ring`/color-ish utilities,
else `number`. Placeholder `$value`: `"#000000"` for color, `0` for number.

- [ ] **Step 4: `profiles/nuxt-ui.json`** — author the 7 well-understood components:
  `button, badge, input, textarea, checkbox, radio, switch`. Derive each component's `parts` from
  `nuxtSlotsFor(component)` + known Figma part names; `utilities` from the inspector's grammar
  vocabulary (`bg`, `border`, `radius`, `ring`, `padding`, `gap`, `icon-size`, `size`, `text`,
  `font-weight`, …); `states`/`sizes`/`variants` from the component's known axes. **Author against
  the test** (Step 5): start generous, run, TRIM any entry whose emitted ID doesn't map until 0
  unmapped, keep each component's token count > 0.

- [ ] **Step 5: `scaffold.test.ts`** (package):
```typescript
import nuxtUi from "../profiles/nuxt-ui.json";
import { loadProfile } from "./profile.js";
import { scaffold } from "./scaffold.js";
import { flattenDtcg } from "./dtcg.js";
import { getSlotMapping } from "./slot-mapping.js";
const profile = loadProfile(nuxtUi);
for (const component of Object.keys(profile.components)) {
  it(`scaffolds ${component} with 0 unmapped tokens`, () => {
    const ids = flattenDtcg(scaffold(profile, component));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => getSlotMapping(id) === null)).toEqual([]);
  });
}
```

- [ ] **Step 6: `src/grammar-scaffold.test.ts`** (inspector integration — the truest check):
  feed `scaffold(profile, component)` output as a `SourceFile` to the REAL `buildGraph`, iterate
  component-layer nodes, assert `getSlotMapping(node.id) !== null` for all, for each of the 7.
  (Imports: `scaffold`/`loadProfile`/profile json from `@tg/grammar`; `buildGraph` from `@core` or
  relative; `getSlotMapping` from `@tg/grammar`.) This exercises the real flatten+map pipeline.

- [ ] **Step 7: Barrel** — add to `packages/grammar/src/index.ts`:
  `export * from "./profile.js"; export * from "./scaffold.js"; export * from "./dtcg.js";`

- [ ] **Step 8: Verify** — `npm run typecheck && npx vitest run && npm run build && npm run build:tokens` all green (build:tokens still byte-identical — scaffold added nothing to the inspector's output path).

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat(grammar): Profile + scaffold + 0-unmapped tests (7 components)"
```
Verify no trailer.

---

### Task 3: extend the profile to all 15 components

**Files:** Modify `packages/grammar/profiles/nuxt-ui.json` only (tests auto-cover the new components via the `Object.keys` loops).

- [ ] **Step 1: Add the remaining 8** to `nuxt-ui.json`: `card, modal, kbd, chip, nav, dropdown,
  table, progress`. Same method: parts from `nuxtSlotsFor`, utilities from the grammar vocabulary,
  authored against the test. These have thinner well-understood grammar — keep their profiles to
  what maps (the 0-unmapped test forces this); thin is fine, but each must emit > 0 tokens.

- [ ] **Step 2: Run the tests** — `npx vitest run packages/grammar/src/scaffold.test.ts src/grammar-scaffold.test.ts`. The loops now cover 15; all must show 0 unmapped, > 0 tokens. Iterate the profile until green.

- [ ] **Step 3: Full gate** — `npm run typecheck && npx vitest run && npm run build && npm run build:tokens`.

- [ ] **Step 4: Commit**
```bash
git add packages/grammar/profiles/nuxt-ui.json
git commit -m "feat(grammar): nuxt-ui profile covers all 15 allow-list components"
```
Verify no trailer.

---

## Final verification

- [ ] All four contexts green: `npm run typecheck && npx vitest run && npm run build && npm run build:tokens`.
- [ ] `build:tokens` output byte-identical to main (the whole change is additive + a transparent move).
- [ ] `scaffold.test.ts` + `grammar-scaffold.test.ts`: 15 components, 0 unmapped, > 0 tokens each.
- [ ] Report the shared-module check the parent design asked for: how many inspector source files
  now import from `@tg/grammar` (the single-source-of-truth proof), as a data point.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request.

## Self-review notes

- **Spec coverage:** workspace package + move + rewire (T1), profile/dtcg/scaffold + both tests +
  7 components (T2), all 15 (T3), 4-context verification + golden proof throughout. All mapped.
- **Risk front-loaded:** T1 is the monorepo mechanics with an explicit 4-context + golden gate and
  a deliberate-type-error check for the typecheck wiring — the riskiest part is proven before any
  new feature code.
- **Self-contained package:** scaffold.test uses package-local flattenDtcg + getSlotMapping (no
  cycle); the inspector integration test is the buildGraph cross-check.
- **No placeholders:** exact import-line edits, exact package.json/tsconfig, exact test code; the
  one soft part (authoring 15 profiles) is bounded by the 0-unmapped test + ">0 tokens" guard.

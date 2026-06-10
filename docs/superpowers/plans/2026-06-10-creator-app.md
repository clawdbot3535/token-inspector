# token-creator app (Stage 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second app (`apps/creator/`) where you load tokens, pick a Nuxt UI component, toggle slots/states/sizes, and see a live preview (real colours via alias-semantic) + a "100% mapped" badge, with download — reusing the inspector's `Live*`/render and `@tg/grammar`'s `scaffold`.

**Architecture:** Task 1 = `scaffold` alias-semantic (`@tg/grammar`). Task 2 = vite multi-entry + creator shell (the risky build wiring). Task 3 = `semantic-role.ts` + `useCreator` composable (logic). Task 4 = full Creator UI + smoke test.

**Tech Stack:** Vue 3 SFC, vite multi-page, Vitest + VTU + jsdom, vue-tsc, `@tg/grammar`. Pre-commit hook = `vue-tsc` + full vitest; every task commit must be green.

**Branch:** `feat/creator-app` (spec at `46c51f8`).

**Spec:** `docs/superpowers/specs/2026-06-10-creator-app-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`. The inspector entry (`index.html` → `src/app/main.ts`) must stay UNCHANGED.
- Reuse, don't reimplement: `Live*` components (`src/app/components/`), `loadSources` (`src/app/load-sources.ts`), `buildGraph` (`@core/build-graph.js`), `buildComponentRecipes` (`@core/recipe-engine.js`), `downloadBlob` (`src/app/zip.ts`), `GitLoader.vue`, `scaffold`/`loadProfile`/`flattenDtcg`/`getSlotMapping` (`@tg/grammar`).

---

### Task 1: `scaffold` alias-semantic via `aliasResolver`

**Files:** Modify `packages/grammar/src/scaffold.ts`; Test `packages/grammar/src/scaffold.test.ts`.

- [ ] **Step 1: Failing tests** — add to `scaffold.test.ts`:
```typescript
import type { AliasCtx } from "./scaffold.js";

describe("scaffold: alias-semantic value strategy", () => {
  it("emits a DTCG alias when the resolver returns a name", () => {
    const resolver = (ctx: AliasCtx) => (ctx.utility === "bg" && ctx.state === null ? "color.bg.muted" : null);
    const tree = scaffold(profile, "switch", { valueStrategy: "alias-semantic", aliasResolver: resolver });
    // switch-bg → aliased; switch-bg-checked → raw fallback (resolver returned null)
    const json = JSON.stringify(tree);
    expect(json).toContain('"{color.bg.muted}"');
    // still serializable + 0-unmapped
    const ids = flattenDtcg(tree);
    expect(ids.filter((id) => getSlotMapping(id) === null)).toEqual([]);
  });
  it("falls back to placeholder when no resolver / null result", () => {
    const tree = scaffold(profile, "switch", { valueStrategy: "alias-semantic" });
    expect(JSON.stringify(tree)).toContain('"#000000"'); // no resolver → placeholders
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run packages/grammar/src/scaffold.test.ts`.

- [ ] **Step 3: Implement** in `scaffold.ts`:
  - Export `AliasCtx`:
    ```typescript
    export interface AliasCtx { component: string; part: string | null; utility: string; state: string | null; }
    ```
  - `ScaffoldOpts` += `aliasResolver?: (ctx: AliasCtx) => string | null;`.
  - `emitSegmentSets` currently returns `string[][]`; change it to return `{ segs: string[]; state: string | null }[]` (it already iterates states — carry the state, `null` for the base/non-stated emissions; size/variant emissions also `state: null`).
  - In the main loop, for each `{ segs, state }`: build `ctx = { component, part, utility: spec.utility, state }`; compute the alias name `const alias = opts.valueStrategy === "alias-semantic" ? (opts.aliasResolver?.(ctx) ?? null) : null;` and `placeLeaf(tree, segs, makeLeaf(spec.utility, alias))`.
  - `makeLeaf(utility, alias?: string | null)`: if `alias` truthy → `{ $type, $value: "{" + alias + "}" }` (keep `$type` from the utility); else the existing placeholder.

- [ ] **Step 4: Run → PASS**; then `npm run typecheck && npx vitest run` (the existing 15-component 0-unmapped + serializable tests stay green — default path unchanged).
- [ ] **Step 5: Commit**
```bash
git add packages/grammar/src/scaffold.ts packages/grammar/src/scaffold.test.ts
git commit -m "feat(grammar): scaffold alias-semantic values via aliasResolver"
```

---

### Task 2: vite multi-entry + creator shell

**Files:** Create `apps/creator/index.html`, `apps/creator/main.ts`, `apps/creator/Creator.vue`; Modify `vite.config.ts`.

- [ ] **Step 1: vite multi-entry** — `vite.config.ts`, add to the config:
```typescript
  build: {
    rollupOptions: {
      input: {
        inspector: new URL("./index.html", import.meta.url).pathname,
        creator: new URL("./apps/creator/index.html", import.meta.url).pathname,
      },
    },
  },
```
(Leave everything else, esp. the `@`/`@core` aliases.)

- [ ] **Step 2: Shell files**
- `apps/creator/index.html` (mirror `index.html`, mount point `#creator`, script `/apps/creator/main.ts`, title "Token Creator").
- `apps/creator/main.ts` (mirror `src/app/main.ts` exactly):
  ```typescript
  import { createApp } from "vue";
  import ui from "@nuxt/ui/vue-plugin";
  import Creator from "./Creator.vue";
  import "../../src/app/style.css";
  const app = createApp(Creator);
  app.use(ui);
  app.mount("#creator");
  ```
- `apps/creator/Creator.vue` — minimal shell for now: `<UApp>` wrapper + a header ("◆ Token Creator") + a load prompt that reuses the drop zone + `GitLoader` (`@/components/GitLoader.vue`), emitting into a local `loadedSources` ref via the same `loadSources` path as the inspector. No picker/preview yet (Tasks 3-4). It must compile and render the prompt.

- [ ] **Step 3: Verify both entries**
- `npm run build` — emits BOTH `inspector` and `creator` bundles, no errors.
- `npm run typecheck` green.
- Headless: `npm run dev`; `goto http://localhost:5173/apps/creator/` → the creator shell renders (header + load prompt); `goto http://localhost:5173/` → the inspector still renders unchanged. Console clean. Report both.

- [ ] **Step 4: Commit**
```bash
git add apps/creator vite.config.ts
git commit -m "feat(creator): app shell + vite multi-entry (inspector + creator)"
```

---

### Task 3: `semantic-role.ts` + `useCreator` composable

**Files:** Create `apps/creator/semantic-role.ts`, `apps/creator/useCreator.ts`; Test `apps/creator/semantic-role.test.ts`, `apps/creator/useCreator.test.ts`.

- [ ] **Step 1: Failing tests**
- `semantic-role.test.ts`: `nuxtUiAliasResolver({component:"switch", part:null, utility:"bg", state:null})` returns a non-empty string (e.g. `"color.bg.muted"`); an unknown utility/state returns `null`.
- `useCreator.test.ts` (jsdom): construct `useCreator()`, set a tiny loaded graph + `selected.component="switch"`; assert `scaffoldTree.value` has tokens, `unmappedCount.value === 0`, `previewGraph.value` is non-null and contains a `switch-bg` node.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**
- `semantic-role.ts`: a `Record` keyed by `utility` (and optionally state) → semantic token name, plus
  ```typescript
  import type { AliasCtx } from "@tg/grammar";
  export function nuxtUiAliasResolver(ctx: AliasCtx): string | null { /* best-effort map */ }
  ```
  Cover the common color utilities: `bg`→`color.bg.muted` (base) / `color.action.bg` (state checked/active) / `color.bg.disabled` (disabled); `border`→`color.border.default`; `text-color`→`color.text.default`; `ring`→`color.border.focus`. Dimension utilities (`size`/`radius`/`width`/`height`/`padding`) → `null` (raw fallback). Unknown → `null`.
- `useCreator.ts`: a composable returning refs/computeds:
  ```typescript
  loadedSources: Ref<SourceFile[]>           // set by the load handler
  selected: reactive({ component, slots, states, sizes, valueStrategy })
  profile (loadProfile(nuxtUi))
  scaffoldTree = computed(() => scaffold(profile, selected.component, { parts: selected.slots, states: selected.states, sizes: selected.sizes, valueStrategy: selected.valueStrategy, aliasResolver: nuxtUiAliasResolver }))
  unmappedCount = computed(() => flattenDtcg(scaffoldTree.value).filter((id) => getSlotMapping(id) === null).length)
  tokenCount   = computed(() => flattenDtcg(scaffoldTree.value).length)
  previewGraph = computed(() => buildGraph([...loadedSources.value, { name: "creator", data: scaffoldTree.value }]))
  download()   // JSON.stringify(scaffoldTree.value) → downloadBlob as `${component}.tokens.json`
  ```
  (Import `scaffold`/`loadProfile`/`flattenDtcg`/`getSlotMapping` from `@tg/grammar`, profile json from `@tg/grammar/profiles/nuxt-ui.json`, `buildGraph` from `@core/build-graph.js`, `downloadBlob` from `@/zip.js`, types from `@core/token-graph.js`.)

- [ ] **Step 4: Run → PASS**; `npm run typecheck && npx vitest run`.
- [ ] **Step 5: Commit**
```bash
git add apps/creator/semantic-role.ts apps/creator/useCreator.ts apps/creator/semantic-role.test.ts apps/creator/useCreator.test.ts
git commit -m "feat(creator): semantic-role alias map + useCreator composable"
```

---

### Task 4: full Creator UI + smoke test

**Files:** Create `apps/creator/ComponentPicker.vue`, `apps/creator/SlotConfig.vue`, `apps/creator/PreviewPane.vue`, `apps/creator/OutputPane.vue`, `apps/creator/Creator.test.ts`; Modify `apps/creator/Creator.vue`.

- [ ] **Step 1: Failing smoke test** — `apps/creator/Creator.test.ts` (jsdom, stub `UApp`/`UIcon`/`UButton`, mirror the inspector `App.test.ts` stub approach):
```typescript
// mount Creator, inject a small loaded graph (call the load path or set the ref via a test seam),
// pick "switch", then assert:
expect(wrapper.find('[data-testid="mapped-badge"]').text()).toContain("100%");      // 0 unmapped
expect(wrapper.find('[data-testid="switch-track"]').exists()).toBe(true);            // Live preview mounted
expect(wrapper.find('[data-testid="creator-output"]').text()).toContain("switch");   // JSON shows the component
```
(Provide a test seam: e.g. Creator accepts loaded sources via a prop or the load handler is callable; mirror how the inspector test seeds the graph through the real path where feasible.)

- [ ] **Step 2: Build the sub-components**
- `ComponentPicker.vue`: props `components: string[]`, `modelValue`; a vertical list (the 15 profile keys), active highlight, emits selection.
- `SlotConfig.vue`: props the selected component's profile axes (parts/states/sizes); toggle chips (default all-on); emits the selected subsets.
- `PreviewPane.vue`: props `graph`, `component`, `completeness`. A `componentName → LiveComponent` map for the 7 (`button→LiveButton, input→LiveInput, textarea→LiveInput(:component-name), badge→LiveBadge, switch→LiveSwitch, checkbox→LiveCheckbox, radio→LiveRadio`); render the matching `Live*` via `<component :is>`; for the other 8, a fallback panel showing `buildComponentRecipes` slot classes + a "no live render for this component" note. Include the `mapped-badge` (`data-testid`).
- `OutputPane.vue`: props `tree`, `valueStrategy`; pretty-printed JSON (`data-testid="creator-output"`), the `alias`/`raw` toggle (emits), a Download button (calls back).

- [ ] **Step 3: Assemble `Creator.vue`** — 3-column layout A wiring `useCreator`: left = ComponentPicker + SlotConfig; center = PreviewPane (`:graph="previewGraph"` `:component="selected.component"`); right = OutputPane (`:tree="scaffoldTree"`, download → `useCreator.download`). Header badge from `unmappedCount`/`tokenCount`. Keep the load prompt for the pre-load state.

- [ ] **Step 4: Run → PASS** — `npx vitest run apps/creator/Creator.test.ts`; then full gate `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 5: Commit**
```bash
git add apps/creator
git commit -m "feat(creator): full scaffolding UI — picker, config, live preview, output + download"
```

---

## Final verification

- [ ] `npm run typecheck && npx vitest run && npm run build` (both entries) green.
- [ ] Headless QA: open `/apps/creator/`, load `components/*.tokens.json`, pick `switch` → live preview
  in REAL colours (not black) + "100% mapped" badge; toggle a state off → preview + JSON update;
  pick `button` → size variants; pick `card` (no Live*) → structural fallback; Download writes
  `switch.tokens.json`; console clean. Also confirm `/` (inspector) still works. Screenshots.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request.

## Self-review notes

- **Spec coverage:** scaffold alias-semantic (T1), shell + vite multi-entry (T2), semantic-role +
  useCreator (T3), full UI + 7-live/8-structural preview + download + smoke test (T4). All mapped.
- **Risk front-loaded:** T2 proves the vite multi-entry + the inspector-unchanged guarantee before
  any UI work. T1 is a small package extension the rest depends on.
- **Reuse over reimplement:** every preview/render/load/download/grammar piece is imported, not
  rebuilt; only the shell, the picker/config, the alias map, and the composable are new.
- **No placeholders:** scaffold code given; shell files given; composable + resolver shapes given;
  the sub-components are described by exact props + reuse points; the smoke test asserts the real
  payoff (badge + live render + JSON).

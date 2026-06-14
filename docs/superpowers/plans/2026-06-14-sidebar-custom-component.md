# Sidebar as a Known-Custom Component (Bucket D part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the export's `sidebar` tokens as a `sidebarRecipe` in `custom-components.ts` by seeding a `KNOWN_CUSTOM_COMPONENTS` registry into the custom-emit path, since Nuxt UI v4 has no sidebar component.

**Architecture:** Purely additive. A new `KNOWN_CUSTOM_COMPONENTS` registry (`@tg/grammar`) maps `sidebar → ["item"]`; `customPartsByComponent` seeds it before the scanner-flagged entries, so both the CLI (`build-cli.ts`) and the web (`App.vue`) — which both derive `customParts` from that one function — emit `sidebarRecipe` with no further wiring. `buildCustomRecipes` (already applies `normalizeTrailingColorRole` + trailing-state handling) and `customComponentsRenderer` do the rest; components with no matching tokens are skipped, so projects without sidebar tokens stay a no-op. `NUXT_SLOTS` and `COMPONENT_ALLOW_LIST` stay Nuxt-only.

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` import suffix). Pre-commit hook runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-14-sidebar-custom-component-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/component-vocab.ts` — add `KNOWN_CUSTOM_COMPONENTS`.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — registry membership.
- **Modify** `src/scanner.ts` — seed the registry in `customPartsByComponent` (import it).
- **Modify** `src/scanner.test.ts` — `customPartsByComponent` includes `sidebar` (alone + alongside a flagged chip).
- **Modify** `src/renderers/renderers.test.ts` — end-to-end: `customComponentsRenderer` emits `sidebarRecipe`.

No `slot-mapping.ts` / `app-config.ts` / `build-cli.ts` / `App.vue` / renderer-logic change — the seam is `customPartsByComponent`.

---

## Task 1: `KNOWN_CUSTOM_COMPONENTS` registry (grammar package)

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (near `NON_COMPONENT_PREFIXES`)
- Test: `packages/grammar/src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/grammar/src/component-vocab.test.ts`, append (and add `KNOWN_CUSTOM_COMPONENTS` to the existing `./component-vocab.js` import at the top):

```ts
describe("KNOWN_CUSTOM_COMPONENTS", () => {
  it("maps sidebar to its routable sub-element slots", () => {
    expect(KNOWN_CUSTOM_COMPONENTS.get("sidebar")).toEqual(["item"]);
  });
  it("does not list a real Nuxt component", () => {
    expect(KNOWN_CUSTOM_COMPONENTS.has("button")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts`
Expected: FAIL — `KNOWN_CUSTOM_COMPONENTS` is not exported.

- [ ] **Step 3: Add the registry**

In `packages/grammar/src/component-vocab.ts`, add immediately above `export const NON_COMPONENT_PREFIXES`:

```ts
/**
 * Components with no Nuxt UI recipe that the inspector emits as hand-anatomy
 * custom recipes (custom-components.ts), independent of the scanner's
 * `component-looks-custom` flag. Maps component → its routable sub-element slots
 * (used as extraSlots; base-level tokens use the default `base` slot).
 */
export const KNOWN_CUSTOM_COMPONENTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["sidebar", ["item"]],
]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/component-vocab.test.ts
git commit -m "feat(grammar): add KNOWN_CUSTOM_COMPONENTS registry (sidebar)"
```

---

## Task 2: Seed the registry into the custom-emit path

**Files:**
- Modify: `src/scanner.ts` (`@tg/grammar` import line 20; `customPartsByComponent` line ~787)
- Test: `src/scanner.test.ts`, `src/renderers/renderers.test.ts`

> Depends on Task 1.

- [ ] **Step 1: Write the failing tests**

(a) In `src/scanner.test.ts`, append a new describe block at the end of the file (it imports `scanGraph` / `customPartsByComponent` and has `makeGraph` / `makeNode`):

```ts
describe("customPartsByComponent — known-custom registry (sidebar)", () => {
  it("seeds sidebar even with no scanner flags", () => {
    const map = customPartsByComponent({ issues: [] });
    expect(map.get("sidebar")).toEqual(["item"]);
  });

  it("includes both a registry component and a scanner-flagged one", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-close-bg", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const map = customPartsByComponent(scanGraph(graph, { components: ["chip"] }));
    expect(map.get("sidebar")).toEqual(["item"]);
    expect(map.get("chip")).toEqual(expect.arrayContaining(["label", "close"]));
  });
});
```

(b) In `src/renderers/renderers.test.ts`, append a new describe block at the end (it imports `buildGraph`, `customComponentsRenderer`, `scanGraph`, `customPartsByComponent`, and `SourceFile`):

```ts
describe("customComponentsRenderer — sidebar (known-custom)", () => {
  it("emits a sidebarRecipe with base + item slots and an active prefix", () => {
    const sidebarSources: SourceFile[] = [
      {
        name: "global",
        data: {
          sidebar: {
            bg: { $type: "color", $value: "#FFFFFF" },
            item: {
              text: { $type: "color", $value: "#18181B" },
              bg: { active: { $type: "color", $value: "#EEF2FF" } },
            },
          },
        },
      },
    ];
    const g = buildGraph(sidebarSources);
    const customParts = customPartsByComponent({ issues: [] });
    const out = customComponentsRenderer.render(g, { customParts });
    expect(out.text).toContain("export const sidebarRecipe");
    expect(out.text).toContain("item:");
    expect(out.text).toMatch(/active:/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/scanner.test.ts src/renderers/renderers.test.ts`
Expected: FAIL — `customPartsByComponent({ issues: [] })` has no `sidebar` (returns empty), and the renderer emits no `sidebarRecipe`.

- [ ] **Step 3a: Import `KNOWN_CUSTOM_COMPONENTS` in the scanner**

In `src/scanner.ts`, line 20, add `KNOWN_CUSTOM_COMPONENTS` to the `@tg/grammar` import:

```ts
import { getSlotMapping, KNOWN_VARIANT_NAMES, RING_FRAMED_VARIANTS, propDrivenStateFor, nuxtSlotsFor, NON_PART_SEGMENTS, NON_COMPONENT_PREFIXES, KNOWN_CUSTOM_COMPONENTS, FIGMA_NUXT_PART_ALIAS, SLOT_PAIRS, SLOT_MIRROR } from "@tg/grammar";
```

- [ ] **Step 3b: Seed the registry in `customPartsByComponent`**

In `src/scanner.ts`, replace the body of `customPartsByComponent`:

```ts
  const out = new Map<string, string[]>();
  for (const i of report.issues) {
    if (i.kind !== "component-looks-custom") continue;
    if (i.componentName === undefined || i.customParts === undefined) continue;
    out.set(i.componentName, [...i.customParts]);
  }
  return out;
```

with (seed the registry first; scanner-flagged entries still win on any collision):

```ts
  const out = new Map<string, string[]>();
  for (const [component, parts] of KNOWN_CUSTOM_COMPONENTS) {
    out.set(component, [...parts]);
  }
  for (const i of report.issues) {
    if (i.kind !== "component-looks-custom") continue;
    if (i.componentName === undefined || i.customParts === undefined) continue;
    out.set(i.componentName, [...i.customParts]);
  }
  return out;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts src/renderers/renderers.test.ts`
Expected: PASS — `customPartsByComponent` includes `sidebar → ["item"]` (alone and alongside `chip`); the renderer emits `export const sidebarRecipe` with an `item:` slot and an `active:` prefix. The existing chip `customPartsByComponent` test still passes (it checks chip presence, not exclusivity).

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts src/renderers/renderers.test.ts
git commit -m "feat(scanner): seed KNOWN_CUSTOM_COMPONENTS so sidebar emits a custom recipe"
```

Expected: pre-commit hook (vue-tsc + full vitest) passes.

---

## Task 3: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS — all files green (≈ 643 tests), no type errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds (`vue-tsc -b` + `vite build`).

- [ ] **Step 3: Confirm the CLI digest / custom-components is unchanged on the local fixture**

Run: `npm run build:tokens`
Expected: exit 0, scan digest unchanged in character. The committed `components/` fixture has no `sidebar` tokens, so `buildCustomRecipes` skips sidebar (no matching tokens → `built["sidebar"]` is `undefined` → not emitted). No empty `sidebarRecipe` appears in `output/nuxt/custom-components.ts`. This is a no-op there — the new behavior is proven by the unit tests.

- [ ] **Step 4 (optional): Real-export spot-check via git-import**

The real `sidebar-*` tokens live only in the 914-token export. Optional: import `github.com/clawdbot3535/design-token-export` through the inspector's git-import and confirm `custom-components.ts` now carries `export const sidebarRecipe` with a `base` slot and an `item` slot (with `active:` / `hover:` prefixes); `sidebar-section-label-*` and `sidebar-width-collapsed` stay absent (deferred stragglers). Not required — the unit tests are authoritative.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 `KNOWN_CUSTOM_COMPONENTS` registry → Task 1. ✓
- Part 2 seed in `customPartsByComponent` (single seam, both CLI + web) → Task 2 (Steps 3a/3b). ✓
- Success criteria (registry membership; `customPartsByComponent({issues:[]})` has sidebar; coexists with chip; renderer emits `sidebarRecipe` base+item+active; appConfig does not emit `ui.sidebar`) → Task 1 Step 1 + Task 2 Step 1(a)(b). (appConfig non-emit is implicit: sidebar is not allow-listed, so `appConfigRenderer` never iterates it — no test needed beyond the existing allow-list behaviour.) ✓
- No-op on fixture / no empty recipe → Task 3 Step 3 (buildCustomRecipes skips token-less components). ✓
- Stragglers deferred → spec Non-goals (not implemented by design); no task. ✓

**Placeholder scan:** none — every code/test step shows full content.

**Type consistency:** `KNOWN_CUSTOM_COMPONENTS: ReadonlyMap<string, readonly string[]>` is declared in Task 1 and iterated in Task 2 (`for (const [component, parts] of …)`, `[...parts]`). `customPartsByComponent` keeps its `ReadonlyMap<string, readonly string[]>` return. Test assertions use `.get("sidebar")` / `.has(...)` / `expect.arrayContaining` consistently; the renderer call mirrors the existing chip test (`customComponentsRenderer.render(g, { customParts })` → `export const <name>Recipe`).

# Reclassify Layout / Typography Primitives (Bucket E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognise the export's layout / type-scale prefixes (`typography`, `container`, `page`, `grid`, `stack`, `section`) as non-component primitives so the scan forecast reports them separately from genuinely-unmapped components.

**Architecture:** Purely additive. A new `NON_COMPONENT_PREFIXES` set in `@tg/grammar`; the scanner's `computeForecast` splits the not-in-allow-list prefixes into `nonComponentPrefixes` (known primitives) and `unmappedComponentPrefixes` (genuine unmapped components like `sidebar`); a new `OutputForecast` field; one honest label line in `ScanView.vue`. No layer change, no CSS-var emit, no grammar mapping change.

**Tech Stack:** TypeScript, Vitest, Vue 3, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` import suffix). Pre-commit hook runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-13-non-component-prefixes-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/component-vocab.ts` — add `NON_COMPONENT_PREFIXES`.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — membership test.
- **Modify** `src/token-graph.ts` — add `nonComponentPrefixes` to `OutputForecast`.
- **Modify** `src/scanner.ts` — split the forecast prefixes (import `NON_COMPONENT_PREFIXES`).
- **Modify** `src/scanner.test.ts` — the split behaviour.
- **Modify** `src/app/components/ScanView.vue` — render the non-component line.

No `build-graph` / `classify-token` / renderer / `getSlotMapping` change.

---

## Task 1: `NON_COMPONENT_PREFIXES` (grammar package)

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (next to `NON_PART_SEGMENTS`, line ~153)
- Test: `packages/grammar/src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/grammar/src/component-vocab.test.ts`, append (and add `NON_COMPONENT_PREFIXES` to the existing `./component-vocab.js` import at the top of the file):

```ts
describe("NON_COMPONENT_PREFIXES", () => {
  it("lists the layout / type-scale primitive prefixes", () => {
    for (const p of ["typography", "container", "page", "grid", "stack", "section"]) {
      expect(NON_COMPONENT_PREFIXES.has(p)).toBe(true);
    }
  });
  it("does not list a real Nuxt component", () => {
    expect(NON_COMPONENT_PREFIXES.has("button")).toBe(false);
    expect(NON_COMPONENT_PREFIXES.has("sidebar")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts`
Expected: FAIL — `NON_COMPONENT_PREFIXES` is not exported (import error / undefined).

- [ ] **Step 3: Add the set**

In `packages/grammar/src/component-vocab.ts`, add immediately above `export const NON_PART_SEGMENTS`:

```ts
/**
 * Top-level token prefixes that are layout / type-scale primitives, not Nuxt
 * UI components. They land in the component layer (authored in the `global`
 * source) but belong to the theme/CSS layer — the scan forecast reports them as
 * non-component primitives, not as "unmapped components".
 */
export const NON_COMPONENT_PREFIXES: ReadonlySet<string> = new Set<string>([
  "typography", "container", "page", "grid", "stack", "section",
]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/component-vocab.test.ts
git commit -m "feat(grammar): add NON_COMPONENT_PREFIXES (layout/type-scale primitives)"
```

---

## Task 2: Scanner forecast split (`nonComponentPrefixes`)

**Files:**
- Modify: `src/token-graph.ts` (`OutputForecast`, line ~190-203)
- Modify: `src/scanner.ts` (`@tg/grammar` import line 20; `computeForecast` lines ~766-779)
- Test: `src/scanner.test.ts`

> Depends on Task 1.

- [ ] **Step 1: Write the failing test**

In `src/scanner.test.ts`, append a new describe block at the end of the file (it already imports `scanGraph` and has `makeGraph` / `makeNode` helpers):

```ts
describe("scanGraph — non-component prefixes (Bucket E)", () => {
  it("splits layout/type-scale primitives out of the unmapped list", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-body-color", layer: "component", type: "color", source: "global", base: "#18181B" }),
      makeNode({ id: "grid-gap-sm", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "sidebar-item-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.forecast.nonComponentPrefixes).toEqual(["grid", "typography"]);
    expect(report.forecast.unmappedComponentPrefixes).toContain("sidebar");
    expect(report.forecast.unmappedComponentPrefixes).not.toContain("typography");
    expect(report.forecast.unmappedComponentPrefixes).not.toContain("grid");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — `report.forecast.nonComponentPrefixes` is `undefined`, and `typography`/`grid` are still in `unmappedComponentPrefixes`.

- [ ] **Step 3a: Add the `OutputForecast` field**

In `src/token-graph.ts`, in the `OutputForecast` interface, add the field right after `unmappedComponentPrefixes`:

```ts
  unmappedComponentPrefixes: readonly string[];
  nonComponentPrefixes: readonly string[];
```

- [ ] **Step 3b: Import `NON_COMPONENT_PREFIXES` in the scanner**

In `src/scanner.ts`, line 20, add `NON_COMPONENT_PREFIXES` to the `@tg/grammar` import:

```ts
import { getSlotMapping, KNOWN_VARIANT_NAMES, RING_FRAMED_VARIANTS, propDrivenStateFor, nuxtSlotsFor, NON_PART_SEGMENTS, NON_COMPONENT_PREFIXES, FIGMA_NUXT_PART_ALIAS, SLOT_PAIRS, SLOT_MIRROR } from "@tg/grammar";
```

- [ ] **Step 3c: Split the forecast prefixes**

In `src/scanner.ts`, in `computeForecast`, replace:

```ts
  const unmappedComponentPrefixes = Array.from(allComponentPrefixes)
    .filter((p) => !allowSet.has(p))
    .sort();

  return {
    tokensCss: {
      estimatedBytes,
      tailwindMatches,
      themeExtensions,
      modeVariantEntries,
    },
    components,
    unmappedComponentPrefixes,
  };
```

with:

```ts
  const notAllowed = Array.from(allComponentPrefixes).filter((p) => !allowSet.has(p));
  const nonComponentPrefixes = notAllowed.filter((p) => NON_COMPONENT_PREFIXES.has(p)).sort();
  const unmappedComponentPrefixes = notAllowed.filter((p) => !NON_COMPONENT_PREFIXES.has(p)).sort();

  return {
    tokensCss: {
      estimatedBytes,
      tailwindMatches,
      themeExtensions,
      modeVariantEntries,
    },
    components,
    unmappedComponentPrefixes,
    nonComponentPrefixes,
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — `nonComponentPrefixes` is `["grid", "typography"]`; `sidebar` stays in `unmappedComponentPrefixes`; the existing `card` forecast test still passes.

- [ ] **Step 5: Commit**

```bash
git add src/token-graph.ts src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): split non-component primitives out of unmappedComponentPrefixes"
```

---

## Task 3: ScanView label

**Files:**
- Modify: `src/app/components/ScanView.vue` (the forecast block, line ~185)

> Depends on Task 2 (the `nonComponentPrefixes` field).

- [ ] **Step 1: Add the label line**

In `src/app/components/ScanView.vue`, find:

```html
      <span v-if="report.forecast.unmappedComponentPrefixes.length > 0">
        Unmapped: {{ report.forecast.unmappedComponentPrefixes.join(", ") }}.
      </span>
```

and add immediately after it:

```html
      <span v-if="report.forecast.nonComponentPrefixes.length > 0">
        Layout/typography primitives (theme/CSS, not <code>ui.*</code> recipes):
        {{ report.forecast.nonComponentPrefixes.join(", ") }}.
      </span>
```

- [ ] **Step 2: Verify the build (vue-tsc type-checks the template)**

Run: `npm run build`
Expected: build succeeds — `vue-tsc -b` confirms `report.forecast.nonComponentPrefixes` is a valid typed field (added to `OutputForecast` in Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/app/components/ScanView.vue
git commit -m "feat(ui): label layout/typography primitives distinctly in ScanView"
```

---

## Task 4: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS — all files green (≈ 637 tests), no type errors.

- [ ] **Step 2: Confirm the CLI digest is unchanged**

Run: `npm run build:tokens`
Expected: exit 0, scan digest unchanged in character — the CLI prints scan *issues*, not the forecast prefix lists, so this change is invisible to the CLI digest. (The scanner output change — `typography` moving to `nonComponentPrefixes` — is proven by the Task 2 unit test and visible in the web ScanView.)

- [ ] **Step 3 (optional): Real-export spot-check via git-import**

Optional: import `github.com/clawdbot3535/design-token-export` through the inspector's git-import and confirm the ScanView forecast now shows `typography, container, page, grid, stack, section` under the "Layout/typography primitives" line and only genuine components (e.g. `sidebar`) under "Unmapped". Not required — the unit tests are authoritative.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 `NON_COMPONENT_PREFIXES` → Task 1. ✓
- Part 2 forecast split + `OutputForecast` field → Task 2 (Steps 3a/3b/3c). ✓
- Part 3 UI label → Task 3. ✓
- Success criteria (set membership; split with typography/grid → non-component, sidebar → unmapped; new forecast field) → Task 1 Step 1 + Task 2 Step 1. ✓
- Non-goals (no layer/classify/grammar change) → confirmed in File Structure ("No build-graph / classify-token / …"). ✓

**Placeholder scan:** none — every code/test step shows full content.

**Type consistency:** `nonComponentPrefixes: readonly string[]` is declared in `OutputForecast` (Task 2 Step 3a) and produced in `computeForecast` (Step 3c) and read in the test (`report.forecast.nonComponentPrefixes`) and template — all the same name. The split uses `allowSet` / `allComponentPrefixes` already in scope in `computeForecast`. The test's expected `["grid", "typography"]` is alphabetically sorted (matching `.sort()`).

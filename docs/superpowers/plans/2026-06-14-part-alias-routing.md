# Honour Part Aliases in Slot Routing (dot→indicator &c.) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a sub-element segment to its Nuxt slot via `FIGMA_NUXT_PART_ALIAS`, so `radio-dot-*` tokens map to the `indicator` slot, and retire the now-moot `unsupported-part` rename hint for aliased-routable parts.

**Architecture:** Two small changes. (1) `parseSegments`' `slotPrefix` seam (grammar) gains an alias fallback — when an exact slot match fails, a segment whose `FIGMA_NUXT_PART_ALIAS` target is a real slot routes to that Nuxt slot name. (2) The scanner's `unsupported-part` detector skips aliased-routable parts (the grammar now handles them), so it stops suggesting an unnecessary rename. Each task is an independent green commit.

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` import suffix). Pre-commit hook runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-14-part-alias-routing-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/slot-mapping.ts` — `parseSegments` seam alias fallback (import `FIGMA_NUXT_PART_ALIAS`).
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — `radio-dot-*` mappings + regression / boundary cases.
- **Modify** `src/scanner.ts` — `unsupported-part` skips aliased-routable parts.
- **Modify** `src/scanner.test.ts` — flip the `table row → tr` rename test.

No renderer / `app-config` / `FIGMA_NUXT_PART_ALIAS` change.

---

## Task 1: Honour the alias in the `slotPrefix` seam (grammar)

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts` (import line ~76; `slotPrefix` seam lines ~118-128)
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/grammar/src/slot-mapping.test.ts`:

```ts
describe("heuristicSlotMapping — part alias routing (dot→indicator)", () => {
  it("routes radio-dot-color-error to the indicator slot (color axis)", () => {
    expect(heuristicSlotMapping("radio-dot-color-error", "color")).toEqual({
      slot: "indicator", utilityType: "text-color", variantAxis: "color", variantKey: "error",
    });
  });

  it("routes radio-dot-color to the indicator slot", () => {
    expect(heuristicSlotMapping("radio-dot-color", "color")).toEqual({
      slot: "indicator", utilityType: "text-color", variantAxis: null, variantKey: null,
    });
  });

  it("carries a trailing disabled state (radio-dot-color-disabled)", () => {
    expect(heuristicSlotMapping("radio-dot-color-disabled", "color")).toEqual({
      slot: "indicator", utilityType: "text-color", variantAxis: null, variantKey: null,
      statePrefix: "disabled",
    });
  });

  it("routes radio-dot-size-md to the indicator slot (size axis)", () => {
    expect(heuristicSlotMapping("radio-dot-size-md")).toEqual({
      slot: "indicator", utilityType: "size", variantAxis: "size", variantKey: "md",
    });
  });

  it("prefers an exact slot match over an alias (radio-item-bg → item)", () => {
    expect(heuristicSlotMapping("radio-item-bg", "color")).toEqual({
      slot: "item", utilityType: "bg-color", variantAxis: null, variantKey: null,
    });
  });

  it("does not alias when the target is not a slot of the component (button-dot-bg → null)", () => {
    expect(heuristicSlotMapping("button-dot-bg", "color")).toBeNull();
  });

  it("does not rescue a token blocked by a mid-token state (table-row-hover-bg → null)", () => {
    expect(heuristicSlotMapping("table-row-hover-bg", "color")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: the four `radio-dot-*` cases FAIL (currently NULL). `radio-item-bg`, `button-dot-bg`, and `table-row-hover-bg` already pass (exact match / no alias target / still-null).

- [ ] **Step 3: Add `FIGMA_NUXT_PART_ALIAS` to the import**

In `packages/grammar/src/slot-mapping.ts`, the import from `./component-vocab.js` (line ~76) currently reads:

```ts
import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, SIZE_KEYS, STATE_KEYS, RING_FRAMED_COMPONENTS, RING_FRAMED_VARIANTS, isRingFramedVariant, propDrivenStateFor, nuxtSlotsFor } from "./component-vocab.js";
```

Add `FIGMA_NUXT_PART_ALIAS`:

```ts
import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, SIZE_KEYS, STATE_KEYS, RING_FRAMED_COMPONENTS, RING_FRAMED_VARIANTS, isRingFramedVariant, propDrivenStateFor, nuxtSlotsFor, FIGMA_NUXT_PART_ALIAS } from "./component-vocab.js";
```

- [ ] **Step 4: Add the alias fallback to the seam**

In `packages/grammar/src/slot-mapping.ts`, replace the `slotPrefix` seam:

```ts
  let slotPrefix: RecipeSlot | null = null;
  const slotSeg = parts[start];
  if (
    slotSeg !== undefined &&
    slotSeg !== "base" &&
    componentSlots !== undefined &&
    componentSlots.has(slotSeg)
  ) {
    slotPrefix = slotSeg;
    start += 1;
  }
```

with:

```ts
  let slotPrefix: RecipeSlot | null = null;
  const slotSeg = parts[start];
  if (slotSeg !== undefined && slotSeg !== "base" && componentSlots !== undefined) {
    if (componentSlots.has(slotSeg)) {
      slotPrefix = slotSeg;
      start += 1;
    } else {
      // Honour the curated Figma→Nuxt rename map: a segment whose alias target
      // is a real slot for this component routes to that Nuxt slot name
      // (e.g. radio `dot` → `indicator`).
      const aliased = FIGMA_NUXT_PART_ALIAS.get(slotSeg);
      if (aliased !== undefined && componentSlots.has(aliased)) {
        slotPrefix = aliased;
        start += 1;
      }
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS — `radio-dot-*` route to `indicator`; the regression/boundary cases stay as asserted; the existing grammar cases are unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "feat(grammar): honour FIGMA_NUXT_PART_ALIAS in slot routing (dot→indicator)"
```

Expected: pre-commit hook passes — the grammar change is additive; `table-row-hover-bg` stays NULL, so the existing `up-table-row` scanner test still passes (it is flipped in Task 2).

---

## Task 2: Retire the rename hint for aliased-routable parts (scanner)

**Files:**
- Modify: `src/scanner.ts` (`unsupported-part` loop line ~180-181)
- Test: `src/scanner.test.ts` (the `table row → tr` test ~609-619)

> Depends on Task 1 conceptually (same alias), but independent in code. `FIGMA_NUXT_PART_ALIAS` is already imported in `scanner.ts`.

- [ ] **Step 1: Flip the failing test**

In `src/scanner.test.ts`, REPLACE the test titled `"suggests the Nuxt slot name for a known naming mismatch (table row → tr)"`:

```ts
  it("suggests the Nuxt slot name for a known naming mismatch (table row → tr)", () => {
    const graph = makeGraph([
      makeNode({ id: "table-base-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "table-row-hover-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const report = scanGraph(graph, { components: ["table"] });
    const hit = report.issues.find((i) => i.kind === "unsupported-part" && i.id === "up-table-row");
    expect(hit).toBeDefined();
    expect(hit!.message).toContain("`tr`");
    expect(hit!.message.toLowerCase()).toContain("rename");
  });
```

with (an aliased-routable part is no longer flagged — the grammar routes it):

```ts
  it("does not flag an aliased-routable part (table row → tr); the grammar routes it", () => {
    const graph = makeGraph([
      makeNode({ id: "table-base-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "table-row-hover-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const report = scanGraph(graph, { components: ["table"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part" && i.id === "up-table-row")).toBeUndefined();
  });
```

(The existing chip `label`/`close` foreign-part tests stay unchanged and still fire — `label`/`close` are not in `FIGMA_NUXT_PART_ALIAS`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — the new assertion expects no `up-table-row` hint, but the scanner still emits one (`row` is a foreign part that is null-mapped).

- [ ] **Step 3: Skip aliased-routable parts in the detector**

In `src/scanner.ts`, in the `unsupported-part` loop, replace:

```ts
    for (const { seg, id } of nullToks) {
      if (mapped.has(seg) || slots.has(seg) || NON_PART_SEGMENTS.has(seg)) continue;
      const arr = byPart.get(seg) ?? [];
      arr.push(id);
      byPart.set(seg, arr);
    }
```

with:

```ts
    for (const { seg, id } of nullToks) {
      const aliasTarget = FIGMA_NUXT_PART_ALIAS.get(seg);
      if (
        mapped.has(seg) || slots.has(seg) || NON_PART_SEGMENTS.has(seg) ||
        (aliasTarget !== undefined && slots.has(aliasTarget))
      ) continue;
      const arr = byPart.get(seg) ?? [];
      arr.push(id);
      byPart.set(seg, arr);
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — `up-table-row` is no longer emitted; the chip `label`/`close` unsupported-part tests still pass (those parts are not aliased).

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): retire the unsupported-part rename hint for aliased-routable parts"
```

Expected: pre-commit hook (vue-tsc + full vitest) passes.

---

## Task 3: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS — all files green (≈ 651 tests), no type errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds (`vue-tsc -b` + `vite build`).

- [ ] **Step 3: Confirm the intentional digest change on the local fixture**

Run: `npm run build:tokens`
Expected: exit 0. The digest **changes**: the committed `components/` fixture has `table-row-*` and `table-divider` tokens, so the `[unsupported-part] … rename it in Figma to table-tr-…` and `… table-separator-…` hints **disappear** (the scanner now treats `row`/`divider` as aliased-routable). There is no `app.config` / golden-snapshot change — no fixture token newly maps (the fixture has no `radio-dot-*`; `table-row-hover-bg` stays NULL on a mid-token state, `table-divider` on a missing utility). Confirm no NEW `error`-severity issues (exit stays 0).

- [ ] **Step 4 (optional): Real-export spot-check via git-import**

The real `radio-dot-*` tokens live only in the 914-token export. Optional: import `github.com/clawdbot3535/design-token-export` and confirm `ui.radio` now carries `indicator`-slot entries for `radio-dot-color-{,error,success,disabled}` and `radio-dot-size-md`, and that the `unsupported-part` rename hints for aliased parts (`row`, `divider`, `dot`) are gone. Not required — the unit tests are authoritative.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 alias fallback in the seam → Task 1 Steps 3-4. ✓
- Part 2 scanner skips aliased-routable parts → Task 2 Step 3. ✓
- Success criteria (radio-dot mappings; exact-match regression; `button-dot-bg` null; `table-row-hover-bg` null boundary; scanner no `up-table-row`, chip still flagged) → Task 1 Step 1 + Task 2 Step 1. ✓
- Intentional fixture digest change (rename hints gone, no snapshot change) → Task 3 Step 3. ✓
- Stragglers (table tokens, check→icon) deferred → spec Non-goals; no task. ✓

**Placeholder scan:** none — every code/test step shows full content.

**Type consistency:** the seam uses `slotPrefix`/`slotSeg`/`start`/`componentSlots` already in scope; `FIGMA_NUXT_PART_ALIAS.get(...)` returns `string | undefined`, guarded before `componentSlots.has(...)` / `slots.has(...)`. Test assertions use `SlotMappingEntry` field names (`slot`/`utilityType`/`variantAxis`/`variantKey`/`statePrefix`) and the scanner `ScanIssue` `id`/`kind` fields, matching the existing tests.

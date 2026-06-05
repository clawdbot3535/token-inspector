# Prop-driven state deviation detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode per-component prop-driven states (seed: `input.active → highlight`), drop those tokens from the recipe, and flag them in the scanner — mirroring the D3 validation-colour deviation.

**Architecture:** A `PROP_DRIVEN_STATES` table + `propDrivenStateFor` helper in `component-vocab.ts`; an early `return null` in `heuristicSlotMapping`; an `else if` hint in the scanner's existing `mapping === null` branch.

**Tech Stack:** TypeScript engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; **every task commit must be green**.

**Branch:** `feat/prop-driven-states` (spec committed at `91072fe`).

**Spec:** `docs/superpowers/specs/2026-06-05-prop-driven-state-deviation-design.md`

**Note:** the committed `components/global.tokens.json` has no `input-border-active` (that token is in the newer export, not committed), so these changes don't alter the current committed build; tests use synthetic ids.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/component-vocab.ts` | `PROP_DRIVEN_STATES` table + `propDrivenStateFor` | 1 |
| `src/component-vocab.test.ts` | helper truth table | 1 |
| `src/slot-mapping.ts` | drop prop-driven-state tokens (`return null`) | 2 |
| `src/slot-mapping.test.ts` | drop + non-drop assertions | 2 |
| `src/scanner.ts` | `state-via-prop` warning in the `mapping === null` branch | 3 |
| `src/scanner.test.ts` | hint fires / doesn't-fire | 3 |

---

### Task 1: Vocabulary — `PROP_DRIVEN_STATES` + helper

**Files:**
- Modify: `src/component-vocab.ts` (after `STATE_KEYS`, end of file ~line 42)
- Test: `src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/component-vocab.test.ts`, add `PROP_DRIVEN_STATES, propDrivenStateFor` to the import on line 2, and append this `describe` at the end:

```typescript
describe("PROP_DRIVEN_STATES / propDrivenStateFor", () => {
  it("marks input `active` as driven by the highlight prop", () => {
    expect(propDrivenStateFor("input", "active")).toBe("highlight");
  });
  it("does not mark `active` as prop-driven for button (valid :active there)", () => {
    expect(propDrivenStateFor("button", "active")).toBeNull();
  });
  it("returns null for a null state, a real pseudo-class state, and unknown components", () => {
    expect(propDrivenStateFor("input", null)).toBeNull();
    expect(propDrivenStateFor("input", "focus")).toBeNull();
    expect(propDrivenStateFor("table", "active")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: FAIL — symbols not exported.

- [ ] **Step 3: Add the table and helper**

In `src/component-vocab.ts`, append after the `STATE_KEYS` declaration:

```typescript
/**
 * Per-component states that Nuxt UI v4 applies via a PROP, not a CSS
 * pseudo-class. Such tokens cannot be expressed as a recipe slot/class, so the
 * grammar drops them and the scanner flags them as deviations.
 *
 * Seed: Nuxt Input has no `:active` state — its "active / selected" look is the
 * `highlight` boolean prop (`ring ring-inset ring-<color>`). `:active` IS valid
 * for button (pressed), so this is keyed per component. Only deviations live
 * here; real pseudo-class states (hover/focus/disabled) route via STATE_KEYS.
 */
export const PROP_DRIVEN_STATES: ReadonlyMap<string, ReadonlyMap<string, string>> =
  new Map([["input", new Map([["active", "highlight"]])]]);

/** Returns the Nuxt prop that drives `state` on `component`, or null. */
export function propDrivenStateFor(component: string, state: string | null): string | null {
  if (state === null) return null;
  return PROP_DRIVEN_STATES.get(component)?.get(state) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/component-vocab.ts src/component-vocab.test.ts
git commit -m "feat(vocab): PROP_DRIVEN_STATES table (input active → highlight prop)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: Grammar — drop prop-driven-state tokens

**Files:**
- Modify: `src/slot-mapping.ts` (import line 71; insert in `heuristicSlotMapping` after the `ctx` build, ~line 343, before the `text` intercept at ~345)
- Test: `src/slot-mapping.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/slot-mapping.test.ts` (a small new `describe` or with the other input/button cases):

```typescript
describe("heuristicSlotMapping — prop-driven states (capability)", () => {
  it("drops input-border-active (Nuxt applies `active` via the highlight prop)", () => {
    expect(heuristicSlotMapping("input-border-active", undefined, "color")).toBeNull();
  });
  it("keeps input-border-focus mapping (focus is a real pseudo-class)", () => {
    expect(heuristicSlotMapping("input-border-focus", undefined, "color")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });
  it("keeps button-solid-bg-active (`:active` is valid for button)", () => {
    expect(heuristicSlotMapping("button-solid-bg-active")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "solid",
      statePrefix: "active",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: FAIL — `input-border-active` currently maps to `active:ring-color` (not null). The other two already pass.

- [ ] **Step 3: Import the helper**

`src/slot-mapping.ts` line 71 — add `propDrivenStateFor`:

```typescript
import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, SIZE_KEYS, STATE_KEYS, RING_FRAMED_COMPONENTS, RING_FRAMED_VARIANTS, isRingFramedVariant, propDrivenStateFor } from "./component-vocab.js";
```

- [ ] **Step 4: Add the drop**

In `heuristicSlotMapping`, immediately after the `ctx` object is built (the `const ctx: BuildContext = { … };` block ending ~line 343) and BEFORE the `// \`text\` defaults to text-size …` intercept comment (~line 345), insert:

```typescript
  // Prop-driven states (input `active` → `highlight` prop) are applied by Nuxt
  // via a prop, not a recipe class — drop them; the scanner flags the deviation.
  if (propDrivenStateFor(parsed.component, parsed.state) !== null) {
    return null;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS — `input-border-active` → null; focus/button-active unchanged.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (no committed token is `input-*-active`, so no regression).

- [ ] **Step 7: Commit**

```bash
git add src/slot-mapping.ts src/slot-mapping.test.ts
git commit -m "feat(grammar): drop prop-driven-state tokens (input active → highlight)"
```
Verify no attribution trailer; amend if present.

---

### Task 3: Scanner — `state-via-prop` warning

**Files:**
- Modify: `src/scanner.ts` (import line 21; helper near `isValidationColorBorder` ~line 54; hint in the `mapping === null` branch ~lines 83-100)
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/scanner.test.ts` (new `describe`):

```typescript
describe("scanGraph — prop-driven state hint (capability)", () => {
  it("flags input-border-active as applied via the highlight prop", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-active", layer: "component", type: "color", source: "global", base: "#8A9DDB" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    const hint = report.issues.find((i) => i.kind === "state-via-prop");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.componentName).toBe("input");
    expect(hint?.message).toContain("highlight");
    expect(hint?.tokenIds).toContain("input-border-active");
  });

  it("does not flag input-border-focus (real pseudo-class state)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-focus", layer: "component", type: "color", source: "global", base: "#6F82C2" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
  });

  it("still flags input-border-error as a validation colour, not state-via-prop", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "validation-color-via-prop")).toBeDefined();
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — no `state-via-prop` issue emitted (the validation-colour test already passes).

- [ ] **Step 3: Import the helper**

`src/scanner.ts` line 21 — add `propDrivenStateFor`:

```typescript
import { KNOWN_VARIANT_NAMES, RING_FRAMED_VARIANTS, propDrivenStateFor } from "./component-vocab.js";
```

- [ ] **Step 4: Add the id helper**

In `src/scanner.ts`, after `isValidationColorBorder` (~line 54), add:

```typescript
/** {state, prop} when the token's trailing state is prop-driven for its component, else null. */
function propDrivenStateForId(id: string): { state: string; prop: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  const last = segs[segs.length - 1]!;
  const prop = propDrivenStateFor(component, last);
  return prop === null ? null : { state: last, prop };
}
```

- [ ] **Step 5: Add the hint to the `mapping === null` branch**

In `scanGraph`, the `if (mapping === null) { … }` block currently contains an `if (node.type === "color" && isValidationColorBorder(node.id)) { … }` then `continue;`. Wrap that existing `if` with an `else` carrying the new hint, so the block reads:

```typescript
    if (mapping === null) {
      if (node.type === "color" && isValidationColorBorder(node.id)) {
        issues.push({
          id: `vc-${node.id}`,
          category: "classification-hint",
          severity: "warning",
          kind: "validation-color-via-prop",
          message:
            `\`${node.id}\` is a validation color. Nuxt UI applies validation colors (error / success / warning / info) ` +
            `through the component's \`color\` prop (e.g. \`color="error"\`, or a ` +
            `\`UFormField\` on validation), not a recipe slot — it lives in the color ` +
            `layer, so no \`ui.${prefix}\` override is emitted.`,
          tokenIds: [node.id],
          componentName: prefix,
        });
      } else {
        const pd = propDrivenStateForId(node.id);
        if (pd !== null) {
          issues.push({
            id: `pd-${node.id}`,
            category: "classification-hint",
            severity: "warning",
            kind: "state-via-prop",
            message:
              `\`${node.id}\` targets the \`${pd.state}\` state, which Nuxt UI v4 applies via ` +
              `the \`${pd.prop}\` prop (set programmatically), not a recipe slot — ` +
              `\`${prefix}\` has no \`:${pd.state}\` pseudo-class state, so no \`ui.${prefix}\` ` +
              `override is emitted.`,
            tokenIds: [node.id],
            componentName: prefix,
          });
        }
      }
      continue;
    }
```

(Only the `else { … }` block is new; the validation `if` body is unchanged. Do not duplicate the existing validation hint — keep its exact text.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — `state-via-prop` for active; none for focus; validation-colour still fires for error.

- [ ] **Step 7: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): state-via-prop hint for prop-driven states (input active → highlight)"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Against the new export (transient swap, restore after — same procedure as D2e using `assets/tokens-20260605-123353.zip`): `npm run build:tokens`; confirm `ui.input` carries **no** `active:ring-[…]`, and the CLI scan summary lists a `state-via-prop` hint for `input-border-active`. Restore: `git checkout components/ && npm run build:tokens`.
- [ ] Headless (optional): load the new export, open the scan pane → `input` group shows the `active` deviation warning; the input preview has no `:active` ring.
- [ ] Dispatch a final whole-branch code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** table+helper (Task 1), drop (Task 2), warning hint (Task 3) — all spec criteria mapped.
- **Per-component & disjoint:** `propDrivenStateFor("button","active")` is null (button active preserved); validation roles (error/…) and prop-driven states (active) are disjoint, and the scanner uses `else if` so no double-fire.
- **D3 untouched:** the validation `if` body is copied verbatim; only an `else` branch is added.
- **Type consistency:** `propDrivenStateFor` signature identical across vocab/slot-mapping/scanner; `propDrivenStateForId` is scanner-local.
- **No placeholders:** every code step has full code + exact command + expected result.

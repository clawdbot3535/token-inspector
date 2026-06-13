# Trailing Color-Role on the General Path (Bucket C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map component tokens whose Nuxt color-role sits in the trailing position (`checkbox-bg-error`, `switch-thumb-color-success`, `checkbox-bg-checked-error`) on the general (non-custom) path, by promoting the existing `normalizeTrailingColorRole` into the grammar and retiring the now-unreachable `validation-color-via-prop` scanner rule.

**Architecture:** `normalizeTrailingColorRole` moves from `src/custom-recipe-engine.ts` into `@tg/grammar` and runs once at the entry of `heuristicSlotMapping`, so the renderer, scanner, and custom path all map these tokens identically. The emit is automatic (no renderer change). Because the change flips existing "dropped" assertions in two `src/` test files, **the whole change is one atomic commit** (the pre-commit hook runs the full suite — there is no green intermediate split).

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` import suffix). `noUncheckedIndexedAccess` + `noUnusedLocals` ON. Pre-commit hook runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-13-trailing-color-role-general-path-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/slot-mapping.ts` — add `normalizeTrailingColorRole` (moved in); call it at the `heuristicSlotMapping` entry; shape docstring. (`COLOR_ROLE_KEYS` already imported.)
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — trailing-color-role integration + regression/negative cases.
- **Modify** `src/custom-recipe-engine.ts` — import `normalizeTrailingColorRole` from `@tg/grammar`, drop `COLOR_ROLE_KEYS` from the import, remove the local definition, re-export for the existing test.
- **Modify** `src/scanner.ts` — remove the `validation-color-via-prop` rule, `isValidationColorBorder`, and `VALIDATION_COLOR_ROLES`.
- **Modify** `src/scanner.test.ts` — remove the `validation-color-via-prop (D3)` describe block; adapt the one cross-referencing case.
- **Modify** `src/recipe-engine.test.ts` — flip the cycle-B SEED test; regenerate the golden snapshots.

No renderer / build-cli / App.vue change.

---

## Task 1: Promote `normalizeTrailingColorRole` to the grammar + retire the scanner rule

> This is a single atomic commit. The new grammar tests are the TDD RED; implementing the grammar change turns them GREEN but simultaneously turns the old "dropped" assertions in `src/scanner.test.ts` and `src/recipe-engine.test.ts` RED — Steps 5–7 flip those. Commit only after Step 8 (full suite green).

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts` (add function ~above `heuristicSlotMapping` line 407; edit `heuristicSlotMapping` lines 415 + 432; docstring lines ~18-24)
- Test: `packages/grammar/src/slot-mapping.test.ts`
- Modify: `src/custom-recipe-engine.ts` (import line 10; remove def lines ~18-37)
- Modify: `src/scanner.ts` (remove const ~40-42, helper ~44-55, rule branch ~99-113)
- Modify: `src/scanner.test.ts` (remove D3 block ~437-490; adapt case ~586-595)
- Modify: `src/recipe-engine.test.ts` (flip SEED ~806; regenerate snapshots)

- [ ] **Step 1: Write the failing grammar tests**

Append to `packages/grammar/src/slot-mapping.test.ts`:

```ts
describe("normalizeTrailingColorRole", () => {
  it("moves a trailing color-role to the 2nd position", () => {
    expect(normalizeTrailingColorRole("checkbox-bg-error")).toBe("checkbox-error-bg");
  });
  it("keeps a trailing state after the moved color-role", () => {
    expect(normalizeTrailingColorRole("checkbox-bg-checked-error")).toBe("checkbox-error-bg-checked");
  });
  it("is a no-op when the 2nd segment is already a color-role", () => {
    expect(normalizeTrailingColorRole("button-error-bg")).toBe("button-error-bg");
  });
  it("is a no-op when the last segment is not a color-role", () => {
    expect(normalizeTrailingColorRole("button-bg-hover")).toBe("button-bg-hover");
  });
});

describe("heuristicSlotMapping — trailing color-role (general path)", () => {
  it("maps checkbox-bg-error to base + color/error", () => {
    expect(heuristicSlotMapping("checkbox-bg-error", "color")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "color",
      variantKey: "error",
    });
  });

  it("carries a trailing checked state (checkbox-bg-checked-error)", () => {
    expect(heuristicSlotMapping("checkbox-bg-checked-error", "color")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "color",
      variantKey: "error",
      statePrefix: "checked",
    });
  });

  it("routes a sub-element color-role (switch-thumb-color-success)", () => {
    expect(heuristicSlotMapping("switch-thumb-color-success", "color")).toEqual({
      slot: "thumb",
      utilityType: "text-color",
      variantAxis: "color",
      variantKey: "success",
    });
  });

  it("ring-frames a trailing border color-role (checkbox-border-error -> ring)", () => {
    expect(heuristicSlotMapping("checkbox-border-error", "color")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "color",
      variantKey: "error",
    });
  });

  it("keeps border-color on an unframed component (switch-border-error)", () => {
    expect(heuristicSlotMapping("switch-border-error", "color")).toEqual({
      slot: "base",
      utilityType: "border-color",
      variantAxis: "color",
      variantKey: "error",
    });
  });

  it("does not change a 2nd-segment color-role (button-error-bg)", () => {
    expect(heuristicSlotMapping("button-error-bg", "color")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "color",
      variantKey: "error",
    });
  });

  it("stays NULL for a trailing color-role behind an unroutable sub-element (radio-dot-color-error)", () => {
    expect(heuristicSlotMapping("radio-dot-color-error", "color")).toBeNull();
  });
});
```

Also add `normalizeTrailingColorRole` to the import at the top of `packages/grammar/src/slot-mapping.test.ts`:

```ts
import { heuristicSlotMapping, getSlotMapping, normalizeTrailingColorRole } from "./slot-mapping.js";
```

- [ ] **Step 2: Run the grammar tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: the `heuristicSlotMapping — trailing color-role` cases FAIL (currently NULL / unmapped); the `normalizeTrailingColorRole` cases FAIL to import (`normalizeTrailingColorRole is not exported`). `button-error-bg` and `radio-dot-color-error` already pass.

- [ ] **Step 3: Add `normalizeTrailingColorRole` to the grammar and apply it in `heuristicSlotMapping`**

In `packages/grammar/src/slot-mapping.ts`, add the function immediately ABOVE `export function heuristicSlotMapping(`:

```ts
/**
 * The grammar recognises a color-role only at the 2nd segment
 * (`button-error-bg`). Figma also names them trailing (`checkbox-bg-error`).
 * Move a trailing color-role to the 2nd position so the existing grammar maps
 * it to `variants.color`. A trailing STATE/SIZE word is left in place after the
 * moved role (the grammar handles those as suffixes). No-op when the 2nd
 * segment is already a color-role or the id is too short.
 */
export function normalizeTrailingColorRole(tokenId: string): string {
  const parts = tokenId.split("-");
  if (parts.length < 3) return tokenId;
  const last = parts[parts.length - 1];
  const second = parts[1];
  if (last === undefined || second === undefined) return tokenId;
  if (!COLOR_ROLE_KEYS.has(last)) return tokenId; // trailing state/size/prop — leave it
  if (COLOR_ROLE_KEYS.has(second)) return tokenId; // already 2nd-segment color-role
  const component = parts[0];
  const middle = parts.slice(1, parts.length - 1); // property/sub-element/state segments
  return [component, last, ...middle].join("-");
}
```

Then, in `heuristicSlotMapping`, change the body's first lines. Replace:

```ts
  const parsed = parseSegments(tokenId);
  if (!parsed) return null;
```

with:

```ts
  // A color-role may be named trailing (`checkbox-bg-error`); normalise it to
  // the 2nd position once so both passes below classify it as a color variant.
  const id = normalizeTrailingColorRole(tokenId);
  const parsed = parseSegments(id);
  if (!parsed) return null;
```

And replace the fallback-pass line:

```ts
    const routed = parseSegments(tokenId, slots);
```

with:

```ts
    const routed = parseSegments(id, slots);
```

- [ ] **Step 4: Run the grammar tests to verify they pass**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS (all new cases green; existing grammar cases unchanged).

- [ ] **Step 5: Point `custom-recipe-engine.ts` at the grammar function**

In `src/custom-recipe-engine.ts`, change the import on line 10. Replace:

```ts
import { COLOR_ROLE_KEYS, getSlotMapping, nuxtSlotsFor, type SlotMappingOverride } from "@tg/grammar";
```

with:

```ts
import { getSlotMapping, normalizeTrailingColorRole, nuxtSlotsFor, type SlotMappingOverride } from "@tg/grammar";

export { normalizeTrailingColorRole }; // re-exported for src/custom-recipe-engine.test.ts
```

Then DELETE the local definition — the JSDoc block and function spanning the lines:

```ts
/**
 * The grammar recognizes a color-role only as the 2nd segment
 * (`button-error-bg`). Figma also names them trailing (`chip-bg-error`).
 * ...
 */
export function normalizeTrailingColorRole(tokenId: string): string {
  ...
  return [component, last, ...middle].join("-");
}
```

(The call at `buildCustomRecipes` — `const normId = normalizeTrailingColorRole(node.id);` — now resolves to the imported grammar function. It stays; normalisation is idempotent.)

- [ ] **Step 6: Remove the now-unreachable `validation-color-via-prop` scanner rule**

In `src/scanner.ts`, DELETE the constant:

```ts
const VALIDATION_COLOR_ROLES: ReadonlySet<string> = new Set([
  "error", "success", "warning", "info",
]);
```

DELETE the helper (its JSDoc + body):

```ts
/**
 * True for the dropped `<comp>-border-<error|success|warning|info>` token form —
 * a validation color Nuxt applies via the `color` prop, not a recipe slot.
 * Excludes `badge-error-border` (`…, error, border`) and `input-border` (no role).
 */
function isValidationColorBorder(id: string): boolean {
  ...
}
```

Then, in the `if (mapping === null) {` block, un-nest the `else` branch. Replace:

```ts
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
      const nseg = node.id.split("-")[1];
```

with:

```ts
    if (mapping === null) {
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
      const nseg = node.id.split("-")[1];
```

- [ ] **Step 7: Flip the obsolete `src/` tests**

(a) In `src/scanner.test.ts`, DELETE the entire describe block:

```ts
describe("scanGraph — validation-color-via-prop (D3)", () => {
  ... // all cases through the closing
});
```

(b) In `src/scanner.test.ts`, the case titled `"still flags input-border-error as a validation colour, not state-via-prop"` (inside the state-via-prop describe). REPLACE it:

```ts
  it("still flags input-border-error as a validation colour, not state-via-prop", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "validation-color-via-prop")).toBeDefined();
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
  });
```

with:

```ts
  it("maps input-border-error now (no state-via-prop, no validation warning)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
    expect(report.issues.find((i) => i.kind === "validation-color-via-prop")).toBeUndefined();
  });
```

(c) In `src/recipe-engine.test.ts`, REPLACE the SEED test in full (the immediately-following `"SEED for cycle B: emits a \`solid\` variant…"` test is about a different axis and stays unchanged):

```ts
  it("SEED for cycle B: input-border-error/success are silently dropped (no color axis)", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    expect(recipes["input"]?.variants.color).toBeUndefined();
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).not.toContain("#EF4444");
    expect(base).not.toContain("#22C55E");
  });
```

with:

```ts
  it("maps input-border-error/success onto the color axis (ring-framed)", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    expect(recipes["input"]?.variants.color?.error?.base).toContain("ring-[#EF4444]");
    expect(recipes["input"]?.variants.color?.success?.base).toContain("ring-[#22C55E]");
    // the validation colours live on the color axis, not on the resting base slot
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).not.toContain("#EF4444");
    expect(base).not.toContain("#22C55E");
  });
```

- [ ] **Step 8: Regenerate the golden snapshots and run the full suite**

Run: `npx vitest run -u src/recipe-engine.test.ts`
This updates the two `toMatchSnapshot()` golden files in `src/recipe-engine.test.ts` (the `ui.input` recipe and the broader recipes snapshot) to include the new `variants.color.{error,success}` blocks.

Then inspect the snapshot diff:
Run: `git --no-pager diff src/recipe-engine.test.ts src/__snapshots__/ 2>/dev/null; git --no-pager diff -- '*.snap'`
Expected: the ONLY changes are added `variants.color.error` / `variants.color.success` entries (and any error/success classes moving OUT of resting slots into the color axis) on the affected components. If anything else changed, stop and investigate.

Then run the full suite:
Run: `npm test`
Expected: PASS — all files green (≈ 625+ tests). No type errors.

- [ ] **Step 9: Update the shape docstring**

In `packages/grammar/src/slot-mapping.ts`, extend the token-id shape comment near the top (the block updated in v0.14.0). After the existing sub-element / variant lines, add:

```
//   A <color-role> (error/success/…) may also be named trailing
//   (`checkbox-bg-error`); it is normalised to the 2nd position before parsing.
```

- [ ] **Step 10: Commit (single atomic commit)**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts \
        src/custom-recipe-engine.ts src/scanner.ts src/scanner.test.ts src/recipe-engine.test.ts
git add -A  # include regenerated *.snap files
git commit -m "feat(grammar): map trailing color-roles on the general path; retire validation-color-via-prop"
```

Expected: pre-commit hook (vue-tsc + full vitest) passes.

---

## Task 2: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the production build**

Run: `npm run build`
Expected: build succeeds (`vue-tsc -b` + `vite build`) — confirms the moved import resolves through `@tg/grammar` for the web bundle and `COLOR_ROLE_KEYS` is no longer an unused import in `custom-recipe-engine.ts`.

- [ ] **Step 2: Confirm the CLI digest change on the local fixture (INTENTIONAL)**

Run: `npm run build:tokens`
Expected: exit 0. UNLIKE Bucket B, the digest CHANGES on the committed `components/` fixture: the `[validation-color-via-prop]` warnings for `input-border-error/success`, `checkbox-border-*`, `radio-border-*`, `switch-border-*` (and `chip-*`) DISAPPEAR, and `output/nuxt/app.config.ts` gains `variants.color.{error,success}` blocks for input/checkbox/radio/switch. Confirm there are no NEW `error`-severity issues (exit stays 0).

- [ ] **Step 3 (optional): Real-export spot-check via git-import**

The full set of trailing-color-role shapes (`checkbox-bg-error`, `switch-thumb-color-success`, the `-checked-` states) lives only in the 914-token export. Optional: import `github.com/clawdbot3535/design-token-export` through the inspector's git-import and confirm `ui.checkbox` / `ui.switch` / `ui.radio` now carry `variants.color.{error,success}` (and `radio-dot-color-*` remains the documented straggler). Not required for completion — the unit tests are authoritative.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 (move `normalizeTrailingColorRole` to grammar) → Task 1 Steps 3, 5. ✓
- Part 2 (apply at `heuristicSlotMapping` entry, both passes) → Task 1 Step 3. ✓
- Part 3 (retire `validation-color-via-prop` rule + helper + const) → Task 1 Step 6. ✓
- Success criteria (bg / bg-checked / thumb-color / border ring-vs-border / button-error-bg regression / radio-dot-color NULL) → Task 1 Step 1 grammar tests. ✓
- Scanner test removal + cross-ref adapt → Task 1 Step 7 (a)(b). ✓
- recipe-engine SEED flip + golden snapshot regen → Task 1 Step 7(c), Step 8. ✓
- Docstring → Task 1 Step 9. ✓
- Visible fixture impact (digest + snapshot) → Task 2 Step 2; Task 1 Step 8 snapshot diff review. ✓
- Atomic-commit rationale (pre-commit runs full suite) → Task 1 preamble. ✓

**Placeholder scan:** none — every code/test step shows the full content. Step 7's "preserve the closing lines" note is an instruction to re-confirm, not a placeholder.

**Type consistency:** `normalizeTrailingColorRole(tokenId: string): string` identical to the original. The grammar tests use `SlotMappingEntry` field names (`slot`/`utilityType`/`variantAxis`/`variantKey`/`statePrefix`). `recipes["input"].variants.color?.error?.base` mirrors the existing `?.solid?.base` access pattern. The scanner edit keeps `propDrivenStateForId`, `state-via-prop`, and the `nseg` accounting intact — only the validation branch and its helper/const are removed.

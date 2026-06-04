# D3 — `validation-color-via-prop` detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scanner detector that surfaces the dropped `<comp>-border-<validation-role>` tokens (e.g. `input-border-error`) as a `warning` explaining they are applied via Nuxt's `color` prop — instead of swallowing them silently.

**Architecture:** A local predicate + an `issues.push` at the existing `mapping === null` branch of the scanner's main component loop. No recipe/engine/schema/UI change; the Scan View renders issues by category/kind/severity already. Severity `warning`, category `classification-hint` — matching the existing `single-mode-semantic` issue.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-d3-validation-color-detector-design.md`

**Branch:** `fix/d3-validation-color`. Commit per task. Do not push.

---

## File Structure

- `src/scanner.ts` — **modify**: add `VALIDATION_COLOR_ROLES` + `isValidationColorBorder` (module-local) and the detector at the `mapping === null` branch (~line 65).
- `src/scanner.test.ts` — **modify**: tests for the warning + negatives.
- `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` — **modify** (Task 2): mark D3 fixed.
- `CHANGELOG.md` — **modify** (Task 2).

Reference (`scanner.test.ts` conventions): `makeNode({ id, layer, type, source, base?, light?, dark? })` builds a `TokenNode`; `makeGraph(nodes)` builds a `TokenGraph`; `scanGraph(graph, { components })` returns a `ScanReport` with `.issues`. `ScanOptions = { components, remBase? }`.

---

## Task 1: The detector + tests

**Files:** `src/scanner.ts`, `src/scanner.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scanner.test.ts`:

```typescript
describe("scanGraph — validation-color-via-prop (D3)", () => {
  it("warns for a dropped <comp>-border-<validation-role> token", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#EF4444" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(1);
    expect(vc[0]).toMatchObject({
      severity: "warning",
      category: "classification-hint",
      tokenIds: ["input-border-error"],
      componentName: "input",
    });
  });

  it("also warns for a -border-success token", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-success", layer: "component", type: "color", source: "global", base: "#22C55E" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(1);
  });

  it("does NOT warn for a non-validation dropped token", () => {
    const graph = makeGraph([
      makeNode({ id: "input-mystery-token", layer: "component", type: "color", source: "global", base: "#000000" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(0);
  });

  it("does NOT warn for tokens that map (input-border, badge-error-border)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border", layer: "component", type: "color", source: "global", base: "#D4D4D8" }),
      makeNode({ id: "badge-error-border", layer: "component", type: "color", source: "global", base: "#FCA5A5" }),
    ]);
    const vc = scanGraph(graph, { components: ["input", "badge"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — the first two tests expect one `validation-color-via-prop` issue, but none is emitted yet (filter returns 0). The two negative tests already pass (0 matches).

- [ ] **Step 3: Add the predicate to `src/scanner.ts`**

Near the top of `src/scanner.ts` (module scope, e.g. just above `export function scanGraph`), add:

```typescript
const VALIDATION_COLOR_ROLES: ReadonlySet<string> = new Set([
  "error", "success", "warning", "info",
]);

/**
 * True for the dropped `<comp>-border-<error|success|warning|info>` token form —
 * a validation color Nuxt applies via the `color` prop, not a recipe slot.
 * Excludes `badge-error-border` (`…, error, border`) and `input-border` (no role).
 */
function isValidationColorBorder(id: string): boolean {
  const segs = id.split("-");
  const last = segs[segs.length - 1];
  const beforeLast = segs[segs.length - 2];
  return beforeLast === "border" && last !== undefined && VALIDATION_COLOR_ROLES.has(last);
}
```

- [ ] **Step 4: Emit the warning at the `mapping === null` branch**

In `scanGraph`'s main component loop, find:

```typescript
    const mapping = getSlotMapping(node.id, undefined, node.type);
    if (mapping === null) continue;
```

Replace with:

```typescript
    const mapping = getSlotMapping(node.id, undefined, node.type);
    if (mapping === null) {
      if (isValidationColorBorder(node.id)) {
        issues.push({
          id: `vc-${node.id}`,
          category: "classification-hint",
          severity: "warning",
          kind: "validation-color-via-prop",
          message:
            `\`${node.id}\` is a validation color. Nuxt UI applies error/success ` +
            `through the component's \`color\` prop (e.g. \`color="error"\`, or a ` +
            `\`UFormField\` on validation), not a recipe slot — it lives in the color ` +
            `layer, so no \`ui.${prefix}\` override is emitted.`,
          tokenIds: [node.id],
          componentName: prefix,
        });
      }
      continue;
    }
```

(`prefix` and `issues` are already in scope in that loop. Confirm the existing
`issues` array name by reading the surrounding code — adjust if it differs.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS (4 new tests + all existing scanner tests).

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass. No recipe/snapshot change (the detector only adds scan issues; `getSlotMapping` still returns null for these tokens, so the recipe output is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): warn that validation-color border tokens are applied via the color prop"
```

A pre-commit hook runs typecheck + the full suite; if it blocks, fix legitimately.

---

## Task 2: Verify against real export + docs

**Files:** `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, `CHANGELOG.md`

- [ ] **Step 1: Verify the real export**

Run: `npx tsx scripts/build-cli.ts 2>&1 | grep -i "validation-color\|via the component" | head`
(Or run `npx tsx scripts/build-cli.ts` and look at the printed `warnings` list.)
Expected: the scan now reports `validation-color-via-prop` warnings for the real
`input-border-error`/`-success` (and the other affected components). Confirm the emitted
`output/nuxt/app.config.ts` `input` block is UNCHANGED vs before (these tokens still
produce no recipe output). `output/` is gitignored — do not stage it. Paste a sample
warning line in your report. If no such warning appears, stop and report
DONE_WITH_CONCERNS.

- [ ] **Step 2: Mark D3 fixed in the seeds doc**

In `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, find the
`## D3 — Validation color` section. Append at the end of that section (the file's last
section):

```markdown

**FIXED 2026-06-04 (detector only):** the dropped `<comp>-border-<error|success>` tokens
(`input`, `textarea`, `checkbox`, `radio`, `chip`, `switch`) now produce a
`validation-color-via-prop` scan warning explaining they are applied via Nuxt's `color`
prop — no longer silently swallowed. The `compoundVariants` emit path was deliberately not
built (these tokens alias shared semantic colors; no per-component override is needed). See
`docs/superpowers/specs/2026-06-04-d3-validation-color-detector-design.md`.
```

- [ ] **Step 3: CHANGELOG**

In `CHANGELOG.md` under `## [Unreleased]`, add to the `### Added` subsection (create it if
it does not already exist, before `### Fixed`):

```markdown
- **Scan warning for validation-color tokens.** `<comp>-border-<error|success>` tokens
  (e.g. `input-border-error`) no longer vanish silently. The scanner now emits a
  `validation-color-via-prop` warning explaining Nuxt UI applies error/success through the
  component's `color` prop (or a `UFormField`), so the token needs no recipe override — it
  lives in the color layer.
```

- [ ] **Step 4: Final verification**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 5: Commit (do NOT push)**

```bash
git add docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md CHANGELOG.md
git commit -m "docs: mark D3 fixed (validation-color detector), changelog"
```

Stop and report. Do not push.

---

## Self-Review

**Spec coverage:**
- "detector at the mapping === null branch" → Task 1 Step 4. ✓
- "predicate `isValidationColorBorder`, local to scanner.ts" → Task 1 Step 3. ✓
- "warning + classification-hint + kind validation-color-via-prop + tokenIds + componentName" → Task 1 Step 4 push + Step 1 assertions. ✓
- success criteria (input-border-error/-success warn; mystery/mapped do not) → Task 1 Step 1 tests. ✓
- "no recipe/schema/UI change" → Task 1 Step 6 note (recipe unchanged). ✓
- "real export verification, app.config unchanged" → Task 2 Step 1. ✓
- "seeds D3 mark + CHANGELOG" → Task 2 Steps 2-3. ✓
- out of scope (compoundVariants, D2c) → not touched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. The one "confirm the `issues` array name" note in Step 4 is a guard against a naming mismatch, with the existing-code reference — not a placeholder.

**Type consistency:** the pushed object matches `ScanIssue` (`id`, `category`, `severity`, `kind`, `message`, `tokenIds`, `componentName`). `severity: "warning"` and `category: "classification-hint"` are valid `ScanSeverity`/`ScanCategory` values. `kind` is a free string. `isValidationColorBorder(id: string): boolean` is self-contained. No signature changes; `scanGraph` keeps the same interface.

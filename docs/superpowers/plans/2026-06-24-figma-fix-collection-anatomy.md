# Figma-Fix v2: `collection-anatomy-mismatch` routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the `collection-anatomy-mismatch` scan deviation to the Figma-Fix owner so it gets the 🎨 badge and the Figma-Fix owner-filter bucket (instead of falling into "Other").

**Architecture:** Owner routing is set-driven: `ownerOf` first-matches an issue's `kind` over five disjoint kind-sets, the 🎨 badge is registry-driven off `ownerOf` (v0.55.1), and the owner filter buckets by `ownerOf` (v0.55.0). So the entire behavioral change is adding one string to `FIGMA_FIX_KINDS`. The work is TDD: flip the two existing guard tests that pin this kind as out-of-scope, add an explicit `ownerOf` routing assertion, then make them green with the set entry, plus two stale-comment corrections in the same module.

**Tech Stack:** TypeScript, Vitest. No Vue/UI change.

---

## File Structure

- **Modify** `src/app/resolve/figma-fix.ts` — add `"collection-anatomy-mismatch"` to `FIGMA_FIX_KINDS`; broaden the `isFigmaFix` JSDoc; extend the emit-site line-number comment. Single responsibility: the Figma-Fix owner's kind-set + predicate.
- **Modify** `src/app/resolve/figma-fix.test.ts` — move `collection-anatomy-mismatch` from the false/out-of-scope assertion to a true assertion; grow the "exactly five" set assertion to six.
- **Modify** `src/app/resolve/owner-of.test.ts` — add a pinned `ownerOf(collection-anatomy-mismatch) === "figma-fix"` assertion.

There is exactly one behavioral change across these files, so it is one task with TDD steps.

---

## Task 1: Route `collection-anatomy-mismatch` to the Figma-Fix owner

**Files:**
- Modify: `src/app/resolve/figma-fix.ts`
- Test: `src/app/resolve/figma-fix.test.ts`
- Test: `src/app/resolve/owner-of.test.ts`

### Context the implementer needs

The owner classifier `src/app/resolve/figma-fix.ts` currently is:

```ts
import { makeOwnerPredicate } from "./owners.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607). ScanIssue.kind is typed
// `string` (open for extension), so a scanner-side kind rename will NOT surface as a
// compile error here — keep this set aligned on any rename. (Same caveat as
// BY_DESIGN_KINDS in src/app/resolve/by-design.ts.)
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
]);

/**
 * True when an issue's fix lives in the Figma token source — the coverage of the
 * design token set is incomplete or inconsistent, and the designer must add or align
 * tokens in Figma. Advisory: there is no in-app override.
 */
export const isFigmaFix = makeOwnerPredicate(FIGMA_FIX_KINDS);
```

`collection-anatomy-mismatch` is emitted at `src/scanner.ts:435` (severity `warning`, `tokenIds: []`, carries `componentName`); its message already says "consider moving it to `components/custom`". It is in no other owner's kind-set, so adding it to `FIGMA_FIX_KINDS` keeps the five sets disjoint.

- [ ] **Step 1: Flip the figma-fix.test.ts guard assertions (RED)**

In `src/app/resolve/figma-fix.test.ts`:

1. Add a `collection-anatomy-mismatch` line to the "is true for the coverage-gap kinds" test. Change that test's body from:

```ts
  it("is true for the coverage-gap kinds", () => {
    expect(isFigmaFix(issue("asymmetric-variant-coverage"))).toBe(true);
    expect(isFigmaFix(issue("asymmetric-size-coverage"))).toBe(true);
    expect(isFigmaFix(issue("incomplete-size-variant"))).toBe(true);
    expect(isFigmaFix(issue("non-suffix-vs-size-conflict"))).toBe(true);
    expect(isFigmaFix(issue("orphaned-size-key"))).toBe(true);
  });
```

to (rename title — the set is no longer only coverage-gap kinds — and add the new line):

```ts
  it("is true for the Figma-Fix kinds (coverage-gap + collection-anatomy-mismatch)", () => {
    expect(isFigmaFix(issue("asymmetric-variant-coverage"))).toBe(true);
    expect(isFigmaFix(issue("asymmetric-size-coverage"))).toBe(true);
    expect(isFigmaFix(issue("incomplete-size-variant"))).toBe(true);
    expect(isFigmaFix(issue("non-suffix-vs-size-conflict"))).toBe(true);
    expect(isFigmaFix(issue("orphaned-size-key"))).toBe(true);
    expect(isFigmaFix(issue("collection-anatomy-mismatch"))).toBe(true);
  });
```

2. Remove the out-of-scope line from the "is false for other owners' kinds" test. Change:

```ts
  it("is false for other owners' kinds", () => {
    expect(isFigmaFix(issue("capability-gap"))).toBe(false);       // by-design
    expect(isFigmaFix(issue("possible-typo"))).toBe(false);        // Data-Quality
    expect(isFigmaFix(issue("unsupported-part"))).toBe(false);     // Heuristic-Extension
    expect(isFigmaFix(issue("collection-anatomy-mismatch"))).toBe(false); // deliberately out of scope
  });
```

to (drop the last line entirely):

```ts
  it("is false for other owners' kinds", () => {
    expect(isFigmaFix(issue("capability-gap"))).toBe(false);       // by-design
    expect(isFigmaFix(issue("possible-typo"))).toBe(false);        // Data-Quality
    expect(isFigmaFix(issue("unsupported-part"))).toBe(false);     // Heuristic-Extension
  });
```

3. Grow the set-equality assertion from five to six. Change:

```ts
  it("FIGMA_FIX_KINDS holds exactly the five coverage-gap kinds", () => {
    expect([...FIGMA_FIX_KINDS].sort()).toEqual(
      [
        "asymmetric-size-coverage",
        "asymmetric-variant-coverage",
        "incomplete-size-variant",
        "non-suffix-vs-size-conflict",
        "orphaned-size-key",
      ].sort(),
    );
  });
```

to:

```ts
  it("FIGMA_FIX_KINDS holds exactly the six Figma-Fix kinds", () => {
    expect([...FIGMA_FIX_KINDS].sort()).toEqual(
      [
        "asymmetric-size-coverage",
        "asymmetric-variant-coverage",
        "collection-anatomy-mismatch",
        "incomplete-size-variant",
        "non-suffix-vs-size-conflict",
        "orphaned-size-key",
      ].sort(),
    );
  });
```

- [ ] **Step 2: Add the explicit owner-of routing assertion (RED)**

In `src/app/resolve/owner-of.test.ts`, add a `collection-anatomy-mismatch` line to the "maps each owner's kind to that owner" test, right after the existing `asymmetric-variant-coverage` line. Change:

```ts
    expect(ownerOf(issue("asymmetric-variant-coverage"))).toBe("figma-fix");
    expect(ownerOf(issue("custom-without-parts"))).toBe("manual-dev");
```

to:

```ts
    expect(ownerOf(issue("asymmetric-variant-coverage"))).toBe("figma-fix");
    expect(ownerOf(issue("collection-anatomy-mismatch"))).toBe("figma-fix");
    expect(ownerOf(issue("custom-without-parts"))).toBe("manual-dev");
```

- [ ] **Step 3: Run the tests to verify they fail (RED)**

Run: `npx vitest run src/app/resolve/figma-fix.test.ts src/app/resolve/owner-of.test.ts`
Expected: FAIL — the new `isFigmaFix(...collection-anatomy-mismatch...)` expects `true` but gets `false`; the set-equality expects six but gets five; the new `ownerOf(...collection-anatomy-mismatch...)` expects `"figma-fix"` but gets `null`.

- [ ] **Step 4: Add the kind to FIGMA_FIX_KINDS and fix the two stale comments (GREEN)**

In `src/app/resolve/figma-fix.ts`:

1. Add `collection-anatomy-mismatch :435` to the emit-site comment and add the kind to the set, and broaden the JSDoc. The full file becomes:

```ts
import { makeOwnerPredicate } from "./owners.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607,
// collection-anatomy-mismatch :435). ScanIssue.kind is typed `string` (open for
// extension), so a scanner-side kind rename will NOT surface as a compile error here —
// keep this set aligned on any rename. (Same caveat as BY_DESIGN_KINDS in
// src/app/resolve/by-design.ts.)
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
  "collection-anatomy-mismatch",
]);

/**
 * True when an issue's fix lives in the Figma token source — either the coverage of the
 * design token set is incomplete or inconsistent (the designer must add or align tokens),
 * or a component is filed in the wrong Figma collection (it should move to
 * `components/custom`). Advisory: there is no in-app override.
 */
export const isFigmaFix = makeOwnerPredicate(FIGMA_FIX_KINDS);
```

- [ ] **Step 5: Run the tests to verify they pass (GREEN)**

Run: `npx vitest run src/app/resolve/figma-fix.test.ts src/app/resolve/owner-of.test.ts`
Expected: PASS — both files green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: all green. The test *count* stays **976** — every new assertion was added inside an existing `it(...)` block (no new `it` cases), so this feature changes assertions, not the case count. Confirm 0 failures.

- [ ] **Step 8: Commit**

```bash
git add src/app/resolve/figma-fix.ts src/app/resolve/figma-fix.test.ts src/app/resolve/owner-of.test.ts
git commit -m "feat(resolve): route collection-anatomy-mismatch to the Figma-Fix owner"
```

The pre-commit hook runs vue-tsc + the full vitest suite. If it dies after ~13s with NO test failures listed, that is the known transient flake — re-run the exact same `git commit` (up to 2-3 times). Do NOT use `--no-verify`. Do NOT change other files to "fix" a flake.

---

## Notes for the implementer

- Touch ONLY the three files above. No ScanView.vue, owner-of.ts, scanner.ts, owner-badges.ts, or type change — routing is entirely set-driven, so the badge and owner-filter follow automatically from `ownerOf`.
- The `.js` extensions in the imports are correct (NodeNext ESM from `.ts`); ignore any editor "Cannot find module" false positives.
- Do NOT add a copy button or change the issue message — explicitly out of scope (the deviation has no token list and a single-action fix already stated in its message).

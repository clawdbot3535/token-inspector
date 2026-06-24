# Badge-from-Registry Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse ScanView's three near-duplicate static owner-badge `<span>`s (by-design / figma-fix / manual-dev) into one registry-driven badge, and re-gate the typo hint off `ownerOf` — a behaviour-preserving refactor enabled by the v0.55.0 `ownerOf` aggregator.

**Architecture:** A new view-layer `src/app/owner-badges.ts` holds an `OWNER_BADGES` registry (per-owner Tailwind classes / title / glyph+label) + an `ownerBadge(owner)` lookup. `ScanView.vue` renders one badge via `ownerBadge(ownerOf(issue))` and changes the typo gate to `ownerOf(issue) === 'data-quality'`. The existing badge + typo tests (unchanged) are the regression guard.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-24-badge-from-registry-design.md`

---

## File Structure

- **Create** `src/app/owner-badges.ts` — `OwnerBadge` type, `OWNER_BADGES` registry (3 entries), `ownerBadge(owner)` lookup.
- **Create** `src/app/owner-badges.test.ts` — registry unit tests.
- **Modify** `src/app/components/ScanView.vue` — drop the 3 `is*` imports, add the `ownerBadge` import, collapse the 3 badge spans into 1, re-gate the typo hint.

The per-owner predicate modules (`by-design.ts`, `figma-fix.ts`, `manual-dev.ts`) are NOT changed — their `is*` predicates stay exported and unit-tested; only ScanView stops importing them.

---

## Task 1: Owner-badge registry

**Files:**
- Create: `src/app/owner-badges.ts`, `src/app/owner-badges.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/owner-badges.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ownerBadge, OWNER_BADGES } from "./owner-badges.js";

describe("ownerBadge", () => {
  it("returns the badge for each of the three static-badge owners", () => {
    expect(ownerBadge("by-design")?.label).toBe("⊘ by-design");
    expect(ownerBadge("by-design")?.cls).toContain("bg-zinc-100");
    expect(ownerBadge("figma-fix")?.label).toBe("🎨 fix in Figma");
    expect(ownerBadge("figma-fix")?.cls).toContain("bg-violet-100");
    expect(ownerBadge("manual-dev")?.label).toBe("🔧 hand-code");
    expect(ownerBadge("manual-dev")?.cls).toContain("bg-teal-100");
  });

  it("returns undefined for owners without a static badge and for null", () => {
    expect(ownerBadge("heuristic")).toBeUndefined();
    expect(ownerBadge("data-quality")).toBeUndefined();
    expect(ownerBadge(null)).toBeUndefined();
  });

  it("every registry badge has a non-empty title", () => {
    for (const b of Object.values(OWNER_BADGES)) {
      expect(b.title.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/owner-badges.test.ts`
Expected: FAIL — cannot resolve module `./owner-badges.js`.

- [ ] **Step 3: Create the registry**

Create `src/app/owner-badges.ts`:

```ts
import type { Owner } from "./resolve/owner-of.js";

export interface OwnerBadge {
  /** Tailwind classes for the muted pill (light + dark). */
  cls: string;
  /** Hover / screen-reader tooltip. */
  title: string;
  /** Visible glyph + label text. */
  label: string;
}

// Only three of the five (Y) owners have a static badge. `heuristic` uses the
// interactive "Resolve →" button and `data-quality` the interactive typo hint, so
// neither has an entry here. This map intentionally holds presentation (Tailwind +
// glyphs) — that is why it lives in the view layer, not in owner-of.ts.
export const OWNER_BADGES: Partial<Record<Owner, OwnerBadge>> = {
  "by-design": {
    cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    title: "Nuxt UI constraint — expected; no fix needed",
    label: "⊘ by-design",
  },
  "figma-fix": {
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    title: "Fix in the Figma token source — add or align the missing/inconsistent tokens",
    label: "🎨 fix in Figma",
  },
  "manual-dev": {
    cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    title:
      "Resolvable only by hand-coding in your Nuxt app (a custom recipe or a CSS override against Nuxt's default)",
    label: "🔧 hand-code",
  },
};

/** The static badge for an owner, or undefined (heuristic / data-quality / no owner). */
export function ownerBadge(owner: Owner | null): OwnerBadge | undefined {
  return owner ? OWNER_BADGES[owner] : undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/owner-badges.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/owner-badges.ts src/app/owner-badges.test.ts
git commit -m "feat(resolve): owner-badge registry (OWNER_BADGES + ownerBadge)"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — just re-run the commit if it dies early.)

---

## Task 2: ScanView single registry-driven badge + typo re-gate

**Files:**
- Modify: `src/app/components/ScanView.vue`

This task changes no test files. Its regression guard is the EXISTING, UNCHANGED
`ScanView.bydesign.test.ts`, `ScanView.figmafix.test.ts`, `ScanView.manualdev.test.ts`,
and `ScanView.typo.test.ts` — they must stay green.

- [ ] **Step 1: Confirm the guard tests pass before the change**

Run: `npx vitest run src/app/components/ScanView.bydesign.test.ts src/app/components/ScanView.figmafix.test.ts src/app/components/ScanView.manualdev.test.ts src/app/components/ScanView.typo.test.ts`
Expected: PASS (these are the behaviour baseline you must preserve).

- [ ] **Step 2: Swap the imports**

In `src/app/components/ScanView.vue`, remove these three now-unused import lines:

```ts
import { isByDesign } from "../resolve/by-design.js";
import { isFigmaFix } from "../resolve/figma-fix.js";
import { isManualDev } from "../resolve/manual-dev.js";
```

and add this import directly after the existing `owner-of` import line
(`import { ownerOf, OWNER_FILTERS, type OwnerFilter } from "../resolve/owner-of.js";`):

```ts
import { ownerBadge } from "../owner-badges.js";
```

(`ownerOf` stays imported — it is already used by the owner filter and `ownerCounts`.)

- [ ] **Step 3: Re-gate the typo hint**

In `src/app/components/ScanView.vue`, change the typo-hint span's `v-if`. Replace:

```html
                v-if="issue.kind === 'possible-typo' && issue.typoTo"
```

with:

```html
                v-if="ownerOf(issue) === 'data-quality' && issue.typoTo"
```

(Nothing else in the typo-hint span changes — the `💡 from → to` text and the Copy button stay.)

- [ ] **Step 4: Collapse the three badge spans into one**

In `src/app/components/ScanView.vue`, replace the three consecutive static badge spans:

```html
              <span
                v-if="isByDesign(issue)"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                data-testid="by-design"
                title="Nuxt UI constraint — expected; no fix needed"
              >⊘ by-design</span>
              <span
                v-if="isFigmaFix(issue)"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                data-testid="figma-fix"
                title="Fix in the Figma token source — add or align the missing/inconsistent tokens"
              >🎨 fix in Figma</span>
              <span
                v-if="isManualDev(issue)"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                data-testid="manual-dev"
                title="Resolvable only by hand-coding in your Nuxt app (a custom recipe or a CSS override against Nuxt's default)"
              >🔧 hand-code</span>
```

with this single registry-driven span:

```html
              <span
                v-if="ownerBadge(ownerOf(issue))"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                :class="ownerBadge(ownerOf(issue))!.cls"
                :data-testid="ownerOf(issue)"
                :title="ownerBadge(ownerOf(issue))!.title"
              >{{ ownerBadge(ownerOf(issue))!.label }}</span>
```

- [ ] **Step 5: Run the guard tests to verify they still pass UNCHANGED**

Run: `npx vitest run src/app/components/ScanView.bydesign.test.ts src/app/components/ScanView.figmafix.test.ts src/app/components/ScanView.manualdev.test.ts src/app/components/ScanView.typo.test.ts`
Expected: PASS — all green, with NO edits to those test files. (This proves the refactor is behaviour-preserving: same `data-testid`s, badge text, and typo-hint gating.)

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean (confirms the three `is*` imports were the only ScanView uses and their removal leaves no dangling reference).

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue
git commit -m "refactor(resolve): ScanView renders one registry-driven owner badge; typo gate via ownerOf"
```

---

## Self-Review

**Spec coverage:**
- `OWNER_BADGES` registry (3 owners) + `ownerBadge(owner)` lookup in a view-layer module → Task 1. ✓
- Resolve layer (`owner-of.ts`) untouched; badge presentation in the view layer → Task 1 (new `src/app/owner-badges.ts`, no owner-of.ts change). ✓
- Three badge spans → one registry-driven span → Task 2 Step 4. ✓
- Typo gate → `ownerOf(issue) === 'data-quality'` (kills the `possible-typo` literal in ScanView) → Task 2 Step 3. ✓
- Behaviour-preserving, guarded by unchanged existing tests → Task 2 Steps 1, 5 (run guard tests before and after, no edits). ✓
- Interactive affordances (Resolve / ✓ resolved / typo Copy+from→to) untouched → Task 2 changes only the typo `v-if` and the 3 static badges. ✓
- Non-goals (no visible change, no new owner, no scanner change) → only the 3 files in File Structure are touched; `data-testid`/classes/title/label reproduced exactly. ✓
- The now-unused `is*` imports removed (else vue-tsc fails) → Task 2 Step 2 + Step 6 typecheck. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content, including exact before/after for the import swap, typo gate, and badge collapse. ✓

**Type consistency:** `ownerBadge(owner: Owner | null): OwnerBadge | undefined` and `OWNER_BADGES` defined in Task 1; consumed in Task 1 tests (`ownerBadge("by-design")`, `OWNER_BADGES` values) and in Task 2 (`ownerBadge(ownerOf(issue))` where `ownerOf` returns `Owner | null`). `.cls` / `.title` / `.label` field names match between the registry, the type, and the template bindings. `:data-testid="ownerOf(issue)"` yields the same testid strings (`by-design`/`figma-fix`/`manual-dev`) the guard tests query. ✓

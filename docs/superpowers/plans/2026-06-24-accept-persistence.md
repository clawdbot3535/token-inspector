# by-design accept → localStorage persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the by-design Accept state (`acceptedIds`) to `localStorage` so accepted issues stay cleared from the header count across page reloads.

**Architecture:** A new pure module `src/app/accepted-storage.ts` owns the `localStorage` load/save logic (mirroring App.vue's existing `expandedPaths` pattern, but extracted so it is unit-testable). `App.vue` seeds its `acceptedIds` ref from `loadAcceptedIds()` on mount and calls `saveAcceptedIds(next)` inside the existing `onToggleAccept` handler. No other component changes — ScanView/HeaderStatusStrip already consume the `accepted` prop and are persistence-agnostic.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + jsdom (provides `localStorage`).

---

## File Structure

- **Create** `src/app/accepted-storage.ts` — the persistence module: `ACCEPTED_STORAGE_KEY`, `loadAcceptedIds()`, `saveAcceptedIds(set)`. Single responsibility: serialize/deserialize the accepted-id Set to/from `localStorage` defensively.
- **Create** `src/app/accepted-storage.test.ts` — unit tests for the module (empty-on-missing, round-trip, malformed-JSON→empty, non-array→empty).
- **Modify** `src/app/App.vue:111` — seed `acceptedIds` from `loadAcceptedIds()` instead of `new Set()`; add the import.
- **Modify** `src/app/App.vue:118-123` — append `saveAcceptedIds(next)` to `onToggleAccept`.

---

## Task 1: Persistence module `accepted-storage.ts`

**Files:**
- Create: `src/app/accepted-storage.ts`
- Test: `src/app/accepted-storage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/accepted-storage.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { ACCEPTED_STORAGE_KEY, loadAcceptedIds, saveAcceptedIds } from "./accepted-storage.js";

afterEach(() => {
  localStorage.removeItem(ACCEPTED_STORAGE_KEY);
});

describe("accepted-storage", () => {
  it("returns an empty set when the key is absent", () => {
    expect(loadAcceptedIds()).toEqual(new Set());
  });

  it("round-trips a saved set", () => {
    saveAcceptedIds(new Set(["issue-a", "issue-b"]));
    expect(loadAcceptedIds()).toEqual(new Set(["issue-a", "issue-b"]));
  });

  it("returns an empty set when the stored value is malformed JSON", () => {
    localStorage.setItem(ACCEPTED_STORAGE_KEY, "{not json");
    expect(loadAcceptedIds()).toEqual(new Set());
  });

  it("returns an empty set when the stored value is not an array", () => {
    localStorage.setItem(ACCEPTED_STORAGE_KEY, "5");
    expect(loadAcceptedIds()).toEqual(new Set());
  });

  it("drops non-string entries from a stored array", () => {
    localStorage.setItem(ACCEPTED_STORAGE_KEY, JSON.stringify(["ok", 42, null, "fine"]));
    expect(loadAcceptedIds()).toEqual(new Set(["ok", "fine"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/accepted-storage.test.ts`
Expected: FAIL — `Failed to resolve import "./accepted-storage.js"` (module does not exist yet).

- [ ] **Step 3: Write the module**

Create `src/app/accepted-storage.ts`:

```ts
/**
 * localStorage persistence for the by-design "Accept" state (accepted issue ids).
 *
 * Mirrors App.vue's expandedPaths load/persist logic, extracted as a pure module so it
 * can be unit-tested without an App mount. Defensive: a missing key, malformed JSON, or
 * a non-array payload all degrade to an empty Set rather than throwing.
 */
export const ACCEPTED_STORAGE_KEY = "inspector.accepted";

/** Accepted by-design issue ids persisted from a previous session (empty if none,
 *  localStorage is unavailable, or the stored value is malformed). */
export function loadAcceptedIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACCEPTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((s): s is string => typeof s === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

/** Persist the accepted issue ids as a JSON array. No-op when localStorage is unavailable. */
export function saveAcceptedIds(set: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACCEPTED_STORAGE_KEY, JSON.stringify([...set]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/accepted-storage.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/accepted-storage.ts src/app/accepted-storage.test.ts
git commit -m "feat(resolve): accepted-storage module for by-design accept persistence"
```

(The pre-commit hook runs vue-tsc + the full vitest suite. If it dies in ~13s with no failures listed, that is the known transient flake — just re-run the same `git commit` command.)

---

## Task 2: Wire persistence into App.vue

**Files:**
- Modify: `src/app/App.vue` (import + `acceptedIds` init at line ~111; `onToggleAccept` at lines ~118-123)

- [ ] **Step 1: Add the import**

In the `<script setup>` import block of `src/app/App.vue`, add (next to the other `./...js` app-module imports, e.g. near the resolve imports):

```ts
import { loadAcceptedIds, saveAcceptedIds } from "./accepted-storage.js";
```

- [ ] **Step 2: Seed the ref from storage**

Change the `acceptedIds` declaration (currently `const acceptedIds = ref<Set<string>>(new Set());`) to:

```ts
const acceptedIds = ref<Set<string>>(loadAcceptedIds());
```

- [ ] **Step 3: Persist on toggle**

Change `onToggleAccept` to save after updating the ref. The full function becomes:

```ts
function onToggleAccept(issueId: string): void {
  const next = new Set(acceptedIds.value);
  if (next.has(issueId)) next.delete(issueId);
  else next.add(issueId);
  acceptedIds.value = next;
  saveAcceptedIds(next);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all tests green (971 prior + 5 new from Task 1 = 976), including the existing accept tests in `App.*.test.ts` / `ScanView` / `HeaderStatusStrip` (they set the `accepted` prop directly, so they are unaffected by persistence).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(resolve): persist by-design accept state across reloads"
```

(Same pre-commit-hook note as Task 1: re-run on a ~13s no-failure death.)

---

## Notes for the implementer

- Use `git mv`/exact paths as written — the `.js` extension in the import is correct (this project uses NodeNext-style ESM imports that reference the emitted `.js`, even from `.ts` sources). Editor "Cannot find module './accepted-storage.js'" is a false-positive diagnostic; `vue-tsc` resolves it.
- Do NOT touch the existing `expandedPaths` / `loadExpanded` / `persistExpanded` code — it stays inline (out of scope to refactor).
- Do NOT `provide` `acceptedIds` or change any prop wiring — persistence is purely local to App.vue's ref lifecycle.

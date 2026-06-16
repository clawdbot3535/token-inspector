# Coverage `inherited` Bucket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `inherited` slot classification to the coverage guide — slots that follow a parent slot are covered when the parent is designed, never flagged to-design, and shown in their own section.

**Architecture:** Three layers. (1) Anatomy spec gains `"inherited"` + an `inheritsFrom` parent and re-tags 4 slots. (2) `coverageFor` derives an inherited slot's `touched` from its parent and excludes inherited from `toDesign`. (3) `CoverageView` renders a third "Inherited" section. TDD; the pre-commit gate (vue-tsc + full vitest) is the ripple check.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom), `@tg/grammar`, `@core/coverage.js`.

---

### Task 1: Anatomy — third `inherited` classification

**Files:**
- Modify: `packages/grammar/src/component-anatomy.ts`
- Test: `packages/grammar/src/component-anatomy.test.ts`

- [ ] **Step 1: Write the failing test additions** in `packages/grammar/src/component-anatomy.test.ts`.

Add the expected map near `EXPECTED_STRUCTURAL`:
```ts
// slot → parent it inherits styling from
const EXPECTED_INHERITED: Record<string, Record<string, string>> = {
  nav: { linkLabel: "link", childLinkLabel: "childLink" },
  accordion: { label: "trigger" },
  modal: {},
  table: {},
  dropdown: { itemLabel: "item" },
};
```

Add these `it` blocks inside the `for (const comp …)` describe loop:
```ts
      it("has the locked inherited set with valid parents", () => {
        const anatomy = anatomyFor(comp)!;
        const inherited = [...anatomy.entries()]
          .filter(([, a]) => a.classification === "inherited")
          .map(([slot]) => slot);
        expect(new Set(inherited)).toEqual(new Set(Object.keys(EXPECTED_INHERITED[comp]!)));
        for (const [slot, parent] of Object.entries(EXPECTED_INHERITED[comp]!)) {
          const a = anatomy.get(slot)!;
          expect(a.inheritsFrom).toBe(parent);
          expect(nuxtSlotsFor(comp)!).toContain(parent); // parent is a real slot
        }
      });
```

Replace the existing shape test body (`it("every slot: valid classification + non-empty controls …")`) with:
```ts
      it("every slot: valid classification + non-empty controls (<=60 chars); inherited has a parent", () => {
        for (const [, a] of anatomyFor(comp)!) {
          expect(["structural", "optional", "inherited"]).toContain(a.classification);
          expect(a.controls.length).toBeGreaterThan(0);
          expect(a.controls.length).toBeLessThanOrEqual(60);
          if (a.classification === "inherited") expect(a.inheritsFrom).toBeTruthy();
          else expect(a.inheritsFrom).toBeUndefined();
        }
      });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/grammar/src/component-anatomy.test.ts`
Expected: FAIL — `inheritsFrom` undefined / no `inherited` slots yet.

- [ ] **Step 3: Extend the types + add the `i()` constructor** in `packages/grammar/src/component-anatomy.ts`.

Change the classification union (line 6):
```ts
export type SlotClassification = "structural" | "optional" | "inherited";
```

Add `inheritsFrom` to the `SlotAnatomy` interface (after `controls`):
```ts
  /** Parent slot this one inherits its styling from. Set iff classification === "inherited". */
  inheritsFrom?: string;
```

Add a constructor next to `const s` / `const o`:
```ts
const i = (inheritsFrom: string, controls: string): SlotAnatomy =>
  ({ classification: "inherited", controls, inheritsFrom });
```

- [ ] **Step 4: Re-tag the 4 inherited slots** (match by their exact control strings — leave nav's `label` "section heading…" and dropdown's `label` "group label text" as `o(...)`).

`nav` — replace:
```ts
  ["linkLabel", o("link text wrapper (truncate; inherits from link)")],
```
with:
```ts
  ["linkLabel", i("link", "link text wrapper (truncate; follows link)")],
```
and replace:
```ts
  ["childLinkLabel", o("submenu link label text")],
```
with:
```ts
  ["childLinkLabel", i("childLink", "submenu link label text (follows childLink)")],
```

`accordion` — replace:
```ts
  ["label", o("trigger label text (inherits from trigger)")],
```
with:
```ts
  ["label", i("trigger", "trigger label text (follows trigger)")],
```

`dropdown` — replace:
```ts
  ["itemLabel", o("item label text (inherits from item)")],
```
with:
```ts
  ["itemLabel", i("item", "item label text (follows item)")],
```

- [ ] **Step 5: Run the anatomy suite**

Run: `npx vitest run packages/grammar/src/component-anatomy.test.ts`
Expected: PASS — inherited-set + validity + shape tests green; `EXPECTED_STRUCTURAL` and the "covers exactly its NUXT_SLOTS" test still green (the 4 slots are still keys, only reclassified).

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/component-anatomy.ts packages/grammar/src/component-anatomy.test.ts
git commit -m "feat(grammar): inherited slot classification + inheritsFrom (4 composites)"
```

---

### Task 2: Engine — inherited coverage derives from the parent

**Files:**
- Modify: `src/coverage.ts`
- Test: `src/coverage.test.ts`

- [ ] **Step 1: Write the failing tests** in `src/coverage.test.ts` (inside `describe("coverageFor", …)`):

```ts
it("an inherited slot is touched when its parent is touched, and never in toDesign", () => {
  const cov = coverageFor(graphWith(["nav-link-bg"]), "nav")!; // link designed
  const ll = cov.slots.find((s) => s.slot === "linkLabel")!;
  expect(ll.classification).toBe("inherited");
  expect(ll.inheritsFrom).toBe("link");
  expect(ll.touched).toBe(true); // covered via parent
  expect(cov.toDesign.some((s) => s.slot === "linkLabel")).toBe(false);
});

it("an inherited slot is untouched when neither it nor its parent is touched (still not in toDesign)", () => {
  const cov = coverageFor(graphWith(["nav-item-bg"]), "nav")!; // link NOT designed
  const ll = cov.slots.find((s) => s.slot === "linkLabel")!;
  expect(ll.touched).toBe(false);
  expect(cov.toDesign.some((s) => s.slot === "linkLabel")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/coverage.test.ts -t "inherited slot"`
Expected: FAIL — `inheritsFrom` undefined; `touched` not derived from parent.

- [ ] **Step 3: Add `inheritsFrom` to `SlotCoverage`** in `src/coverage.ts`:
```ts
  tokenIds: readonly string[];
  /** Parent slot, for inherited slots (mirrors the anatomy). */
  inheritsFrom?: string;
```

- [ ] **Step 4: Derive `touched` from the parent + exclude inherited from `toDesign`.**

Replace the `slots` map:
```ts
  const slots: SlotCoverage[] = [...anatomy.entries()].map(([slot, a]) => ({
    slot,
    classification: a.classification,
    controls: a.controls,
    touched: tokensBySlot.has(slot),
    tokenIds: tokensBySlot.get(slot) ?? [],
  }));
```
with:
```ts
  const slots: SlotCoverage[] = [...anatomy.entries()].map(([slot, a]) => ({
    slot,
    classification: a.classification,
    controls: a.controls,
    // an inherited slot follows its parent: covered when the parent (or it) has a token
    touched: tokensBySlot.has(slot) || (a.inheritsFrom != null && tokensBySlot.has(a.inheritsFrom)),
    tokenIds: tokensBySlot.get(slot) ?? [],
    inheritsFrom: a.inheritsFrom,
  }));
```

Replace the `toDesign` line:
```ts
  const toDesign = slots
    .filter((s) => !s.touched)
    .sort((a, b) => rank(a.classification) - rank(b.classification));
```
with:
```ts
  const toDesign = slots
    .filter((s) => !s.touched && s.classification !== "inherited")
    .sort((a, b) => rank(a.classification) - rank(b.classification));
```

(`structuralTotal` / `structuralTouched` are unchanged — they count only `classification === "structural"`.)

- [ ] **Step 5: Run the engine suite**

Run: `npx vitest run src/coverage.test.ts`
Expected: PASS — new inherited tests + all prior coverage tests green.

- [ ] **Step 6: Commit**

```bash
git add src/coverage.ts src/coverage.test.ts
git commit -m "feat(coverage): inherited slots covered-via-parent, excluded from to-design"
```

---

### Task 3: CoverageView — the Inherited section

**Files:**
- Modify: `src/app/components/CoverageView.vue`
- Test: `src/app/components/CoverageView.test.ts`

- [ ] **Step 1: Write the failing tests.** First extend the shared `navCoverage` fixture in `src/app/components/CoverageView.test.ts` — add two inherited slots to its `slots` array (after the existing entries):
```ts
    { slot: "linkLabel", classification: "inherited", controls: "link text wrapper (follows link)", touched: true, tokenIds: [], inheritsFrom: "link" },
    { slot: "childLinkLabel", classification: "inherited", controls: "submenu link label (follows childLink)", touched: false, tokenIds: [], inheritsFrom: "childLink" },
```
Then add the tests:
```ts
it("renders inherited slots in their own section with a parent tag", () => {
  const w = mount(CoverageView, { props: { coverage: navCoverage } });
  const ll = w.find('[data-testid="coverage-slot"][data-slot="linkLabel"]');
  expect(ll.exists()).toBe(true);
  expect(ll.text()).toContain("inherits link");   // names the parent
  expect(ll.text()).toContain("✓");               // parent designed → covered
  const cll = w.find('[data-testid="coverage-slot"][data-slot="childLinkLabel"]');
  expect(cll.text()).toContain("inherits childLink");
  expect(cll.text()).toContain("↳");              // parent not designed → follows
});

it("does not list inherited slots under Optional", () => {
  const w = mount(CoverageView, { props: { coverage: navCoverage } });
  const optionalSlots = w.findAll('section')
    .find((s) => s.text().includes("Optional"))!
    .findAll('[data-testid="coverage-slot"]')
    .map((e) => e.attributes("data-slot"));
  expect(optionalSlots).not.toContain("linkLabel");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/CoverageView.test.ts -t "inherited"`
Expected: FAIL — no Inherited section; inherited slots fall through (they match neither the structural nor optional computed today).

- [ ] **Step 3: Add the `inherited` computed + section** in `src/app/components/CoverageView.vue`.

In `<script setup>`, after `optional`:
```ts
const inherited = computed(() => props.coverage.slots.filter((s) => s.classification === "inherited"));
```

In the template, after the Optional `<section>` (before the closing `</div>` of the root), add:
```vue
    <section v-if="inherited.length">
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Inherited · follows another slot
      </h3>
      <div role="list" class="space-y-0.5">
        <div
          v-for="s in inherited"
          :key="s.slot"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-zinc-400'">
            {{ s.touched ? "✓" : "↳" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
          <span class="ml-auto shrink-0 text-[10px] text-zinc-400">inherits {{ s.inheritsFrom }}</span>
        </div>
      </div>
    </section>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/CoverageView.test.ts`
Expected: PASS — the 2 new tests + all existing CoverageView tests (structural count, to-design, optional touched/untouched, the v0.30.0 click tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green (816 + Task1 + Task2 + Task3 additions).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/CoverageView.vue src/app/components/CoverageView.test.ts
git commit -m "feat(coverage): Inherited section in the coverage view (follows-parent)"
```

## Self-Review

**1. Spec coverage:**
- Third `inherited` classification + `inheritsFrom` + `i()` + 4 re-tags → Task 1. ✓
- Anatomy test (inherited set + parent validity + shape) → Task 1. ✓
- Engine: `SlotCoverage.inheritsFrom`, touched-via-parent, `toDesign` exclusion, structural counts unchanged → Task 2. ✓
- CoverageView third section (✓/↳ + "inherits parent"), inherited leaves Optional → Task 3. ✓
- Tests in all three layers → each Task Step 1. ✓
- Out-of-scope (depth, auto-detection, chains) correctly omitted. ✓

**2. Placeholder scan:** none — every code step shows actual code/commands.

**3. Type consistency:** `SlotClassification` gains `"inherited"` (Task 1) and is consumed unchanged by `rank()`/filters (Task 2) and the `classification === "inherited"` computed (Task 3). `inheritsFrom?: string` defined on `SlotAnatomy` (Task 1) and mirrored on `SlotCoverage` (Task 2), consumed as `s.inheritsFrom` in the view (Task 3). The 4 re-tagged slots + their parents match `EXPECTED_INHERITED`.

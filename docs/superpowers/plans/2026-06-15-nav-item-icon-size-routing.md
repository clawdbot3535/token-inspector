# Nav item-icon-size Slot Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `nav-item-icon-size` to nav's `linkLeadingIcon` slot (not the `item` base), so the nav item stops collapsing to ~20px — by generalizing the v0.28.8 icon-size gate to the component's actual leading-icon slot.

**Architecture:** A new `leadingIconSlotFor(component)` in `component-vocab.ts` derives the leading-icon slot from `NUXT_SLOTS` (`leadingIcon` / `linkLeadingIcon` / `itemLeadingIcon`). `matchParsed` routes an `icon-size` utility (non-icon prefix) to that slot when it exists.

**Tech Stack:** TypeScript (`@tg/grammar`), Vitest.

---

## Ground truth (verified during planning)

- `nav-item-icon-size` → currently `{slot:"item", utilityType:"icon-size"}` → `size-5` on `slots.item` (which also carries `h-[60px]`), collapsing the nav item.
- Nav `NUXT_SLOTS` has `linkLeadingIcon` (not `leadingIcon`); accordion has `leadingIcon`; chip `{root,base}` and sidebar (custom, not in `NUXT_SLOTS`) have neither.
- The v0.28.8 gate in `matchParsed` hard-checks `nuxtSlotsFor(component).has(entry.slot)` with `entry.slot === "leadingIcon"`, so nav fails it.
- `nuxtSlotsFor` is defined at component-vocab.ts:150; `slot-mapping.ts:81` already imports from `./component-vocab.js`.
- The current nav test (slot-mapping.test.ts:82) asserts `nav-item-icon-size → {slot:"item",…}` — it must flip to `linkLeadingIcon`.

---

## Task 1: Add `leadingIconSlotFor` + generalize the gate

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (add helper)
- Modify: `packages/grammar/src/slot-mapping.ts` (import + generalize gate)
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Update / add the failing tests**

In `packages/grammar/src/slot-mapping.test.ts`, REPLACE the existing test (the `it("does NOT re-route icon-size for components without a leadingIcon slot", …)` block at line 82) with:

```ts
  it("routes nav-item-icon-size to nav's linkLeadingIcon slot", () => {
    expect(heuristicSlotMapping("nav-item-icon-size")).toEqual({
      slot: "linkLeadingIcon",
      utilityType: "icon-size",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("leaves icon-size on the sub-element when the component has no leading-icon slot", () => {
    // table has a `td` slot but no *leadingIcon slot → size stays on td (no collapse-fix target)
    expect(heuristicSlotMapping("table-td-icon-size")).toEqual({
      slot: "td",
      utilityType: "icon-size",
      variantAxis: null,
      variantKey: null,
    });
  });
```

(The `accordion-item-icon-size → leadingIcon` and `button-trailingIcon-icon-size-md → trailingIcon` tests already exist and must keep passing — regression guards.)

- [ ] **Step 2: Run — expect FAIL on the nav case**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "icon-size"`
Expected: the `nav-item-icon-size → linkLeadingIcon` test FAILS (currently `slot:"item"`); the `table-td` test passes already (table has no leading-icon slot, so it stays on `td` today too); accordion / button-trailingIcon pass.

- [ ] **Step 3: Add `leadingIconSlotFor` to `component-vocab.ts`**

Insert immediately after `nuxtSlotsFor` (after component-vocab.ts:151):

```ts
/**
 * The component's leading-icon slot — `leadingIcon` for most, `linkLeadingIcon` (nav) or
 * `itemLeadingIcon` (dropdown) for link/item-scoped anatomies, or undefined if it has none.
 * `icon-size` routes here instead of collapsing a sub-element base (accordion-item-icon-size,
 * nav-item-icon-size). Derived from NUXT_SLOTS so new components need no extra wiring.
 */
export function leadingIconSlotFor(component: string): string | undefined {
  const slots = nuxtSlotsFor(component);
  if (!slots) return undefined;
  if (slots.has("leadingIcon")) return "leadingIcon";
  return [...slots].find((s) => /leadingIcon$/i.test(s));
}
```

- [ ] **Step 4: Import it + generalize the gate in `slot-mapping.ts`**

Add `leadingIconSlotFor` to the existing `./component-vocab.js` import (slot-mapping.ts:81).

Replace the v0.28.8 icon-size gate inside the `for (const rule of HEURISTIC_RULES)` loop:

```ts
      if (
        entry.utilityType === "icon-size" &&
        !/icon$/i.test(slot) &&
        (nuxtSlotsFor(parsed.component)?.has(entry.slot) ?? false)
      ) {
        return entry;
      }
      return slot === "base" ? entry : { ...entry, slot };
```

with:

```ts
      // icon-size belongs on the component's leading-icon slot, not the sub-element
      // container it was named under (accordion-item / nav-item). Route there when the
      // prefix is NOT itself an icon slot and the component has a leading-icon slot
      // (leadingIcon / linkLeadingIcon / itemLeadingIcon). chip/sidebar (none) → unchanged;
      // an explicit icon prefix (button-trailingIcon-icon-size) is preserved by !/icon$/i.
      if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
        const iconSlot = leadingIconSlotFor(parsed.component);
        if (iconSlot) return { ...entry, slot: iconSlot };
      }
      return slot === "base" ? entry : { ...entry, slot };
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS. nav → `linkLeadingIcon`; accordion → `leadingIcon` (`leadingIconSlotFor("accordion")` is `leadingIcon`, so `{...entry, slot:"leadingIcon"}` equals the old entry); `button-icon-size-md` → `leadingIcon` (base path, `{...entry, slot:"leadingIcon"}` equals entry); `button-trailingIcon-icon-size` → `trailingIcon` (guard); `table-td` → `td`.

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "fix(grammar): route <comp>-item-icon-size to the component's leading-icon slot (nav linkLeadingIcon)"
```

---

## Task 2: Recipe-engine characterization + full suite + browser re-check

**Files:**
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Add the nav recipe test**

Append inside `describe("buildComponentRecipes", …)` in `src/recipe-engine.test.ts`:

```ts
  it("routes nav item icon-size to linkLeadingIcon, not the item box", () => {
    const graph = makeGraph([
      makeNode({ id: "nav-item-icon-size", layer: "component", type: "number", source: "global", base: "20" }),
      makeNode({ id: "nav-item-padding-y", layer: "component", type: "number", source: "global", base: "6" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["nav"] });
    const slots = recipes.nav?.slots ?? {};
    expect(slots.item ?? "").not.toContain("size-");
    expect(slots.linkLeadingIcon ?? "").toContain("size-");
  });
```

- [ ] **Step 2: Run — expect PASS**

Run: `npx vitest run src/recipe-engine.test.ts -t "nav item icon-size"`
Expected: PASS (`slots.item` has no `size-`; `slots.linkLeadingIcon` has it). If `slots.linkLeadingIcon` is empty, confirm the recipe engine emits the slot for a `linkLeadingIcon` mapping (it builds whatever slot the mapping names); keep the `item`-absent assertion as the load-bearing one.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe): nav item icon-size lands on linkLeadingIcon, not the item box"
```

- [ ] **Step 5: Browser re-check (verification, no code; dev server on :5175)**

Reload `http://localhost:5175/`, re-upload `assets/tokens-20260615-161948.zip`, select the `nav` group. Confirm the nav item row renders full-width (computed width no longer `20px`; it should pick up `h-[60px]`). Note the result.

---

## Task 3: Release v0.28.10

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.10] — 2026-06-15

### Fixed

- **Nav preview item collapsed to ~20px** — `nav-item-icon-size` was emitted as `size-5` on
  `slots.item`, overriding the item's `h-[60px]`. The v0.28.8 icon-size fix only matched a
  `leadingIcon` slot, but nav's leading-icon slot is `linkLeadingIcon`. A new
  `leadingIconSlotFor(component)` now derives the leading-icon slot from `NUXT_SLOTS`
  (`leadingIcon` / `linkLeadingIcon` / `itemLeadingIcon`), so `nav-item-icon-size` routes to
  `linkLeadingIcon` and the item renders full-width. accordion (`leadingIcon`), bare icon-size,
  explicit icon prefixes, and chip/sidebar (no leading-icon slot) are unchanged.

### Notes

- Remaining nav follow-ups (unmapped): `nav-item-ring-radius`, `nav-item-focus-offset`,
  `nav-item-outline-text-inverted`, `nav-item-link-text-visited` — separate, lower-priority.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `773 tests …`. Replace `773` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.10 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.10 — nav item-icon-size slot routing fix"
git tag v0.28.10
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only fix/nav-item-icon-size-routing
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.10
gh release create v0.28.10 --repo clawdbot3535/token-inspector \
  --title "v0.28.10 — nav item-icon-size slot routing fix" \
  --notes "Fix: the nav preview item collapsed to ~20px because nav-item-icon-size was emitted as size-5 on slots.item (over its h-[60px]). The v0.28.8 fix only matched a leadingIcon slot; nav's is linkLeadingIcon. New leadingIconSlotFor(component) derives the leading-icon slot from NUXT_SLOTS, so nav routes to linkLeadingIcon. accordion/bare/explicit-prefix/chip/sidebar unchanged. Remaining nav nulls documented."
gh auth switch --user d56de
git branch -d fix/nav-item-icon-size-routing
```

- [ ] **Step 5: Update memory**

Update `component-previews.md` / `MEMORY.md`: nav item-icon-size collapse FIXED (v0.28.10) via
`leadingIconSlotFor` generalizing the icon-size routing (nav → `linkLeadingIcon`); the icon-size
collapse class is now solved for any component with a derivable leading-icon slot. Remaining nav
nulls (`ring-radius`, `focus-offset`, `outline-text-inverted`, `link-text-visited`) noted. Bump
the test count.

---

## Self-Review

**Spec coverage:** `leadingIconSlotFor` (Task 1), generalized gate (Task 1), unit assertions incl. nav→linkLeadingIcon + the no-icon-slot guard + accordion/explicit-prefix regression guards (Task 1), recipe characterization (Task 2), browser re-check (Task 2 Step 5), release (Task 3). The 4 nav nulls / mirroring / preview projection are out of scope per the spec. All present.

**Placeholder scan:** No TBD/TODO. The Task 2 Step 2 fallback note is a real mirror/slot-emit caveat, not a placeholder.

**Type/name consistency:** `leadingIconSlotFor` returns `string | undefined`, used as `if (iconSlot) return { ...entry, slot: iconSlot }`. It is imported into slot-mapping.ts alongside `nuxtSlotsFor`. Test expectations match the `SlotMappingEntry` shape; recipe test reuses `makeNode`/`makeGraph`. `table-td-icon-size` is a valid grammar input (table has a `td` slot, no leading-icon slot) exercising the else-branch.

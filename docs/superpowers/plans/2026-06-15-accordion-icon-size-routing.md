# Accordion icon-size Slot Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `accordion-item-icon-size` to the `leadingIcon` slot (not the `item` base), so the accordion item stops rendering collapsed to ~20px.

**Architecture:** A gated condition in `slot-mapping.ts` `matchParsed`: an `icon-size` entry keeps the icon rule's slot (`leadingIcon`) instead of being overridden onto the sub-element `slotPrefix`, but only when the component actually has that icon slot in `NUXT_SLOTS`. Accordion qualifies; nav/chip/sidebar (no `leadingIcon` slot) are unchanged.

**Tech Stack:** TypeScript (`@tg/grammar`), Vitest.

---

## Ground truth (verified during planning)

- `matchParsed` (slot-mapping.ts ~420-441) ends with `return slot === "base" ? entry : { ...entry, slot }`, where `slot = parsed.slotPrefix ?? defaultBaseSlot(...)`. For `accordion-item-icon-size`, `slotPrefix = "item"`, so the icon rule's `leadingIcon` entry is rewritten to `item` → `size-5` on the item.
- The icon rule (line ~281) builds `buildEntry("leadingIcon", "icon-size", ctx)`, so `entry.slot === "leadingIcon"`, `entry.utilityType === "icon-size"`.
- `nuxtSlotsFor` is already imported (slot-mapping.ts:81). `nuxtSlotsFor("accordion")` includes `leadingIcon`; nav has `linkLeadingIcon` (not `leadingIcon`); chip/sidebar have no `leadingIcon`.
- Export icon-size tokens with a sub-element part: `accordion-item-icon-size` (fixed by this), `nav-item-icon-size` / `chip-close-icon-size` / `sidebar-item-icon-size` (unchanged — gate is false). Bare `<comp>-icon-size` already routes to `leadingIcon` via the `slot === "base"` branch.
- `SLOT_MIRROR` (`leadingIcon`→`trailingIcon`) copies the icon size to the chevron at recipe-build time.

---

## Task 1: Gate icon-size slot routing in `matchParsed`

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts`
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `packages/grammar/src/slot-mapping.test.ts` (inside the top-level `describe` block that holds the existing `heuristicSlotMapping` cases, e.g. after the `button-icon-size-md` test):

```ts
  it("routes accordion-item-icon-size to leadingIcon, not the item base", () => {
    expect(heuristicSlotMapping("accordion-item-icon-size")).toEqual({
      slot: "leadingIcon",
      utilityType: "icon-size",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("leaves a non-icon sub-element utility on its sub-element slot", () => {
    // accordion-item-bg stays on the item slot (only icon-size is re-routed)
    expect(heuristicSlotMapping("accordion-item-bg", "color")).toEqual({
      slot: "item",
      utilityType: "bg-color",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("does NOT re-route icon-size for components without a leadingIcon slot", () => {
    // nav's icon slot is linkLeadingIcon, not leadingIcon → unchanged (stays on item)
    expect(heuristicSlotMapping("nav-item-icon-size")).toEqual({
      slot: "item",
      utilityType: "icon-size",
      variantAxis: null,
      variantKey: null,
    });
  });
```

- [ ] **Step 2: Run — expect FAIL on the accordion case**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "icon-size"`
Expected: the `accordion-item-icon-size` test FAILS (currently returns `slot:"item"`); the `nav-item-icon-size` and existing `button-icon-size-md` cases pass.

- [ ] **Step 3: Apply the gate in `matchParsed`**

In `packages/grammar/src/slot-mapping.ts`, inside the `for (const rule of HEURISTIC_RULES)` loop, replace the final return:

```ts
      return slot === "base" ? entry : { ...entry, slot };
```

with:

```ts
      // icon utilities target the component's icon slot, not the sub-element base
      // they were named under: accordion-item-icon-size sizes the chevron, not the
      // item box. Keep the rule's slot only when the component actually has it
      // (nav/chip/sidebar lack `leadingIcon` → unchanged, no mis-routing).
      if (
        entry.utilityType === "icon-size" &&
        (nuxtSlotsFor(parsed.component)?.has(entry.slot) ?? false)
      ) {
        return entry;
      }
      return slot === "base" ? entry : { ...entry, slot };
```

(There is exactly one occurrence of that return line inside the loop — the checked-indicator special-case above it has its own distinct return.)

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS (the three new cases + all existing slot-mapping cases — `button-icon-size-md` still `leadingIcon`, sub-element non-icon utilities unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "fix(grammar): route <comp>-item-icon-size to the icon slot, not the sub-element base"
```

---

## Task 2: Recipe-engine characterization + full suite + browser re-check

**Files:**
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Add the accordion recipe test**

Append inside the `describe("buildComponentRecipes", …)` block in `src/recipe-engine.test.ts` (reuses the file's `makeNode` / `makeGraph` helpers):

```ts
  it("routes accordion item icon-size to the icon slots, not the item box", () => {
    const graph = makeGraph([
      makeNode({ id: "accordion-item-icon-size", layer: "component", type: "number", source: "global", base: "20" }),
      makeNode({ id: "accordion-item-padding-y", layer: "component", type: "number", source: "global", base: "14" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["accordion"] });
    const slots = recipes.accordion?.slots ?? {};
    // the item box must NOT carry a size-* utility (that collapsed it to 20px)
    expect(slots.item ?? "").not.toContain("size-");
    // the icon size lands on leadingIcon (mirrored to trailingIcon by SLOT_MIRROR)
    expect(slots.leadingIcon ?? "").toContain("size-");
    expect(slots.trailingIcon ?? "").toContain("size-");
  });
```

- [ ] **Step 2: Run — expect PASS (Task 1 fixed the grammar this consumes)**

Run: `npx vitest run src/recipe-engine.test.ts -t "accordion item icon-size"`
Expected: PASS. (If `trailingIcon` is empty, confirm `SLOT_MIRROR` runs in `buildComponentRecipes`; if the mirror is applied elsewhere, drop the `trailingIcon` assertion and keep `item`-absent + `leadingIcon`-present, which are the load-bearing ones.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe): accordion item icon-size lands on icon slots, not the item box"
```

- [ ] **Step 5: Browser re-check (verification, no code change; dev server on :5175)**

Reload `http://localhost:5175/`, re-upload `assets/tokens-20260615-161948.zip`, select the `accordion` group. Confirm the item row renders full-width (not 20px) — `getComputedStyle` width should no longer be `20px`. Note the result.

---

## Task 3: Release v0.28.8

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.8] — 2026-06-15

### Fixed

- **Accordion preview item collapsed to ~20px** — `accordion-item-icon-size` was emitted as
  `size-5` on `slots.item` (the item box), because `matchParsed` forced the icon rule's
  `leadingIcon` slot onto the `item` sub-element prefix. An `icon-size` utility now keeps the
  icon slot when the component actually has it (`nuxtSlotsFor(component).has("leadingIcon")`),
  so the size lands on `leadingIcon` / `trailingIcon` (the chevron) and the item renders at its
  natural width. nav / chip / sidebar (no `leadingIcon` slot) are unchanged.

### Notes

- Remaining accordion follow-ups: `accordion-item-text-opened` (open-state colour, needs the
  `data-[state=open]:` prefix form) and `nav-item-icon-size` (nav's icon slot is `linkLeadingIcon`)
  are still routed as before — separate, lower-priority work.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `765 tests …`. Replace `765` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.8 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.8 — accordion icon-size slot routing fix"
git tag v0.28.8
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only fix/accordion-icon-size-routing
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.8
gh release create v0.28.8 --repo clawdbot3535/token-inspector \
  --title "v0.28.8 — accordion icon-size slot routing fix" \
  --notes "Fix: the accordion preview item collapsed to ~20px because accordion-item-icon-size was emitted as size-5 on slots.item. An icon-size utility now keeps its icon slot (leadingIcon) when the component has it, so the size lands on the chevron, not the item box. nav/chip/sidebar unchanged. Remaining accordion follow-ups (text-opened data-state, nav-item icon-size) documented."
gh auth switch --user d56de
git branch -d fix/accordion-icon-size-routing
```

- [ ] **Step 5: Update memory**

Update `component-previews.md`: the accordion `size-5`-on-item recipe bug is FIXED (v0.28.8) via the gated icon-size routing in `slot-mapping.ts` `matchParsed`; the `bg` "bug" was a non-bug (alpha:0 transparent by design); remaining accordion follow-ups are `text-opened` (data-state) + nav-item icon-size. Bump the test count in `MEMORY.md`.

---

## Self-Review

**Spec coverage:** the gated `matchParsed` fix (Task 1), the unit assertions incl. the deliberate nav non-regression (Task 1), the recipe-engine characterization (Task 2), browser re-check (Task 2 Step 5), release (Task 3). bg / text-opened explicitly out of scope per the spec. All present.

**Placeholder scan:** No TBD/TODO. The Task 2 Step 2 note is a real fallback (mirror-timing), not a placeholder.

**Type/name consistency:** the gate condition uses `entry.utilityType === "icon-size"` and `entry.slot` (both set by `buildEntry`); `nuxtSlotsFor` is already imported. Test expectations match the existing `heuristicSlotMapping` entry shape (`{slot, utilityType, variantAxis, variantKey}`). Recipe test reuses `makeNode`/`makeGraph`.

# Drop Unroutable icon-size on Container Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `sidebar-item-icon-size` collapsing the sidebar item — drop an unroutable `icon-size` when it lands on a layout-container slot (sidebar `item`), while leaving leaf slots (chip `close`) sized.

**Architecture:** A module-level `ICON_SIZE_CONTAINER_SLOTS` set + one guard in `matchParsed`'s icon-size branch (after the v0.28.10 `leadingIconSlotFor` check): when there's no icon slot to route to and the prefix is a container slot, return `null`.

**Tech Stack:** TypeScript (`@tg/grammar`), Vitest.

---

## Ground truth (verified during planning)

- `sidebar-item-icon-size` → currently `{slot:"item", utilityType:"icon-size"}` (via `buildCustomRecipes` passing `extraSlots=["item"]`) → `size-4` on the custom recipe's `item` slot → 16×16 collapse.
- `chip-close-icon-size` → `{slot:"close", utilityType:"icon-size"}`; `custom-recipe-engine.test.ts` asserts `chip.slots.close` matches `/\bsize-\d/` — must stay.
- `leadingIconSlotFor("sidebar")` / `("chip")` are `undefined` (no leading-icon slot).
- The current icon-size branch ends `return slot === "base" ? entry : { ...entry, slot }`.
- `custom-recipe-engine.test.ts` imports `buildCustomRecipes` + `buildGraph`; build a synthetic sidebar graph (the `components/` fixture has no sidebar tokens).

---

## Task 1: Drop unroutable icon-size on container slots

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts`
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Add the failing + guard tests**

Append inside the top-level `heuristicSlotMapping` describe block in `packages/grammar/src/slot-mapping.test.ts` (near the other icon-size tests):

```ts
  it("drops a sidebar-item-icon-size (no icon slot, container item) instead of collapsing it", () => {
    expect(heuristicSlotMapping("sidebar-item-icon-size", undefined, new Set(["item"]))).toBeNull();
  });

  it("keeps icon-size on a leaf sub-element with no icon slot (chip close)", () => {
    expect(heuristicSlotMapping("chip-close-icon-size", undefined, new Set(["label", "close"]))).toEqual({
      slot: "close",
      utilityType: "icon-size",
      variantAxis: null,
      variantKey: null,
    });
  });
```

- [ ] **Step 2: Run — expect FAIL on the sidebar case**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "icon-size"`
Expected: the sidebar test FAILS (currently `{slot:"item",…}`, not null); the chip-close leaf test passes already.

- [ ] **Step 3: Add the container set + the drop guard**

In `packages/grammar/src/slot-mapping.ts`, add a module-level const (near the other top-level consts, e.g. just above `matchParsed`):

```ts
// Layout-container slots a stray `size-*` would collapse (width+height). Leaf slots
// (close, label, indicator, thumb, …) legitimately carry an icon size.
const ICON_SIZE_CONTAINER_SLOTS: ReadonlySet<string> = new Set(["item", "content", "root", "wrapper"]);
```

Replace the icon-size branch inside the `for (const rule of HEURISTIC_RULES)` loop:

```ts
      if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
        const iconSlot = leadingIconSlotFor(parsed.component);
        if (iconSlot) return { ...entry, slot: iconSlot };
      }
      return slot === "base" ? entry : { ...entry, slot };
```

with:

```ts
      if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
        const iconSlot = leadingIconSlotFor(parsed.component);
        if (iconSlot) return { ...entry, slot: iconSlot };
        // No icon slot to route to: an icon-size on a container slot can't be honoured
        // and would only collapse it (sidebar-item). Drop it. Leaf slots (chip-close)
        // keep it via the fall-through below.
        if (ICON_SIZE_CONTAINER_SLOTS.has(slot)) return null;
      }
      return slot === "base" ? entry : { ...entry, slot };
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS. sidebar → null; chip-close → `{slot:"close",…}`; nav → `linkLeadingIcon`; accordion → `leadingIcon`; `button-trailingIcon-icon-size` → `trailingIcon`; bare `button-icon-size-md` → `leadingIcon`.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "fix(grammar): drop unroutable icon-size on container slots (sidebar item), keep leaf slots"
```

---

## Task 2: Custom-recipe characterization + full suite + browser re-check

**Files:**
- Test: `src/custom-recipe-engine.test.ts`

- [ ] **Step 1: Add the sidebar recipe test**

Append inside `describe("buildCustomRecipes", …)` in `src/custom-recipe-engine.test.ts` (the file already imports `buildCustomRecipes` + `buildGraph`):

```ts
  it("does not collapse the sidebar item — icon-size is dropped, not emitted as size-*", () => {
    const graph = buildGraph([
      {
        name: "global",
        data: {
          sidebar: {
            item: {
              "icon-size": { $value: 16, $type: "number" },
              text: { $value: "#52525B", $type: "color" },
            },
          },
        },
      },
    ]);
    const recipes = buildCustomRecipes(graph, new Map([["sidebar", ["item"]]]));
    expect(recipes.sidebar?.slots.item ?? "").not.toContain("size-");
  });
```

- [ ] **Step 2: Run — expect PASS**

Run: `npx vitest run src/custom-recipe-engine.test.ts -t "does not collapse the sidebar item"`
Expected: PASS (`slots.item` has no `size-`). The existing chip test (`chip.slots.close` matches `/\bsize-\d/`) must still pass in the full run.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green (incl. the existing chip `slots.close` size assertion). Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/custom-recipe-engine.test.ts
git commit -m "test(custom-recipe): sidebar item drops icon-size, no size-* collapse"
```

- [ ] **Step 5: Browser re-check (verification, no code; dev server on :5175)**

Reload `http://localhost:5175/`, re-upload `assets/tokens-20260615-161948.zip`, select the `sidebar` group. Confirm the sidebar item row renders full-width (computed width no longer `16px`). Note the result.

---

## Task 3: Release v0.28.11

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.11] — 2026-06-16

### Fixed

- **Sidebar preview item collapsed to ~16px** — `sidebar-item-icon-size` was emitted as `size-4`
  on the custom recipe's `item` slot (sidebar is custom and has no icon slot to route to, so the
  v0.28.10 fix couldn't reach it). An unroutable `icon-size` that lands on a layout-container slot
  (`item` / `content` / `root` / `wrapper`) is now dropped instead of collapsing the container.
  Leaf slots keep their icon size — chip's `close` button is unchanged (it's not a container).
  This closes the last collapsed preview from the live export.

### Notes

- Separate remaining chip item: `chip-close-icon` (a colour-valued token) mis-emits an
  inert `size-[#hex]` because the `icon` rule is value-type-blind — a different, low-priority
  follow-up.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `775 tests …`. Replace `775` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.11 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.11 — drop unroutable icon-size on container slots (sidebar)"
git tag v0.28.11
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only fix/sidebar-icon-size-drop
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.11
gh release create v0.28.11 --repo clawdbot3535/token-inspector \
  --title "v0.28.11 — drop unroutable icon-size on container slots (sidebar)" \
  --notes "Fix: the sidebar preview item collapsed to ~16px because sidebar-item-icon-size was emitted as size-4 on the custom recipe's item slot (sidebar is custom, no icon slot to route to). An unroutable icon-size on a layout-container slot (item/content/root/wrapper) is now dropped instead of collapsing it; leaf slots (chip close) keep their icon size. Closes the last collapsed preview from the live export. Separate follow-up: chip-close-icon colour mis-emits an inert size-[#hex] (icon rule type-blindness)."
gh auth switch --user d56de
git branch -d fix/sidebar-icon-size-drop
```

- [ ] **Step 5: Update memory**

Update `component-previews.md` / `MEMORY.md`: sidebar item collapse FIXED (v0.28.11) — unroutable
icon-size on container slots (`ICON_SIZE_CONTAINER_SLOTS`) dropped; chip `close` (leaf) unchanged.
The icon-size-collapse class is now fully closed across the export (accordion/nav/sidebar). Note
the separate chip `close-icon` colour→`size-[#hex]` type-blindness follow-up. Bump the test count.

---

## Self-Review

**Spec coverage:** `ICON_SIZE_CONTAINER_SLOTS` + the drop guard (Task 1), unit tests incl. sidebar-drop + chip-close-leaf guard + existing nav/accordion/button guards (Task 1), custom-recipe characterization (Task 2), browser re-check (Task 2 Step 5), release (Task 3). chip `close-icon` colour bug out of scope per the spec. All present.

**Placeholder scan:** No TBD/TODO. Concrete throughout.

**Type/name consistency:** `ICON_SIZE_CONTAINER_SLOTS` is a `ReadonlySet<string>`; the guard uses `.has(slot)`. `heuristicSlotMapping(id, valueType?, extraSlots?)` — the tests pass `undefined, new Set([...])` for the extraSlots param. The custom-recipe test reuses `buildCustomRecipes` + `buildGraph` (both already imported) with a synthetic sidebar graph.

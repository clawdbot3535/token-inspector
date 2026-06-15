# `data-[state=open]:` State Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit `data-[state=open]:text-[…]` for `accordion-item-text-opened` (currently dropped) by teaching the grammar the `opened` state and mapping it to the Reka `data-[state=open]` variant.

**Architecture:** Add `opened`/`open` to `STATE_KEYS` (so the parser recognizes the trailing state) and extend `normalizeState` to translate `opened`/`open` → `data-[state=open]`. The recipe engine already prepends `<statePrefix>:`, so no engine change.

**Tech Stack:** TypeScript (`@tg/grammar`), Vitest.

---

## Ground truth (verified during planning)

- `STATE_KEYS` (component-vocab.ts:73-75) = `default, hover, active, disabled, focus, checked, hovered`.
- `normalizeState` (slot-mapping.ts:186): `return s === "hovered" ? "hover" : s;`.
- `buildEntry` (slot-mapping.ts:227-241): a bare state suffix (no variant/size/color) returns `{slot, utilityType, variantAxis:null, variantKey:null, statePrefix: normalizeState(ctx.state)}`. `matchParsed` then forces `slot` to the sub-element (`item`).
- Recipe engine (recipe-engine.ts:300): `utility = `${statePrefix}:${utility}``. So `statePrefix:"data-[state=open]"` → `data-[state=open]:text-[…]`.
- `accordion-item-text-opened` has no variant/colorRole → it takes the bare-state path above.

---

## Task 1: Teach the grammar the `opened` → `data-[state=open]` state

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (STATE_KEYS)
- Modify: `packages/grammar/src/slot-mapping.ts` (normalizeState)
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Add the failing tests**

Append inside the top-level `heuristicSlotMapping` describe block in `packages/grammar/src/slot-mapping.test.ts`:

```ts
  it("maps accordion-item-text-opened to a data-[state=open] text-color on the item", () => {
    const m = heuristicSlotMapping("accordion-item-text-opened", "color");
    expect(m).not.toBeNull();
    expect(m!.slot).toBe("item");
    expect(m!.utilityType).toBe("text-color");
    expect(m!.statePrefix).toBe("data-[state=open]");
  });

  it("leaves existing pseudo-class states unchanged (hover stays hover)", () => {
    const m = heuristicSlotMapping("button-solid-bg-hover", "color");
    expect(m!.statePrefix).toBe("hover");
  });
```

- [ ] **Step 2: Run — expect FAIL on the opened case**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "opened"`
Expected: FAIL — `heuristicSlotMapping("accordion-item-text-opened", "color")` is currently `null` (`opened` not in `STATE_KEYS`).

- [ ] **Step 3: Add `opened`/`open` to `STATE_KEYS`**

In `packages/grammar/src/component-vocab.ts`, update the comment + set (lines 72-75):

```ts
/** Trailing interaction-state keys → Tailwind pseudo-class or data-variant prefixes. */
export const STATE_KEYS: ReadonlySet<string> = new Set([
  "default", "hover", "active", "disabled", "focus", "checked", "hovered",
  "opened", "open",
]);
```

- [ ] **Step 4: Map `opened`/`open` → `data-[state=open]` in `normalizeState`**

In `packages/grammar/src/slot-mapping.ts`, replace line 186:

```ts
function normalizeState(s: string): string { return s === "hovered" ? "hover" : s; }
```

with:

```ts
// Most states are Tailwind pseudo-classes whose name equals the prefix
// (hover/focus/active/disabled). `hovered` normalises to `hover`. `opened`/`open`
// are Reka data-state attributes (Nuxt UI v4 accordion), not pseudo-classes →
// the Tailwind arbitrary data-variant `data-[state=open]`.
function normalizeState(s: string): string {
  if (s === "hovered") return "hover";
  if (s === "opened" || s === "open") return "data-[state=open]";
  return s;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS (the two new cases + all existing slot-mapping cases — hover/active/focus/checked unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "feat(grammar): map opened/open state to the data-[state=open] variant prefix"
```

---

## Task 2: Recipe-engine characterization + full suite

**Files:**
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Add the accordion opened-text recipe test**

Append inside `describe("buildComponentRecipes", …)` in `src/recipe-engine.test.ts` (reuses `makeNode`/`makeGraph`):

```ts
  it("emits a data-[state=open]: prefix for accordion opened-state text", () => {
    const graph = makeGraph([
      makeNode({ id: "accordion-item-text-opened", layer: "component", type: "color", source: "global", base: "#5B6573" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["accordion"] });
    expect(recipes.accordion?.slots.item ?? "").toContain("data-[state=open]:text-");
  });
```

- [ ] **Step 2: Run — expect PASS (Task 1 fixed the grammar this consumes)**

Run: `npx vitest run src/recipe-engine.test.ts -t "data-[state=open]"`
Expected: PASS.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 4: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe): accordion opened-state text emits data-[state=open]: prefix"
```

---

## Task 3: Release v0.28.9

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.9] — 2026-06-15

### Added

- **`data-[state=open]:` state prefix** — `accordion-item-text-opened` (the accordion item's
  text colour when expanded) previously mapped to `null` and was dropped. The grammar now
  recognises the `opened` / `open` state and maps it to Reka's `data-[state=open]` data-variant,
  so the token emits `data-[state=open]:text-[…]` on `slots.item` (matching Nuxt UI v4's
  Reka-driven open state). The recipe engine already prepends the prefix verbatim, so no engine
  change was needed. Existing pseudo-class states (hover/focus/active/disabled/checked) are
  unchanged.

### Notes

- Rendering the opened state in the live preview is separate follow-up (`projectToState` /
  `LiveAccordion` have no open/closed projection yet). Other data-state mappings
  (`active` / `selected` → data-variants) remain a separate semantic decision.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `770 tests …`. Replace `770` with the exact total from Task 2 Step 3.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.9 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.9 — data-[state=open]: state prefix"
git tag v0.28.9
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only feat/data-state-open-prefix
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.9
gh release create v0.28.9 --repo clawdbot3535/token-inspector \
  --title "v0.28.9 — data-[state=open]: state prefix" \
  --notes "Adds the data-[state=open]: state prefix. accordion-item-text-opened (dropped before) now maps the opened/open state to Reka's data-[state=open] variant, emitting data-[state=open]:text-[…] on slots.item. No recipe-engine change (it already prepends the prefix). Existing pseudo-class states unchanged. Preview projection of the open state + active/selected data-variants remain follow-ups."
gh auth switch --user d56de
git branch -d feat/data-state-open-prefix
```

- [ ] **Step 5: Update memory**

Update `component-previews.md` / `MEMORY.md`: `accordion-item-text-opened` is now mapped
(v0.28.9) via `opened`/`open` → `data-[state=open]` in `normalizeState` + `STATE_KEYS`; the
data-state prefix family is unblocked. Remaining: preview projection of the open state, and
`active`/`selected` data-variants. Bump the test count.

---

## Self-Review

**Spec coverage:** STATE_KEYS + normalizeState change (Task 1), unit assertions incl. the hover non-regression (Task 1), recipe characterization (Task 2), release (Task 3). Preview projection + active/selected explicitly out of scope per the spec. All present.

**Placeholder scan:** No TBD/TODO. Concrete code throughout.

**Type/name consistency:** `statePrefix` field asserted matches `SlotMappingEntry` (buildEntry sets it on the bare-state path). `normalizeState` is the only state→prefix translator (lines 205/216/240 all route through it). Recipe test reuses `makeNode`/`makeGraph`; the `text-color` path requires `valueType:"color"`, supplied via the fixture node `type:"color"`.

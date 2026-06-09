# size utility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the grammar the bare `size` utility (`size-N` = width+height), emit `size-[…px]` from the recipe engine, and let LiveCheckbox/LiveRadio (box size) and LiveSwitch (thumb size+colour) consume the now-mapped tokens.

**Architecture:** Task 1 = grammar + emit (slot-mapping, recipe-engine) incl. golden-snapshot review. Task 2 = LiveCheckbox/LiveRadio size-variant merge. Task 3 = LiveSwitch thumb pipeline. `extract-arbitrary` already supports `size` (both tables) — no change there.

**Tech Stack:** TS engine + Vue 3 SFC, Vitest + VTU + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest; every task commit must be green.

**Branch:** `feat/size-utility` (spec at `e9fcd1f`).

**Spec:** `docs/superpowers/specs/2026-06-09-size-utility-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`. VTU `.element` is `Element` → cast `HTMLElement` for `.style`.
- `heuristicSlotMapping(id, valueType?)` is 2-arg. `HEURISTIC_RULES` entries are
  `{ match: (u) => …, build: (ctx) => buildEntry(<slot>, <utilityType>, ctx) }`.

---

### Task 1: grammar rule + recipe emit

**Files:** Modify `src/slot-mapping.ts`, `src/recipe-engine.ts`; Test `src/slot-mapping.test.ts`, `src/recipe-engine.test.ts`.

- [ ] **Step 1: Failing tests**

`src/slot-mapping.test.ts` (mirror the surrounding heuristic tests' style):
```typescript
  it("maps checkbox-size-md to a base size variant", () => {
    expect(heuristicSlotMapping("checkbox-size-md")).toMatchObject({
      slot: "base", utilityType: "size", variantAxis: "size", variantKey: "md",
    });
  });
  it("routes switch-thumb-size-md to the thumb slot as a size variant", () => {
    expect(heuristicSlotMapping("switch-thumb-size-md")).toMatchObject({
      slot: "thumb", utilityType: "size", variantAxis: "size", variantKey: "md",
    });
  });
  it("does not shadow icon-size with the bare size rule", () => {
    expect(heuristicSlotMapping("button-icon-size")?.utilityType).toBe("icon-size");
  });
```
`src/recipe-engine.test.ts` (mirror the existing graph-builder helper used by neighbouring tests):
```typescript
  it("emits a size-[..] class for a bare component size token", () => {
    const graph = /* build a graph with: { checkbox: { "size-md": { $value: 18, $type: "number" } } } via the file's existing helper */;
    const recipes = buildComponentRecipes(graph, { components: ["checkbox"] });
    expect(recipes["checkbox"]?.variants.size?.["md"]?.["base"]).toContain("size-[18px]");
  });
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/slot-mapping.test.ts src/recipe-engine.test.ts`.

- [ ] **Step 3: Implement**

`src/slot-mapping.ts`:
- `UtilityType` union (~line 32): add `| "size"` (next to `"icon-size"`).
- `HEURISTIC_RULES`: directly AFTER the `icon-size` rule entry, add:
```typescript
  {
    match: (u) => u === "size",
    build: (ctx) => buildEntry("base", "size", ctx),
  },
```
`src/recipe-engine.ts`:
- `ARBITRARY_VALUE_TYPES` set: add `"size"` (next to `"height"`/`"width"`).
- `prefixForUtility` switch: add `case "size": return "size-";` (next to the `icon-size` case, which already returns `"size-"`).

- [ ] **Step 4: Run → PASS** — the two test files.
- [ ] **Step 5: Full gate + snapshot review** — `npm run typecheck && npx vitest run`. If the golden `app.config.ts` snapshot fails: inspect the diff — it must contain ONLY new `size-[…]` entries (checkbox/radio `variants.size.{sm,md}.base`, switch `variants.size.md.thumb`); then update with `npx vitest run -u` and re-run. Report the exact snapshot diff.
- [ ] **Step 6: Commit**
```bash
git add src/slot-mapping.ts src/recipe-engine.ts src/slot-mapping.test.ts src/recipe-engine.test.ts src/renderers/__snapshots__
git commit -m "feat(grammar): bare size utility — width+height dimension (size-[..] emit)"
```
Verify no trailer.

---

### Task 2: LiveCheckbox + LiveRadio box size

**Files:** Modify `src/app/components/LiveCheckbox.vue`, `src/app/components/LiveRadio.vue`; Test `src/app/components/LiveCheckbox.test.ts`, `src/app/components/LiveRadio.test.ts`.

- [ ] **Step 1: Failing tests** — add to each test file (adjust component/testid names per file):
```typescript
  it("sizes the box from the size-md token", () => {
    const global = {
      checkbox: {
        bg: { $value: "#FFFFFF", $type: "color" },
        "bg-checked": { $value: "#4F63D2", $type: "color" },
        "size-md": { $value: 18, $type: "number" },
      },
    };
    const sources: SourceFile[] = [{ name: "global", data: global }];
    const wrapper = mount(LiveCheckbox, { props: { graph: buildGraph(sources) }, ...mountOpts });
    const box = wrapper.find('[data-testid="checkbox-box"]');
    expect((box.element as HTMLElement).style.width).toBe("18px");
    expect((box.element as HTMLElement).style.height).toBe("18px");
  });
```
(For `LiveRadio.test.ts`: component `radio`, testid `radio-box`, same token shape.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in BOTH components' `<script setup>` (identical code):
```typescript
const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];
const sizeClasses = computed<string>(() => {
  const sizes = recipe.value?.variants.size ?? {};
  const keys = Object.keys(sizes);
  if (keys.length === 0) return "";
  const key = keys.includes("md")
    ? "md"
    : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
  return sizes[key]?.["base"] ?? "";
});
```
Change the cells source and the code block to the merged string. In `cells`:
```typescript
  const merged = [baseClasses.value, sizeClasses.value].filter((s) => s.length > 0).join(" ");
  return (["default", "checked"] as const).map((state) => {
    const { classes, style } = extractArbitrary(projectToState(merged, state));
    …
```
And `inspectClasses`:
```typescript
const inspectClasses = computed<string>(() =>
  [baseClasses.value, sizeClasses.value].filter((s) => s.length > 0).join(" "),
);
```
Template unchanged (static `size-5` stays as the token-less fallback; the inline width/height override it).

- [ ] **Step 4: Run → PASS** — both component test files; the existing tests (graphs without size tokens) must stay green untouched.
- [ ] **Step 5: Full gate** — `npm run typecheck && npx vitest run`.
- [ ] **Step 6: Commit**
```bash
git add src/app/components/LiveCheckbox.vue src/app/components/LiveRadio.vue src/app/components/LiveCheckbox.test.ts src/app/components/LiveRadio.test.ts
git commit -m "feat(preview): token-driven checkbox/radio box size (size-md variant merge)"
```
Verify no trailer.

---

### Task 3: LiveSwitch token-driven thumb

**Files:** Modify `src/app/components/LiveSwitch.vue`; Test `src/app/components/LiveSwitch.test.ts`.

- [ ] **Step 1: Failing test** — add to `LiveSwitch.test.ts`:
```typescript
  it("drives the thumb from thumb tokens (size + colour)", () => {
    const global = {
      switch: {
        bg: { $value: "#E4E4E7", $type: "color" },
        "bg-checked": { $value: "#4F63D2", $type: "color" },
        "width-md": { $value: 36, $type: "number" },
        "height-md": { $value: 20, $type: "number" },
        thumb: {
          color: { $value: "#FFF1AA", $type: "color" },
          "size-md": { $value: 16, $type: "number" },
        },
      },
    };
    const sources: SourceFile[] = [{ name: "global", data: global }];
    const wrapper = mount(LiveSwitch, { props: { graph: buildGraph(sources) }, ...mountOpts });
    const thumb = wrapper.find('[data-testid="switch-thumb"]');
    const style = (thumb.element as HTMLElement).style;
    expect(style.width).toBe("16px");
    expect(style.height).toBe("16px");
    // bare `color` maps as text-color; the preview promotes it to the thumb's
    // background (the thumb is a shape, not text).
    expect(style.backgroundColor).not.toBe("");
  });
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in `LiveSwitch.vue`:
```typescript
function thumbFor(state: "default" | "checked"): { classes: string; style: CSSProperties } {
  const slotCls = switchRecipe.value?.slots["thumb"] ?? "";
  const sizeCls = switchRecipe.value?.variants.size?.[activeSize.value]?.["thumb"] ?? "";
  const merged = [slotCls, sizeCls].filter((s) => s.length > 0).join(" ");
  const { classes, style } = extractArbitrary(projectToState(merged, state));
  // The thumb is a shape, not text: a bare `color` token maps as text-color
  // (CSS `color`), but visually it is the knob's fill — promote it.
  if (style.color !== undefined && style.backgroundColor === undefined) {
    return { classes, style: { ...style, backgroundColor: style.color } };
  }
  return { classes, style };
}
```
Extend `Cell` with `thumbClasses: string; thumbStyle: CSSProperties;` and fill in the `cells` map:
```typescript
    const thumb = thumbFor(state);
    return { …existing…, thumbClasses: thumb.classes, thumbStyle: thumb.style };
```
Template — bind on the thumb span (static classes stay as fallback):
```vue
            <span
              data-testid="switch-thumb"
              class="block h-[70%] aspect-square rounded-full bg-white shadow-sm mx-0.5"
              :class="cell.thumbClasses"
              :style="cell.thumbStyle"
            />
```

- [ ] **Step 4: Run → PASS** — `LiveSwitch.test.ts` (existing two tests stay green: graphs without thumb tokens → empty merged string → no inline styles → static fallback).
- [ ] **Step 5: Full gate + build** — `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 6: Commit**
```bash
git add src/app/components/LiveSwitch.vue src/app/components/LiveSwitch.test.ts
git commit -m "feat(preview): token-driven switch thumb (size variant + colour promotion)"
```
Verify no trailer.

---

## Final verification

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] `npm run build:tokens`; diff `output/nuxt/app.config.ts` vs the pre-branch state — only new
  `size-[…]` classes (checkbox/radio base size variants, switch thumb).
- [ ] Headless QA with the real export: checkbox/radio box carries inline token dimensions; switch
  thumb sized/coloured from tokens; the unsupported-part/capability-gap hints unchanged; console
  clean. Screenshot.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request.

## Self-review notes

- **Spec coverage:** grammar rule + union (T1), emit + prefix (T1), golden review (T1), box size
  merge both components (T2), thumb pipeline + colour promotion (T3). extract-arbitrary untouched
  (already supports `size`). All mapped.
- **No shadowing:** exact `u === "size"`; icon-size test pinned.
- **Fallbacks:** all three previews keep static classes; token-less graphs render exactly as before
  (existing tests pin this).
- **No placeholders:** full code for every step; the one helper reference (recipe-engine graph
  builder) explicitly says to mirror the file's existing helper.

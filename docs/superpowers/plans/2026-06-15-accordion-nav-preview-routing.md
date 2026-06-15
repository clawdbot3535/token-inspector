# Accordion / Nav Preview Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `accordion` and `nav` live previews reachable — their `*-item` group labels must route to the `accordion`/`nav` preview, show the "Live" pill, and count in the Live filter.

**Architecture:** One shared helper (`previewComponentForGroup` / `groupHasPreview`) used at all three group→preview seams: App.vue's `@select-component` handler, App.vue's `liveCount`, and `ComponentTree.hasPreview`. Pure function, unit-tested; the wirings are one-liners.

**Tech Stack:** Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

---

## Ground truth (verified during planning)

- Probe: exactly `accordion` (group `accordion-item`) and `nav` (group `nav-item`) are preview-supported components with no matching group label. All other preview-less groups (`*-overlay-*`, `container`/`grid`/`page`/`section`/`stack`, `typography`) do NOT end in `-item`, so the `-item` strip never touches them.
- `ComponentTree.hasPreview` (ComponentTree.vue:42-46): `component = path.split("/")[0]`; returns `props.previewComponents?.has(component) ?? false`. Drives both the pill and the `liveOnly` `isVisible` filter.
- `ComponentTree.onGroupClick` (ComponentTree.vue:67-73) emits `select-component` with `path.split("/")[0]` (the raw top-level segment, e.g. `accordion-item`) — left unchanged; App.vue normalizes on receipt.
- App.vue `@select-component` handler (App.vue:729-732): `selectedComponent = name; state.selection.value = null;`.
- App.vue `liveCount` (App.vue:185-191): filters `node.kind === "group" && COMPONENTS_WITH_PREVIEW.has(node.label)`.
- Chain-1 gate already computes `selectedNode.id.split('-')[0]` = `accordion`, so once `selectedComponent` is normalized to `accordion`, both preview chains align.

---

## Task 1: Shared helper module

**Files:**
- Create: `src/app/preview-component.ts`
- Test: `src/app/preview-component.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { previewComponentForGroup, groupHasPreview } from "./preview-component.js";

const SET = new Set(["button", "card", "accordion", "nav", "modal"]);

describe("previewComponentForGroup", () => {
  it("returns a directly-supported label unchanged", () => {
    expect(previewComponentForGroup("button", SET)).toBe("button");
    expect(previewComponentForGroup("card", SET)).toBe("card");
  });
  it("strips a trailing -item when the base is preview-supported", () => {
    expect(previewComponentForGroup("accordion-item", SET)).toBe("accordion");
    expect(previewComponentForGroup("nav-item", SET)).toBe("nav");
  });
  it("leaves non-item / non-supported labels unchanged", () => {
    expect(previewComponentForGroup("button-overlay-dark", SET)).toBe("button-overlay-dark");
    expect(previewComponentForGroup("nav-item-overlay-dark", SET)).toBe("nav-item-overlay-dark");
    expect(previewComponentForGroup("container", SET)).toBe("container");
  });
});

describe("groupHasPreview", () => {
  it("is true for direct and -item-aliased preview components", () => {
    expect(groupHasPreview("button", SET)).toBe(true);
    expect(groupHasPreview("accordion-item", SET)).toBe(true);
    expect(groupHasPreview("nav-item", SET)).toBe(true);
  });
  it("is false for non-preview groups", () => {
    expect(groupHasPreview("container", SET)).toBe(false);
    expect(groupHasPreview("button-overlay-dark", SET)).toBe(false);
    expect(groupHasPreview("nav-item-overlay-dark", SET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npx vitest run src/app/preview-component.test.ts`
Expected: FAIL (cannot find `./preview-component.js`).

- [ ] **Step 3: Implement the module**

```ts
// Maps a token-tree group label to the live-preview component it should focus.
// Most groups equal their component name (button, card). List components emit
// their tokens under a part prefix (accordion-item-*, nav-item-*), so the tree
// groups them as `accordion-item` / `nav-item` while the recipe engine + preview
// key them as `accordion` / `nav`. Reconcile by stripping a trailing `-item`
// when the base is preview-supported. Overlay / layout / typography groups do
// not end in `-item`, so they are never touched.

/** The preview component a tree group maps to (or the label unchanged). */
export function previewComponentForGroup(label: string, previewSet: ReadonlySet<string>): string {
  if (previewSet.has(label)) return label;
  const stripped = label.replace(/-item$/, "");
  if (stripped !== label && previewSet.has(stripped)) return stripped;
  return label;
}

/** Whether a tree group has a rendered live preview (after normalization). */
export function groupHasPreview(label: string, previewSet: ReadonlySet<string>): boolean {
  return previewSet.has(previewComponentForGroup(label, previewSet));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/app/preview-component.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/preview-component.ts src/app/preview-component.test.ts
git commit -m "feat(app): previewComponentForGroup helper (maps *-item groups to their preview)"
```

---

## Task 2: ComponentTree shows the pill for `-item` groups

**Files:**
- Modify: `src/app/components/ComponentTree.vue`
- Test: `src/app/components/ComponentTree.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/app/components/ComponentTree.test.ts`:

```ts
describe("ComponentTree — Live pill for -item groups", () => {
  it("shows the pill on accordion-item when previewComponents has accordion", () => {
    const nodes = [
      { kind: "group" as const, label: "accordion-item", path: "accordion-item", count: 18, children: [] },
      { kind: "group" as const, label: "container", path: "container", count: 4, children: [] },
    ];
    const wrapper = mount(ComponentTree, {
      props: { nodes, previewComponents: new Set(["accordion"]), ...baseProps },
    });
    const accRow = wrapper.findAll("button").find((b) => b.text().includes("accordion-item"));
    expect(accRow!.text()).toContain("Live");
    const containerRow = wrapper.findAll("button").find((b) => b.text().includes("container"));
    expect(containerRow!.text()).not.toContain("Live");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/app/components/ComponentTree.test.ts -t "-item groups"`
Expected: FAIL — `accordion-item` shows no pill (`previewComponents.has("accordion-item")` is false).

- [ ] **Step 3: Wire the helper into `hasPreview`**

In `src/app/components/ComponentTree.vue`, add the import after the existing imports (near line 9-10):

```ts
import { groupHasPreview } from "../preview-component.js";
```

Replace `hasPreview` (ComponentTree.vue:42-46):

```ts
function hasPreview(path: string): boolean {
  if (props.depth !== 0) return false;
  const component = path.split("/")[0] ?? path;
  return groupHasPreview(component, props.previewComponents ?? new Set());
}
```

- [ ] **Step 4: Run — expect PASS (new + existing ComponentTree tests)**

Run: `npx vitest run src/app/components/ComponentTree.test.ts`
Expected: PASS (the existing pill / liveOnly tests still pass — `button`/`card` are unaffected by the strip).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ComponentTree.vue src/app/components/ComponentTree.test.ts
git commit -m "fix(app): ComponentTree Live pill recognises -item groups (accordion/nav)"
```

---

## Task 3: App.vue routes + counts `-item` groups

**Files:**
- Modify: `src/app/App.vue`
- Test: `src/app/App.preview-routing.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/app/App.preview-routing.test.ts` (reuses its harness + name-emitting `Live*` stubs):

```ts
describe("App preview routing — -item group aliasing", () => {
  it.each([
    ["accordion-item", "live-accordion"],
    ["nav-item", "live-nav"],
  ])("routes the %s group to %s", async (groupLabel, expected) => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");            // Chain 2 (no node selected)
    tree.vm.$emit("select-component", groupLabel);
    await flushPromises();
    expect(wrapper.find(`[data-testid="${expected}"]`).exists()).toBe(true);
    expect(wrapper.find('[data-testid="live-button"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/app/App.preview-routing.test.ts -t "-item group aliasing"`
Expected: FAIL — `select-component("accordion-item")` sets `selectedComponent = "accordion-item"`, `previewSupported` is false, so no `live-accordion` renders.

- [ ] **Step 3: Wire the helper into App.vue**

Add the import near the other `./` imports (after App.vue:47, with the composables):

```ts
import { previewComponentForGroup, groupHasPreview } from "./preview-component.js";
```

Change the `@select-component` handler (App.vue:729-732):

```html
                  @select-component="(name: string) => {
                    selectedComponent = previewComponentForGroup(name, COMPONENTS_WITH_PREVIEW);
                    state.selection.value = null;
                  }"
```

Change the `liveCount` filter (App.vue:189-190):

```ts
  return componentSection.tree.filter(
    (node) => node.kind === "group" && groupHasPreview(node.label, COMPONENTS_WITH_PREVIEW),
  ).length;
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/app/App.preview-routing.test.ts`
Expected: PASS (the new aliasing cases + all existing routing cases — `accordion`/`nav` direct names still route, since `previewComponentForGroup` returns them unchanged).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: All green. Record the exact total test count for the release note.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/App.preview-routing.test.ts
git commit -m "fix(app): route accordion-item/nav-item groups to their live preview + Live count"
```

- [ ] **Step 7: Manual confirm in the browser (dev server already running on :5175)**

Reload `http://localhost:5175/`, re-upload `assets/tokens-20260615-161948.zip`, click the `accordion-item` group. Expect `LiveAccordion` to render (it will likely show the `size-5` item collapse and missing bg — that's the deferred recipe bug, confirming the routing now works). Repeat for `nav-item` → `LiveNav`. Note observations for the follow-up recipe cycle. (Verification only — no code change here.)

---

## Task 4: Release v0.28.7

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: Add the CHANGELOG entry** (use `Edit`, never `Write`; insert below `# Changelog`)

```markdown
## [0.28.7] — 2026-06-15

### Fixed

- **`accordion` / `nav` live previews were unreachable** — their tokens are prefixed
  `accordion-item-*` / `nav-item-*`, so the token tree grouped them as `accordion-item` /
  `nav-item`, which didn't match the `accordion` / `nav` keys in `COMPONENTS_WITH_PREVIEW`.
  Clicking those groups showed no preview, no "Live" pill, and they were missed by the Live
  count. A shared `previewComponentForGroup` helper now maps a `<comp>-item` group to its
  preview component at all three seams (selection routing, the "Live" pill / `liveOnly`
  filter, and the Live count). Overlay / layout / typography groups are untouched.

### Notes

- The accordion recipe still has two latent issues that this fix makes visible (the
  `accordion-item-icon-size` token landing on `slots.item` as `size-5`, and a dropped
  `accordion-item-bg`); those change emitted output and are a separate follow-up.
```

- [ ] **Step 2: Bump the README test count**

`README.md:248` reads `757 tests …`. Replace `757` with the exact total from Task 3 Step 5.

- [ ] **Step 3: Bump version, commit, tag**

```bash
npm version 0.28.7 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.7 — accordion/nav preview routing fix"
git tag v0.28.7
```

- [ ] **Step 4: Merge to main, push (clawdbot3535 account), publish release**

```bash
git checkout main
git merge --ff-only fix/accordion-nav-preview-routing
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.28.7
gh release create v0.28.7 --repo clawdbot3535/token-inspector \
  --title "v0.28.7 — accordion/nav preview routing fix" \
  --notes "Fix: accordion/nav live previews were unreachable because their tokens are prefixed accordion-item-*/nav-item-*, grouping them as accordion-item/nav-item which didn't match the accordion/nav preview keys. A shared previewComponentForGroup helper maps <comp>-item groups to their preview at all three seams (routing, Live pill/liveOnly, Live count). Overlay/layout/typography groups untouched. Latent accordion recipe bugs (size-5 icon-size on the item, dropped bg) are a documented follow-up."
gh auth switch --user d56de
git branch -d fix/accordion-nav-preview-routing
```

- [ ] **Step 5: Update memory**

Update `component-previews.md`: accordion/nav previews now reachable via `previewComponentForGroup` (`*-item` group→preview alias), and record the deferred accordion recipe bugs (icon-size→item `size-5`, dropped bg) for the next cycle. Bump the test count in `MEMORY.md`.

---

## Self-Review

**Spec coverage:** helper (Task 1), pill/liveOnly via `hasPreview` (Task 2), routing + Live count (Task 3), all using the one shared helper; deferred recipe bugs noted, not implemented; `input`/`selectmenu` untouched (not `-item` groups). All present.

**Placeholder scan:** No TBD/TODO. All code blocks concrete; Task 3 Step 7 is a verification step, not an implementation gap.

**Type/name consistency:** `previewComponentForGroup(label, previewSet)` / `groupHasPreview(label, previewSet)` signatures identical across module, ComponentTree, and App.vue. Import path `./preview-component.js` from `src/app/`, `../preview-component.js` from `src/app/components/`. Test stubs (`live-accordion`, `live-nav`, `live-button`) match the existing `App.preview-routing.test.ts` name-emitting stubs.

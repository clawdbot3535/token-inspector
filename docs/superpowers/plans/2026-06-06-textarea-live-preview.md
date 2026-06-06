# textarea live preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `textarea` live preview by generalising `LiveInput` to render a `<textarea>` (no icons) when `componentName === "textarea"`, and wiring it into `App.vue`.

**Architecture:** `textarea`'s recipe base is structurally identical to `input` (ring-framed, same state prefixes) with no icon-size token and no emitted `min-height`/`resize`, so the existing `LiveInput` pipeline (recipe → `projectToState` → `extractArbitrary` → inline styles) covers it. Task 1 generalises `LiveInput` (TDD). Task 2 wires `App.vue` (`COMPONENTS_WITH_PREVIEW` + both mount gates).

**Tech Stack:** Vue 3 SFCs, Vitest + `@vue/test-utils` + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/textarea-live-preview` (spec committed at `1ce65ad`).

**Spec:** `docs/superpowers/specs/2026-06-06-textarea-live-preview-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` files — get arities/props right by hand.
- JIT pitfall: the preview MUST resolve recipe classes to inline styles via `extractArbitrary` (already done by `LiveInput`); never rely on Tailwind JIT for dynamically-bound classes. No new `extract-arbitrary` entries are needed here (the textarea base uses only families `input` already exercises).
- `LiveInput` already takes `componentName` (default `"input"`) and drives `buildComponentRecipes`/`hasIcons`/`stateCells` from it — only the rendered element and the aria-label are input-specific.

---

### Task 1: Generalise `LiveInput` to render `<textarea>`

**Files:**
- Modify: `src/app/components/LiveInput.vue` (script: add `multiline`; template: swap the input element; generalise the aria-label)
- Test: `src/app/components/LiveInput.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/components/LiveInput.test.ts`, add a textarea graph builder (after `inputGraph()`):

```typescript
// Minimal textarea graph: ring-framed border states (no icon-size token, no
// height — textarea height comes from rows, and min-height/resize are unmapped).
function textareaGraph() {
  const global = {
    textarea: {
      border: { $value: "#D4D4D8", $type: "color" },
      "border-hover": { $value: "#A1A1AA", $type: "color" },
      "border-focus": { $value: "#3B82F6", $type: "color" },
      "bg-disabled": { $value: "#F4F4F5", $type: "color" },
      "border-disabled": { $value: "#E4E4E7", $type: "color" },
      "padding-x": { $value: 6, $type: "number" },
      "padding-y": { $value: 8, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
```

And add these tests inside the `describe("LiveInput", …)` block:

```typescript
  it("renders a <textarea> (not <input>) per state for componentName='textarea'", () => {
    const wrapper = mount(LiveInput, {
      props: { graph: textareaGraph(), componentName: "textarea" },
      ...mountOpts,
    });
    const areas = wrapper.findAll("textarea");
    expect(areas.length).toBe(4); // default / hover / focus / disabled
    expect(wrapper.findAll("input")).toHaveLength(0);
    // Ring states resolve to distinct inline boxShadows (JIT-class regression guard).
    const boxShadows = new Set(areas.map((t) => t.element.style.boxShadow));
    expect(boxShadows.size).toBeGreaterThanOrEqual(3);
  });

  it("disables resize and reserves no icon padding for textarea (no icon-size token)", () => {
    const wrapper = mount(LiveInput, {
      props: { graph: textareaGraph(), componentName: "textarea" },
      ...mountOpts,
    });
    const areas = wrapper.findAll("textarea");
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.every((t) => (t.element as HTMLTextAreaElement).style.resize === "none")).toBe(true);
    // No icons → padding stays the recipe value (px-1.5 → 0.375rem), not the 2rem icon reservation.
    expect(areas.every((t) => t.element.style.paddingLeft === "0.375rem")).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/LiveInput.test.ts`
Expected: FAIL — `LiveInput` always renders `<input>`, so `wrapper.findAll("textarea")` is empty.

- [ ] **Step 3: Add the `multiline` flag**

In `src/app/components/LiveInput.vue`, in `<script setup>`, after the `props` definition (the `withDefaults(...)` block, ~line 36), add:

```typescript
// textarea is input as a multi-line element: same recipe pipeline, different
// rendered tag and no icons. Derive the element kind from the component name.
const multiline = computed(() => props.componentName === "textarea");
```

(`computed` is already imported on line 2.)

- [ ] **Step 4: Swap the rendered element + generalise the aria-label**

In the template, replace the single `<input>` element (currently ~lines 184–191):

```vue
            <input
              type="text"
              placeholder="Placeholder"
              :aria-label="`Input preview — ${cell.label} state`"
              :class="[cell.inputClasses, 'w-full']"
              :style="cell.style"
              :disabled="cell.label === 'disabled'"
            />
```

with a `v-if`/`v-else` pair (the surrounding `.relative.inline-flex` wrapper and the leading/trailing `UIcon`s stay unchanged — icons render only when `hasIcons`):

```vue
            <textarea
              v-if="multiline"
              rows="3"
              placeholder="Placeholder"
              :aria-label="`${componentName} preview — ${cell.label} state`"
              :class="[cell.inputClasses, 'w-full']"
              :style="{ ...cell.style, resize: 'none' }"
              :disabled="cell.label === 'disabled'"
            />
            <input
              v-else
              type="text"
              placeholder="Placeholder"
              :aria-label="`${componentName} preview — ${cell.label} state`"
              :class="[cell.inputClasses, 'w-full']"
              :style="cell.style"
              :disabled="cell.label === 'disabled'"
            />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/LiveInput.test.ts`
Expected: PASS — textarea renders four `<textarea>` cells, no `<input>`, distinct ring boxShadows, `resize:none`, recipe padding. The existing `input` tests still pass (input path unchanged; aria-label text differs but no test asserts it).

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/LiveInput.vue src/app/components/LiveInput.test.ts
git commit -m "feat(preview): LiveInput renders <textarea> for the textarea component"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: Wire the textarea preview into `App.vue`

**Files:**
- Modify: `src/app/App.vue` (`COMPONENTS_WITH_PREVIEW` ~line 129; a `isFieldComponent` computed; both `LiveInput` mount gates ~lines 659 and 721)

- [ ] **Step 1: Register textarea + add the field predicate**

In `src/app/App.vue`, change the preview set (~line 129):

```typescript
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input"]);
```
to:
```typescript
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input", "textarea"]);
// input + textarea are the form-field previews (rendered by LiveInput); button
// is rendered by LiveButton.
const FIELD_PREVIEW_COMPONENTS: ReadonlySet<string> = new Set(["input", "textarea"]);
const isFieldComponent = computed(() => FIELD_PREVIEW_COMPONENTS.has(selectedComponent.value));
```

(`computed` and `selectedComponent` are already in scope — `previewSupported` on the next line already uses `selectedComponent.value`.)

- [ ] **Step 2: Broaden the first `LiveInput` mount gate (token-selected block)**

Find the first `<LiveInput>` (~line 659). Change its `v-if` from:
```
                v-if="
                  previewSupported &&
                  selectedComponent === 'input' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
```
to:
```
                v-if="
                  previewSupported &&
                  isFieldComponent &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
```

- [ ] **Step 3: Broaden the second `LiveInput` mount gate (component-selected block)**

Find the second `<LiveInput>` (~line 721). Change its `v-if` from:
```
                v-if="previewSupported && selectedComponent === 'input'"
```
to:
```
                v-if="previewSupported && isFieldComponent"
```

(Both `v-else-if="… LiveButton"` branches are unchanged — with `isFieldComponent` covering input/textarea, the `LiveButton` else-if now only fires for `button`.)

- [ ] **Step 4: Typecheck + full suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: PASS (no unit test for App.vue wiring; build confirms the template compiles).

- [ ] **Step 5: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(preview): wire textarea into the live-preview gates + Live pill"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Headless QA (the app ingests the committed `components/*.tokens.json`): start `npm run dev`, load the app, select the `textarea` component in the sidebar; confirm:
  - a multi-line `<textarea>` preview renders across `default`/`hover`/`focus`/`disabled`,
  - no leading/trailing icons,
  - the sidebar shows the `Live` pill on `textarea`,
  - console is clean.
  Screenshot for the record. Restore/stop the dev server after.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** `multiline` + element swap + aria-label (Task 1, steps 3–4); `COMPONENTS_WITH_PREVIEW` + `isFieldComponent` + both gates (Task 2); textarea/no-icon/states tests (Task 1, step 1). All spec items mapped.
- **Type consistency:** `multiline`/`isFieldComponent` are `ComputedRef<boolean>`; `FIELD_PREVIEW_COMPONENTS` mirrors the `ReadonlySet<string>` typing of `COMPONENTS_WITH_PREVIEW`.
- **No placeholders:** every step has full code, exact command, expected result.
- **Disjoint:** Task 1 is unit-tested and self-contained; Task 2 is wiring verified by typecheck+build+headless. The `input` and `button` paths are untouched in behaviour.

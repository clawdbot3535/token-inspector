# Stage C — `custom/<name>` emit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route components flagged `component-looks-custom` out of the misleading `ui:` block in `app.config.ts` and into a dedicated `custom-components.ts` artifact that captures their full anatomy — sub-element slots (`label`, `close`) and reconstructed `color`/`size` variants — as dependency-free recipe objects the dev team hand-implements via `tv()`.

**Architecture:** The detector (Stage B) already flags custom components and computes their *foreign* part-segments. We expose those parts on the scan issue, then a new `buildCustomRecipes` computes a per-token `slotMappingOverride` map (using a new permissive `extraSlots` grammar primitive plus a trailing-color-role normalization) and **delegates all recipe assembly to the existing `buildComponentRecipes`** — inheriting ring-pairing, size-default redirect, icon-mirror, and dedup/sort for free. A new `customComponentsRenderer` emits the recipes; `app-config.ts` skips flagged components and leaves a pointer comment.

**Tech Stack:** TypeScript (strict), Vitest, Vue 3 SPA, `@tg/grammar` workspace package, `tsx` build CLI.

---

## Reference: real `chip` tokens (the live test target)

From `components/*.tokens.json`, `chip` carries these ids (the only component that fires the flag today):

```
Base props:      chip-bg chip-border chip-font-size chip-font-weight chip-gap
                 chip-letter-spacing chip-line-height chip-padding-x chip-padding-y
                 chip-radius chip-ring-offset
Base + state:    chip-bg-active chip-bg-hover chip-bg-disabled
                 chip-border-active chip-border-disabled
Base + color:    chip-bg-error chip-bg-success chip-border-error chip-border-success
Sub-element label: chip-label-text chip-label-text-active chip-label-text-disabled
                   chip-label-text-error chip-label-text-success
Sub-element close: chip-close-icon-size chip-close-icon-color chip-close-icon-color-hover
Known-unmapped:  chip-border-focus-ring (utility "border-focus-ring" — no rule)
                 chip-close-icon-color / -hover (utility "icon-color" — no rule)
```

`chip`'s Nuxt slots are `{root, base}` (see `component-vocab.ts`), so its foreign parts are `{label, close}`. `chip` is a ring-framed component, so `chip-border*` emits `ring-*`.

**Expected `chipRecipe` after this plan** (exact class strings vary with the real palette; assert structure + one concrete class):
- `slots.base` — resting bg/ring/rounded/text/padding/gap classes incl. `active:`/`hover:`/`disabled:` prefixes
- `slots.label` — `text-[…]` resting + `active:`/`disabled:` prefixes
- `slots.close` — `size-[…]` (the icon-size; icon-color stays unmapped)
- `variants.color.error.base`, `variants.color.success.base` — `bg-[…]` / `ring-[…]`
- `variants.color.error.label`, `variants.color.success.label` — `text-[…]`

---

## File Structure

- **Modify** `packages/grammar/src/slot-mapping.ts` — add optional `extraSlots` param to `heuristicSlotMapping` + `getSlotMapping` (Task 1).
- **Create** `src/custom-recipe-engine.ts` — `normalizeTrailingColorRole` + `buildCustomRecipes` (Tasks 2–3).
- **Modify** `src/scanner.ts` + `src/token-graph.ts` — expose `customParts` on the issue; add `customPartsByComponent(report)` selector (Task 4).
- **Create** `src/renderers/custom-components.ts` — `customComponentsRenderer` (Task 5).
- **Modify** `src/renderers/app-config.ts` — `customComponents` option: skip + pointer comment (Task 6).
- **Modify** `src/renderers/index.ts`, `scripts/build-cli.ts`, `src/app/state.ts`, `src/app/App.vue` — wiring (Task 7).
- **Test** alongside each: `packages/grammar/src/slot-mapping.test.ts`, `src/custom-recipe-engine.test.ts`, `src/scanner.test.ts`, `src/renderers/renderers.test.ts`.

---

## Task 1: Grammar — permissive `extraSlots` on `heuristicSlotMapping`

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts:407-447`
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `slot-mapping.test.ts`:

```ts
import { heuristicSlotMapping, getSlotMapping } from "./slot-mapping.js";

describe("extraSlots (custom sub-element routing)", () => {
  it("routes a foreign sub-element segment to its own slot when passed in extraSlots", () => {
    const m = heuristicSlotMapping("chip-label-text", "color", new Set(["label", "close"]));
    expect(m).not.toBeNull();
    expect(m!.slot).toBe("label");
    expect(m!.utilityType).toBe("text-color");
  });

  it("routes a close-icon size to the close slot", () => {
    const m = heuristicSlotMapping("chip-close-icon-size", undefined, new Set(["label", "close"]));
    expect(m).not.toBeNull();
    expect(m!.slot).toBe("close");
    expect(m!.utilityType).toBe("icon-size");
  });

  it("is regression-free: without extraSlots a foreign part stays null", () => {
    expect(heuristicSlotMapping("chip-label-text", "color")).toBeNull();
  });

  it("getSlotMapping threads extraSlots through", () => {
    const m = getSlotMapping("chip-label-text", undefined, "color", new Set(["label"]));
    expect(m?.slot).toBe("label");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t extraSlots`
Expected: FAIL — `heuristicSlotMapping` takes 2 args; 3rd is ignored, foreign part returns null.

- [ ] **Step 3: Implement the `extraSlots` param**

In `packages/grammar/src/slot-mapping.ts`, replace `heuristicSlotMapping` (currently lines 407–432):

```ts
export function heuristicSlotMapping(
  tokenId: string,
  // TokenType in practice (e.g. "color"); typed as string to keep this module a pure id-based classifier with no domain-type coupling.
  valueType?: string,
  // Custom-component sub-element segments to treat as routable slots (in
  // addition to the component's Nuxt slots). Empty/omitted → today's behaviour.
  extraSlots?: ReadonlySet<string>,
): SlotMappingEntry | null {
  const parsed = parseSegments(tokenId);
  if (!parsed) return null;

  // 1) Normal mapping — no sub-element routing. icon-size and every existing
  //    rule win here, so this path is regression-free.
  const normal = matchParsed(parsed, valueType);
  if (normal) return normal;

  // 2) Fallback: route a leading segment that EXACTLY matches a routable slot of
  //    this component — its Nuxt slots, plus any custom extraSlots. No aliasing —
  //    naming mismatches stay null and are surfaced by the unsupported-part hint.
  const nuxt = nuxtSlotsFor(parsed.component);
  const slots =
    extraSlots && extraSlots.size > 0
      ? new Set<string>([...(nuxt ?? []), ...extraSlots])
      : nuxt;
  if (slots && slots.size > 0) {
    const routed = parseSegments(tokenId, slots);
    if (routed && routed.slotPrefix !== null) {
      const m = matchParsed(routed, valueType);
      if (m) return m;
    }
  }
  return null;
}
```

Then thread it through `getSlotMapping` (currently lines 438–447):

```ts
export function getSlotMapping(
  tokenId: string,
  override?: SlotMappingOverride,
  valueType?: string,
  extraSlots?: ReadonlySet<string>,
): SlotMappingEntry | null {
  if (override && Object.prototype.hasOwnProperty.call(override, tokenId)) {
    return override[tokenId] ?? null;
  }
  return heuristicSlotMapping(tokenId, valueType, extraSlots);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS — all prior tests still green (regression-free) + 4 new.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "feat(grammar): extraSlots param routes custom sub-element segments to slots"
```

---

## Task 2: Custom builder — `normalizeTrailingColorRole`

A trailing color-role segment (`chip-bg-error`) is not parsed as a color variant by the grammar (it only recognizes a *2nd*-segment color-role). Move a trailing `COLOR_ROLE_KEY` to the 2nd position so the existing grammar maps it to `variants.color`.

**Files:**
- Create: `src/custom-recipe-engine.ts`
- Test: `src/custom-recipe-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { normalizeTrailingColorRole } from "./custom-recipe-engine.js";

describe("normalizeTrailingColorRole", () => {
  it("moves a trailing color-role to the 2nd segment", () => {
    expect(normalizeTrailingColorRole("chip-bg-error")).toBe("chip-error-bg");
    expect(normalizeTrailingColorRole("chip-border-success")).toBe("chip-success-border");
  });
  it("moves a trailing color-role ahead of a sub-element + property", () => {
    expect(normalizeTrailingColorRole("chip-label-text-error")).toBe("chip-error-label-text");
  });
  it("leaves a trailing STATE word untouched", () => {
    expect(normalizeTrailingColorRole("chip-bg-hover")).toBe("chip-bg-hover");
    expect(normalizeTrailingColorRole("chip-label-text-active")).toBe("chip-label-text-active");
  });
  it("leaves a 2nd-segment color-role untouched", () => {
    expect(normalizeTrailingColorRole("button-error-bg")).toBe("button-error-bg");
  });
  it("leaves short ids untouched", () => {
    expect(normalizeTrailingColorRole("chip-bg")).toBe("chip-bg");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/custom-recipe-engine.test.ts`
Expected: FAIL — module/function does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/custom-recipe-engine.ts`:

```ts
// Builds full-fidelity { slots, variants } recipes for components the scanner
// flagged `component-looks-custom`. These diverge from their Nuxt UI counterpart
// (foreign sub-element parts Nuxt has no slot for), so they are emitted to
// custom-components.ts as hand-implementation references, NOT as ui.<name> overrides.
//
// Strategy: compute a per-token slotMappingOverride using a permissive slot set
// (the component's foreign parts) plus a trailing-color-role normalization, then
// DELEGATE assembly to buildComponentRecipes — inheriting ring-pairing, size
// defaulting, icon-mirror, and dedup/sort.

import { COLOR_ROLE_KEYS } from "@tg/grammar";

/**
 * The grammar recognizes a color-role only as the 2nd segment
 * (`button-error-bg`). Figma also names them trailing (`chip-bg-error`).
 * Move a trailing color-role to the 2nd position so the existing grammar
 * maps it to variants.color. A trailing STATE/SIZE word is left untouched
 * (the grammar already handles those as suffixes). No-op when the 2nd
 * segment is already a color-role or the id is too short.
 */
export function normalizeTrailingColorRole(tokenId: string): string {
  const parts = tokenId.split("-");
  if (parts.length < 3) return tokenId;
  const last = parts[parts.length - 1];
  const second = parts[1];
  if (last === undefined || second === undefined) return tokenId;
  if (!COLOR_ROLE_KEYS.has(last)) return tokenId; // trailing state/size/prop — leave it
  if (COLOR_ROLE_KEYS.has(second)) return tokenId; // already 2nd-segment color-role
  const component = parts[0];
  const middle = parts.slice(1, parts.length - 1); // property/sub-element segments
  return [component, last, ...middle].join("-");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/custom-recipe-engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/custom-recipe-engine.ts src/custom-recipe-engine.test.ts
git commit -m "feat(custom): normalizeTrailingColorRole — trailing color-role → 2nd segment"
```

---

## Task 3: Custom builder — `buildCustomRecipes`

**Files:**
- Modify: `src/custom-recipe-engine.ts`
- Test: `src/custom-recipe-engine.test.ts`

- [ ] **Step 1: Write the failing test (real chip via the build graph)**

Add to `src/custom-recipe-engine.test.ts`. This loads the real fixtures so the assertions track live data:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGraph } from "./build-graph.js";
import { buildCustomRecipes } from "./custom-recipe-engine.js";
import type { SourceFile, SourceLayer } from "./token-graph.js";

function realGraph() {
  const dir = resolve(__dirname, "../components");
  const files: ReadonlyArray<{ name: SourceLayer; file: string }> = [
    { name: "color", file: "color.tokens.json" },
    { name: "dimension", file: "dimension.tokens.json" },
    { name: "typography", file: "typography.tokens.json" },
    { name: "light", file: "light.tokens.json" },
    { name: "dark", file: "dark.tokens.json" },
    { name: "global", file: "global.tokens.json" },
  ];
  const sources: SourceFile[] = files.map((s) => ({
    name: s.name,
    data: JSON.parse(readFileSync(resolve(dir, s.file), "utf8")),
  }));
  return buildGraph(sources);
}

describe("buildCustomRecipes", () => {
  it("returns {} when no components are flagged", () => {
    expect(buildCustomRecipes(realGraph(), new Map())).toEqual({});
  });

  it("builds a full-fidelity chip recipe with sub-element slots + color variants", () => {
    const recipes = buildCustomRecipes(
      realGraph(),
      new Map([["chip", ["label", "close"]]]),
    );
    const chip = recipes["chip"];
    expect(chip).toBeDefined();
    // sub-element slots the normal pipeline drops:
    expect(chip.slots.base).toBeTypeOf("string");
    expect(chip.slots.label).toBeTypeOf("string");
    expect(chip.slots.label).toMatch(/text-\[/);
    expect(chip.slots.close).toMatch(/size-\[/); // icon-size routed to close
    // reconstructed color variants from trailing color-roles:
    expect(chip.variants.color?.error?.base).toBeTypeOf("string");
    expect(chip.variants.color?.error?.label).toMatch(/text-\[/);
    expect(chip.variants.color?.success?.base).toBeTypeOf("string");
  });

  it("only builds the flagged components", () => {
    const recipes = buildCustomRecipes(realGraph(), new Map([["chip", ["label", "close"]]]));
    expect(Object.keys(recipes)).toEqual(["chip"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/custom-recipe-engine.test.ts -t buildCustomRecipes`
Expected: FAIL — `buildCustomRecipes` not exported.

- [ ] **Step 3: Implement `buildCustomRecipes`**

Append to `src/custom-recipe-engine.ts`:

```ts
import type { TokenGraph } from "./token-graph.js";
import {
  buildComponentRecipes,
  type ComponentRecipe,
} from "./recipe-engine.js";
import { getSlotMapping, type SlotMappingOverride } from "@tg/grammar";

export interface BuildCustomRecipesOptions {
  defaultSizeByComponent?: Readonly<Record<string, string>>;
  remBase?: number;
}

/**
 * Build full-fidelity recipes for flagged-custom components.
 *
 * For each (component → foreign parts) entry we precompute a slotMappingOverride
 * for every one of that component's tokens — using normalizeTrailingColorRole +
 * the permissive `extraSlots` heuristic — then delegate the actual slot/variant
 * assembly to buildComponentRecipes. The override is keyed by the ORIGINAL token
 * id, so value resolution and class emission run on the real node; only the
 * (slot, utilityType, variant axis/key, statePrefix) decision is ours.
 */
export function buildCustomRecipes(
  graph: TokenGraph,
  partsByComponent: ReadonlyMap<string, ReadonlyArray<string>>,
  options: BuildCustomRecipesOptions = {},
): Record<string, ComponentRecipe> {
  const out: Record<string, ComponentRecipe> = {};

  for (const [component, parts] of partsByComponent) {
    const extraSlots = new Set(parts);
    const override: Record<string, ReturnType<typeof getSlotMapping>> = {};

    for (const node of graph.nodes.values()) {
      if (node.layer !== "component") continue;
      if (node.id.split("-")[0] !== component) continue;
      const normId = normalizeTrailingColorRole(node.id);
      const entry = getSlotMapping(normId, undefined, node.type, extraSlots);
      // Key by the ORIGINAL id; null explicitly skips genuinely-unmappable
      // tokens (e.g. chip-close-icon-color, chip-border-focus-ring).
      override[node.id] = entry;
    }

    const built = buildComponentRecipes(graph, {
      components: [component],
      slotMappingOverride: override as SlotMappingOverride,
      defaultSizeByComponent: options.defaultSizeByComponent,
      remBase: options.remBase,
    });
    const recipe = built[component];
    if (recipe) out[component] = recipe;
  }

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/custom-recipe-engine.test.ts`
Expected: PASS (8 tests total).

If `slots.close`/`variants.color.error.label` assertions fail, debug by logging the override map for chip and confirming `chip-close-icon-size` → `{slot:"close",utilityType:"icon-size"}` and `chip-label-text-error` (normalized `chip-error-label-text`) → `{slot:"label",variantAxis:"color",variantKey:"error",utilityType:"text-color"}`. Do not weaken the assertions — fix the resolution.

- [ ] **Step 5: Commit**

```bash
git add src/custom-recipe-engine.ts src/custom-recipe-engine.test.ts
git commit -m "feat(custom): buildCustomRecipes delegates assembly to buildComponentRecipes via override"
```

---

## Task 4: Scanner — expose `customParts` + selector

**Files:**
- Modify: `src/token-graph.ts` (the `ScanIssue` interface)
- Modify: `src/scanner.ts:287-300` (the `component-looks-custom` push) and add a selector
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/scanner.test.ts` (reuse the file's existing graph-building helper; if it builds from real fixtures, target `chip`):

```ts
import { customPartsByComponent } from "./scanner.js";

it("component-looks-custom issue carries its foreign parts", () => {
  const report = scanGraph(realGraph(), { components: ["chip"] });
  const clc = report.issues.find((i) => i.kind === "component-looks-custom" && i.componentName === "chip");
  expect(clc).toBeDefined();
  expect(clc!.customParts).toEqual(expect.arrayContaining(["label", "close"]));
});

it("customPartsByComponent derives a component→parts map from a report", () => {
  const report = scanGraph(realGraph(), { components: ["chip"] });
  const map = customPartsByComponent(report);
  expect(map.get("chip")).toEqual(expect.arrayContaining(["label", "close"]));
});
```

> Use the same `realGraph()` helper pattern as Task 3 if `scanner.test.ts` doesn't already expose one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/scanner.test.ts -t "foreign parts"`
Expected: FAIL — `customParts` is not on the issue; `customPartsByComponent` not exported.

- [ ] **Step 3a: Add `customParts` to the issue type**

In `src/token-graph.ts`, find the `ScanIssue` interface and add the optional field (place it next to `componentName`):

```ts
  /** For component-looks-custom: the foreign part-segments (sub-element slots). */
  customParts?: readonly string[];
```

- [ ] **Step 3b: Populate it in the scanner**

In `src/scanner.ts`, in the `component-looks-custom` issue push (around line 292), add `customParts: parts` alongside `componentName`:

```ts
    issues.push({
      id: `clc-${comp}`,
      category: "classification-hint",
      severity: "hint",
      kind: "component-looks-custom",
      message:
        `\`${comp}\` has ${parts.length} part${parts.length > 1 ? "s" : ""} with no Nuxt UI ` +
        `\`${comp}\` slot and no rename match (${parts.join(", ")}). It is likely a custom ` +
        `component — consider emitting it as \`custom/${comp}\` rather than \`ui.${comp}\`.`,
      tokenIds: [...foreign.values()].flat(),
      componentName: comp,
      customParts: parts,
    });
```

- [ ] **Step 3c: Add the selector**

At the end of `src/scanner.ts` (module scope), add:

```ts
/**
 * Derive a component → foreign-parts map from a scan report. Drives the
 * custom-components renderer (Stage C). Empty when nothing is flagged.
 */
export function customPartsByComponent(
  report: { issues: ReadonlyArray<ScanIssue> },
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const i of report.issues) {
    if (i.kind !== "component-looks-custom") continue;
    if (i.componentName === undefined || i.customParts === undefined) continue;
    out.set(i.componentName, [...i.customParts]);
  }
  return out;
}
```

Ensure `ScanIssue` is imported in `scanner.ts` (it almost certainly already is).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — new tests green, existing scanner tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/token-graph.ts src/scanner.test.ts
git commit -m "feat(scan): expose customParts on component-looks-custom + customPartsByComponent selector"
```

---

## Task 5: `customComponentsRenderer` → `custom-components.ts`

**Files:**
- Create: `src/renderers/custom-components.ts`
- Test: `src/renderers/renderers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/renderers/renderers.test.ts`:

```ts
import { customComponentsRenderer } from "./custom-components.js";

describe("customComponentsRenderer", () => {
  it("emits a recipe const per flagged component with sub-element slots", () => {
    const out = customComponentsRenderer.render(realGraph(), {
      customParts: new Map([["chip", ["label", "close"]]]),
    });
    expect(out.text).toContain("export const chipRecipe");
    expect(out.text).toContain("label:");
    expect(out.text).toContain("close:");
    expect(out.text).toContain("variants:");
    expect(out.text).toMatch(/NOT Nuxt UI overrides/);
  });

  it("returns empty text when nothing is flagged", () => {
    const out = customComponentsRenderer.render(realGraph(), { customParts: new Map() });
    expect(out.text).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderers/renderers.test.ts -t customComponentsRenderer`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the renderer**

Create `src/renderers/custom-components.ts`:

```ts
// Renders custom-components.ts — recipe objects for components the scanner
// flagged `component-looks-custom`. These are NOT Nuxt UI overrides; the dev
// team hand-implements each component and applies the recipe via tv().

import type { TextRenderer, TokenGraph, RenderedText } from "../token-graph.js";
import type { ComponentRecipe } from "../recipe-engine.js";
import { buildCustomRecipes } from "../custom-recipe-engine.js";
import { LineBuilder } from "./line-builder.js";

export interface CustomComponentsRendererOptions {
  /** component → foreign parts, from customPartsByComponent(scanReport). */
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  defaultSizeByComponent?: Readonly<Record<string, string>>;
}

interface CustomComponentsRenderer extends TextRenderer {
  render(graph: TokenGraph, options?: CustomComponentsRendererOptions): RenderedText;
}

export const customComponentsRenderer: CustomComponentsRenderer = {
  id: "custom-components.ts",
  render(graph: TokenGraph, options?: CustomComponentsRendererOptions): RenderedText {
    const parts = options?.customParts ?? new Map();
    const recipes = buildCustomRecipes(graph, parts, {
      defaultSizeByComponent: options?.defaultSizeByComponent,
    });
    const names = Object.keys(recipes).sort();
    if (names.length === 0) {
      return new LineBuilder().build(); // empty text + empty line map
    }

    const lb = new LineBuilder();
    lb.push("// Generated by build-cli — custom component recipes.");
    lb.push("// These components diverge from their Nuxt UI counterparts (foreign parts Nuxt");
    lb.push("// has no slot for). They are NOT Nuxt UI overrides — hand-implement each component");
    lb.push("// and apply its recipe via tailwind-variants: const ui = tv(chipRecipe).");
    lb.blank();
    for (const name of names) {
      emitCustomRecipe(lb, name, recipes[name]!);
      lb.blank();
    }
    return lb.build();
  },
};

function emitCustomRecipe(lb: LineBuilder, name: string, recipe: ComponentRecipe): void {
  lb.push(`export const ${name}Recipe = {`);

  const slotEntries = Object.entries(recipe.slots);
  if (slotEntries.length > 0) {
    lb.push("  slots: {");
    for (const [slot, classes] of slotEntries) {
      lb.push(`    ${slot}: ${JSON.stringify(classes)},`);
    }
    lb.push("  },");
  }

  const axes = ["size", "color", "variant"] as const;
  const variantsPresent = axes.some(
    (a) => Object.keys(recipe.variants[a] ?? {}).length > 0,
  );
  if (variantsPresent) {
    lb.push("  variants: {");
    for (const axis of axes) {
      const axisMap = recipe.variants[axis];
      if (!axisMap || Object.keys(axisMap).length === 0) continue;
      lb.push(`    ${axis}: {`);
      for (const variantKey of Object.keys(axisMap).sort()) {
        const slotMap = axisMap[variantKey];
        if (slotMap === undefined) continue;
        lb.push(`      ${variantKey}: {`);
        for (const [slot, classes] of Object.entries(slotMap)) {
          lb.push(`        ${slot}: ${JSON.stringify(classes)},`);
        }
        lb.push("      },");
      }
      lb.push("    },");
    }
    lb.push("  },");
  }

  lb.push("} as const;");
}
```

> Confirm `LineBuilder.build()` on an empty builder returns `{ text: "", lines: [] }` (or equivalent). It is used by `tokens-css.ts`/`app-config.ts`; if an empty build emits a trailing newline, assert `out.text.trim()` in the empty test instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderers/renderers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/custom-components.ts src/renderers/renderers.test.ts
git commit -m "feat(renderers): customComponentsRenderer emits custom-components.ts recipe objects"
```

---

## Task 6: `app-config.ts` — skip flagged components + pointer comment

**Files:**
- Modify: `src/renderers/app-config.ts:28-43` (options), `:88-96` (component loop)
- Test: `src/renderers/renderers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/renderers/renderers.test.ts`:

```ts
import { appConfigRenderer } from "./app-config.js";

describe("appConfigRenderer custom routing", () => {
  it("omits a flagged component from ui: and leaves a pointer comment", () => {
    const withCustom = appConfigRenderer.render(realGraph(), {
      customComponents: new Set(["chip"]),
    }).text;
    expect(withCustom).not.toMatch(/^\s{4}chip: \{/m);
    expect(withCustom).toContain("// chip: looks custom → see custom-components.ts");
  });

  it("is unchanged when no customComponents are passed (regression)", () => {
    const baseline = appConfigRenderer.render(realGraph()).text;
    expect(baseline).toMatch(/^\s{4}chip: \{/m);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderers/renderers.test.ts -t "custom routing"`
Expected: FAIL — `customComponents` option ignored; `chip:` still emitted, no comment.

- [ ] **Step 3: Add the option + skip branch**

In `src/renderers/app-config.ts`, add to `AppConfigRendererOptions`:

```ts
  /**
   * Components flagged `component-looks-custom`. These are routed out of the
   * `ui:` block (they would mis-apply to Nuxt's own component) and emitted to
   * custom-components.ts instead. Each leaves a one-line pointer comment.
   */
  customComponents?: ReadonlySet<string>;
```

In the component loop (currently lines 88–96), replace with:

```ts
    for (const component of COMPONENT_ALLOW_LIST) {
      if (options?.customComponents?.has(component)) {
        lb.push(`    // ${component}: looks custom → see custom-components.ts`);
        continue;
      }
      const recipe = recipes[component];
      if (recipe !== undefined) {
        const componentCompleteness = options?.completeness?.filter(
          (c) => c.component === component,
        );
        emitRecipe(lb, component, recipe, componentCompleteness);
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderers/renderers.test.ts`
Expected: PASS. Existing app-config snapshot tests stay green (no `customComponents` passed there → byte-identical).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/app-config.ts src/renderers/renderers.test.ts
git commit -m "feat(renderers): app-config skips custom components with a pointer comment"
```

---

## Task 7: Wiring — registry, build-cli, web output tab

**Files:**
- Modify: `src/renderers/index.ts`
- Modify: `scripts/build-cli.ts`
- Modify: `src/app/state.ts:66-79`
- Modify: `src/app/App.vue` (output tab list ~910, `useRenderedOutput` call ~104, `downloadAll` ~433)

- [ ] **Step 1: Register + export the renderer**

In `src/renderers/index.ts` add the export (do NOT add it to `defaultRenderers` — it needs options, like `appConfigRenderer` which is also special-cased):

```ts
export { customComponentsRenderer } from "./custom-components.js";
```

- [ ] **Step 2: Wire build-cli**

In `scripts/build-cli.ts`, after `const scanReport = scanGraph(...)` and the existing renders, add:

```ts
import { customComponentsRenderer } from "../src/renderers/custom-components.ts";
import { customPartsByComponent } from "../src/scanner.ts";
```

```ts
const customParts = customPartsByComponent(scanReport);

const appConfigRendered = appConfigRenderer.render(graph, {
  slotMappingOverride: slotMapping.overrides,
  defaultSizeByComponent: slotMapping.defaultSizeByComponent,
  completeness: scanReport.completeness,
  customComponents: new Set(customParts.keys()),
});

// ... existing writeOut for css + app.config ...

if (customParts.size > 0) {
  const customRendered = customComponentsRenderer.render(graph, {
    customParts,
    defaultSizeByComponent: slotMapping.defaultSizeByComponent,
  });
  writeOut("nuxt/custom-components.ts", customRendered.text);
}
```

- [ ] **Step 3: Run the CLI to verify output**

Run: `npm run build:tokens`
Expected: console shows `wrote nuxt/custom-components.ts …`; `output/nuxt/app.config.ts` no longer has a `chip:` block (has the pointer comment); `output/nuxt/custom-components.ts` exists with `export const chipRecipe`.

Verify:
```bash
grep -c "chip: {" output/nuxt/app.config.ts   # expect 0
grep "looks custom" output/nuxt/app.config.ts # expect the pointer comment
grep "chipRecipe" output/nuxt/custom-components.ts
```

- [ ] **Step 4: Commit the CLI wiring + regenerated output**

```bash
git add src/renderers/index.ts scripts/build-cli.ts output/nuxt/app.config.ts output/nuxt/custom-components.ts
git commit -m "feat(build): build-cli emits custom-components.ts + routes custom out of app.config"
```

- [ ] **Step 5: Wire the web output tab — state.ts**

In `src/app/state.ts`, widen the `useRenderedOutput` signature and add a branch. The custom set is derived in App.vue and passed in:

```ts
import { appConfigRenderer, customComponentsRenderer } from "@core/renderers/index.js";

export function useRenderedOutput(
  state: AppState,
  completeness?: Ref<ReadonlyArray<CompletenessScore> | undefined>,
  customParts?: Ref<ReadonlyMap<string, ReadonlyArray<string>> | undefined>,
) {
  return computed<RenderedText | null>(() => {
    const g = state.graph.value;
    if (!g) return null;
    if (state.outputTab.value === appConfigRenderer.id) {
      return appConfigRenderer.render(g, {
        completeness: completeness?.value,
        customComponents: customParts?.value
          ? new Set(customParts.value.keys())
          : undefined,
      });
    }
    if (state.outputTab.value === customComponentsRenderer.id) {
      return customComponentsRenderer.render(g, { customParts: customParts?.value });
    }
    const renderer = defaultRenderers.find((r) => r.id === state.outputTab.value);
    return renderer ? renderer.render(g) : null;
  });
}
```

Widen the `OutputTab` type (search `outputTab` in `state.ts`) to include `"custom-components.ts"`.

- [ ] **Step 6: Wire the web output tab — App.vue**

Derive the custom set and pass it to `useRenderedOutput` (near line 101–106):

```ts
const customParts = computed(() => customPartsByComponent(scanReport.value));
const rendered = useRenderedOutput(
  state,
  computed(() => scanReport.value.completeness),
  customParts,
);
```

Add the import:

```ts
import { customPartsByComponent } from "@core/scanner.js";
```

Make the output-tab list reactive so the custom tab appears only when non-empty (replace the hardcoded array at ~910). Add a computed:

```ts
const outputTabs = computed(() =>
  customParts.value.size > 0
    ? (["tokens.css", "app.config.ts", "custom-components.ts"] as const)
    : (["tokens.css", "app.config.ts"] as const),
);
```

In the template, change `v-for="tab in (['tokens.css', 'app.config.ts'] as const)"` to `v-for="tab in outputTabs"`, and add a label span for the new tab next to the existing two:

```html
                <span
                  v-if="tab === 'custom-components.ts'"
                  class="ml-1 text-[9px] text-muted/60 font-normal"
                >hand-built (not a Nuxt override)</span>
```

Include `custom-components.ts` in `downloadAll` (line 433) when present:

```ts
  const entries = [
    ...defaultRenderers.map((r) => ({
      name: r.id,
      data:
        r.id === appConfigRenderer.id
          ? appConfigRenderer.render(g, {
              completeness: scanReport.value.completeness,
              customComponents: new Set(customParts.value.keys()),
            }).text
          : r.render(g).text,
    })),
    ...(customParts.value.size > 0
      ? [{
          name: customComponentsRenderer.id,
          data: customComponentsRenderer.render(g, { customParts: customParts.value }).text,
        }]
      : []),
  ];
```

Add `customComponentsRenderer` to the `@core/renderers/index.js` import at line 33.

- [ ] **Step 7: Typecheck + run the app gate test**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx vitest run src/app/App.test.ts`
Expected: PASS (the gate smoke test still mounts and loads).

- [ ] **Step 8: Commit the web wiring**

```bash
git add src/app/state.ts src/app/App.vue
git commit -m "feat(inspector): custom-components.ts output tab + download, conditional on flagged components"
```

---

## Task 8: Integration verification + full gate

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: PASS — all prior tests + the new ones (target ≥ 567).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `✓ built` with no type errors.

- [ ] **Step 4: Headless smoke (optional but recommended)**

Use the `/browse` skill (per CLAUDE.md) to load the app, drop the `components/*.tokens.json`, switch to the `custom-components.ts` tab, and confirm `chipRecipe` renders with `label`/`close` slots. Confirm the tab is absent for a token set with no flagged components.

- [ ] **Step 5: Final verification commit (if regenerated output changed)**

```bash
git add -A
git commit -m "chore(stage-c): regenerate output + verify full gate green" || echo "nothing to commit"
```

---

## Known limitations (documented, not bugs)

- `chip-close-icon-color` / `-hover` (utility word `icon-color` — no heuristic rule) and `chip-border-focus-ring` (utility `border-focus-ring`) remain unmapped and are intentionally dropped (the same tokens drop today). The custom recipe still captures the close **size** and all label/base content. A follow-up could add an `icon-color` rule if these prove valuable.
- Trailing color-role reconstruction is scoped to `COLOR_ROLE_KEYS`. Trailing **size** suffixes already route via the grammar's existing size handling and need no normalization.

## Self-Review

- **Spec coverage:** §1 set/data-flow → Task 4 + Task 7. §2 builder → Tasks 1–3. §3 renderer → Task 5. §4 app-config → Task 6. §5 wiring → Task 7. Success criteria (slots incl. label/close, color variants, app.config skip + comment, empty→no file, non-custom unchanged, gate green) → Tasks 3/5/6/7/8. Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows real code grounded in the actual files and the real chip tokens.
- **Type consistency:** `ComponentRecipe` reused throughout; `customParts` is `ReadonlyMap<string, ReadonlyArray<string>>` consistently across scanner selector, builder, renderer, build-cli, and web; `customComponents` is `ReadonlySet<string>` on the app-config option; `extraSlots` is `ReadonlySet<string>` on the grammar fns; renderer id `"custom-components.ts"` matches across registry, state branch, tab list, and download.

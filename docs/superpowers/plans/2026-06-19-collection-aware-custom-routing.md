# collection-aware custom routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read Figma's `com.figma.collectionName` onto each token so `components/custom` drives custom-component membership (augmenting the registry + anatomy heuristic), and warn when the declared collection disagrees with the heuristic.

**Architecture:** `build-graph` stamps `node.collection`. New scanner helpers derive per-component collection + the declared-custom set. `customPartsByComponent` gains an optional declared-custom param (membership-only, never clobbering richer parts). `scanGraph` emits two new hint kinds for disagreements. The single production call site (`App.vue:126`) passes the declared-custom set through.

**Tech Stack:** TypeScript, the inspector core (`src/`), the `@tg/grammar` package, Vitest.

---

## File Structure

- `src/token-graph.ts` — add `collection?: string` to `TokenNode`; type the `com.figma.collectionName` extension key.
- `src/build-graph.ts` — capture `collection` into `DraftNode` + freeze it onto `TokenNode`.
- `src/build-graph.test.ts` — assert capture.
- `src/scanner.ts` — `componentCollections` + `declaredCustomComponents` helpers; `customPartsByComponent` membership param; two disagreement warnings in `scanGraph`.
- `src/scanner.test.ts` — helpers, membership, warnings.
- `src/app/App.vue` — pass `declaredCustomComponents(graph)` at the one call site (line 126).
- `src/renderers/renderers.test.ts` — end-to-end: a declared-custom (Nuxt-analog) component reaches the custom output.

Ordering: Task 1 (node field) → Task 2 (helpers) → Tasks 3/4 (use helpers) → Task 5 (wire + e2e).

---

### Task 1: Capture `collection` onto the graph node

**Files:** Modify `src/token-graph.ts`, `src/build-graph.ts`; Test `src/build-graph.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/build-graph.test.ts`, add (after the existing fixtures/tests; `buildGraph` and `SourceFile` are already imported):

```ts
describe("collection capture (com.figma.collectionName)", () => {
  const customSource: SourceFile = {
    name: "global",
    data: {
      sidebar: {
        width: {
          $type: "number",
          $value: 240,
          $extensions: { "com.figma.collectionName": "components/custom" },
        },
      },
      button: {
        bg: {
          $type: "color",
          $value: { components: [0.1, 0.1, 0.1], hex: "#1a1a1a" },
          $extensions: { "com.figma.collectionName": "components/global" },
        },
      },
      kbd: { bg: { $type: "color", $value: { components: [0, 0, 0], hex: "#000000" } } },
    },
  };

  it("stamps node.collection from $extensions, undefined when absent", () => {
    const graph = buildGraph([customSource]);
    expect(graph.nodes.get("sidebar-width")?.collection).toBe("components/custom");
    expect(graph.nodes.get("button-bg")?.collection).toBe("components/global");
    expect(graph.nodes.get("kbd-bg")?.collection).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/build-graph.test.ts -t "collection capture"`
Expected: FAIL — `node.collection` is `undefined` for all (the field doesn't exist / isn't populated).

- [ ] **Step 3: Type the extension key + add the node field** (`src/token-graph.ts`)

In the `RawToken.$extensions` type, add the collectionName key alongside `com.figma.aliasData`:

```ts
  $extensions?: {
    "com.figma.aliasData"?: FigmaAliasData;
    "com.figma.collectionName"?: string;
    [k: string]: unknown;
  };
```

In the `TokenNode` interface, add after `description?: string;`:

```ts
  /** Figma collection this token was authored in (e.g. "components/custom"), if present. */
  collection?: string;
```

- [ ] **Step 4: Capture it in build-graph** (`src/build-graph.ts`)

In the `DraftNode` interface, add after `description?: string;`:

```ts
  collection?: string;
```

In `assembleNodes`, in the `draft` object literal (the `const draft: DraftNode = { … }` creation), add after `description: token.$description,`:

```ts
    collection: token.$extensions?.["com.figma.collectionName"],
```

In the freeze loop (`nodes.set(id, { … })`), add after `source: d.source,`:

```ts
      collection: d.collection,
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/build-graph.test.ts`
Expected: PASS — the new test + all existing build-graph tests green.

- [ ] **Step 6: Commit**

```bash
git add src/token-graph.ts src/build-graph.ts src/build-graph.test.ts
git commit -m "feat(graph): capture com.figma.collectionName onto TokenNode"
```

NOTE: a pre-commit hook runs full typecheck + the whole vitest suite; expected to pass.

---

### Task 2: `componentCollections` + `declaredCustomComponents` helpers

**Files:** Modify `src/scanner.ts`; Test `src/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scanner.test.ts`, add `componentCollections, declaredCustomComponents` to the existing import from `./scanner.js`, and add (a `makeGraph`/`makeNode` helper already exists in this file; `makeNode` supports the fields used below):

```ts
describe("componentCollections / declaredCustomComponents", () => {
  function gWithCollections() {
    return makeGraph([
      { ...makeNode({ id: "sidebar-width", layer: "component", type: "number", source: "global" }), collection: "components/custom" },
      { ...makeNode({ id: "sidebar-item-text", layer: "component", type: "color", source: "global", base: "#fff" }), collection: "components/custom" },
      { ...makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#000" }), collection: "components/global" },
    ]);
  }

  it("maps each component to its collection", () => {
    const m = componentCollections(gWithCollections());
    expect(m.get("sidebar")).toBe("components/custom");
    expect(m.get("button")).toBe("components/global");
  });

  it("declaredCustomComponents = components in components/custom", () => {
    const set = declaredCustomComponents(gWithCollections());
    expect([...set]).toEqual(["sidebar"]);
  });
});
```

(If `makeNode` does not let you set `collection`, spread it on as shown — `{ ...makeNode({…}), collection: "…" }` — since `TokenNode.collection` is now an optional field.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/scanner.test.ts -t "componentCollections"`
Expected: FAIL — `componentCollections`/`declaredCustomComponents` are not exported (import error / undefined).

- [ ] **Step 3: Implement the helpers** (`src/scanner.ts`)

Add near the top of the file (after the imports / `propDrivenStateForId`), and ensure `TokenGraph` is imported (it already is — `scanGraph` takes it):

```ts
/** Component (token-id prefix) → its Figma collection, from node.collection (uniform per component; last wins). */
export function componentCollections(graph: TokenGraph): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    if (node.collection === undefined) continue;
    const prefix = node.id.split("-")[0];
    if (prefix === undefined) continue;
    out.set(prefix, node.collection);
  }
  return out;
}

/** Components the designer declared custom in Figma (collection === "components/custom"). */
export function declaredCustomComponents(graph: TokenGraph): ReadonlySet<string> {
  const out = new Set<string>();
  for (const [component, collection] of componentCollections(graph)) {
    if (collection === "components/custom") out.add(component);
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/scanner.test.ts -t "componentCollections"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): componentCollections + declaredCustomComponents helpers"
```

---

### Task 3: `customPartsByComponent` membership augmentation

**Files:** Modify `src/scanner.ts`; Test `src/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scanner.test.ts`, add inside the existing `describe("customPartsByComponent …")` area (or a new describe):

```ts
describe("customPartsByComponent — declaredCustom membership", () => {
  it("adds a declared-custom component as a membership-only entry ([] parts)", () => {
    const map = customPartsByComponent({ issues: [] }, new Set(["fancywidget"]));
    expect(map.has("fancywidget")).toBe(true);
    expect([...(map.get("fancywidget") ?? [])]).toEqual([]);
  });

  it("does not clobber a component-looks-custom component's parts", () => {
    const report = { issues: [
      { id: "clc-chip", category: "classification-hint", severity: "hint",
        kind: "component-looks-custom", componentName: "chip", customParts: ["close", "label"],
        message: "", tokenIds: [] },
    ] } as unknown as { issues: ScanIssue[] };
    const map = customPartsByComponent(report, new Set(["chip"]));
    expect([...(map.get("chip") ?? [])].sort()).toEqual(["close", "label"]);
  });

  it("is backward-compatible without the declaredCustom arg", () => {
    expect(customPartsByComponent({ issues: [] }).size).toBe(KNOWN_CUSTOM_COMPONENTS.size);
  });
});
```

(`ScanIssue` and `KNOWN_CUSTOM_COMPONENTS` — import them in the test file if not already; `KNOWN_CUSTOM_COMPONENTS` is exported from `@tg/grammar`, `ScanIssue` from `./token-graph.js`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/scanner.test.ts -t "declaredCustom membership"`
Expected: FAIL — `customPartsByComponent` takes one arg; the 2-arg calls compile (TS structural) but `fancywidget` is not added (membership not implemented).

- [ ] **Step 3: Implement** (`src/scanner.ts`)

Change `customPartsByComponent` to:

```ts
export function customPartsByComponent(
  report: { issues: ReadonlyArray<ScanIssue> },
  declaredCustom?: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const [component, parts] of KNOWN_CUSTOM_COMPONENTS) {
    out.set(component, [...parts]);
  }
  for (const i of report.issues) {
    if (i.kind !== "component-looks-custom") continue;
    if (i.componentName === undefined || i.customParts === undefined) continue;
    out.set(i.componentName, [...i.customParts]);
  }
  // Declared-custom (Figma `components/custom`): add membership-only WITHOUT clobbering
  // a richer parts list from the registry or the anatomy heuristic. Parts deferred ([]).
  for (const component of declaredCustom ?? []) {
    if (!out.has(component)) out.set(component, []);
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/scanner.test.ts -t "customPartsByComponent"`
Expected: PASS — new membership tests + existing customPartsByComponent tests green.

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): customPartsByComponent merges declared-custom membership"
```

---

### Task 4: Disagreement warnings (`collection-anatomy-mismatch`, `custom-without-parts`)

**Files:** Modify `src/scanner.ts`; Test `src/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scanner.test.ts`, add (`scanGraph`, `makeGraph`, `makeNode` in scope):

```ts
describe("scanGraph — collection/anatomy disagreement", () => {
  function clcNode(id: string, collection: string) {
    return { ...makeNode({ id, layer: "component", type: "color", source: "global", base: "#fff" }), collection };
  }

  it("flags a component that looks custom but is declared components/global (chip-like)", () => {
    // chip-close-* is a foreign part for chip (UChip has only root/base) → component-looks-custom
    const graph = makeGraph([clcNode("chip-close-bg", "components/global")]);
    const report = scanGraph(graph, { components: ["chip"] });
    const m = report.issues.find((i) => i.kind === "collection-anatomy-mismatch");
    expect(m).toBeDefined();
    expect(m?.severity).toBe("warning");
    expect(m?.componentName).toBe("chip");
    expect(m?.message).toContain("components/custom");
  });

  it("does NOT flag a looks-custom component already declared components/custom", () => {
    const graph = makeGraph([clcNode("chip-close-bg", "components/custom")]);
    const report = scanGraph(graph, { components: ["chip"] });
    expect(report.issues.find((i) => i.kind === "collection-anatomy-mismatch")).toBeUndefined();
  });

  it("flags a declared-custom component with no derivable parts (custom-without-parts)", () => {
    // fancywidget: no Nuxt analog (nuxtSlotsFor null) + not in registry → no parts
    const graph = makeGraph([clcNode("fancywidget-bg", "components/custom")]);
    const report = scanGraph(graph, { components: ["fancywidget"] });
    const w = report.issues.find((i) => i.kind === "custom-without-parts");
    expect(w).toBeDefined();
    expect(w?.componentName).toBe("fancywidget");
  });
});
```

(Verify during red/green that `chip-close-bg` actually produces a `component-looks-custom` issue for chip in this minimal graph; if the part segment needs to be `close` specifically, adjust the token id to whatever yields a foreign chip part — the existing `customPartsByComponent` chip test at scanner.test.ts:883 shows the working chip fixture; mirror its token id.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/scanner.test.ts -t "collection/anatomy disagreement"`
Expected: FAIL — neither `collection-anatomy-mismatch` nor `custom-without-parts` issues exist yet.

- [ ] **Step 3: Implement** (`src/scanner.ts`)

In `scanGraph`, immediately AFTER the `component-looks-custom` emission loop (the `for (const [comp, nullToks] of nullTokensByComponent)` block ending ~line 300), add:

```ts
  // Cross-check the declared Figma collection against the anatomy heuristic.
  const collections = componentCollections(graph);
  const looksCustom = new Set(
    issues.filter((i) => i.kind === "component-looks-custom").map((i) => i.componentName),
  );
  // Looks custom but declared components/global → likely mis-filed; heuristic wins, we warn.
  for (const comp of looksCustom) {
    if (comp === undefined) continue;
    if (collections.get(comp) === "components/custom") continue; // agreement
    if (!collections.has(comp)) continue; // no collection metadata → nothing to reconcile
    issues.push({
      id: `cam-${comp}`,
      category: "classification-hint",
      severity: "warning",
      kind: "collection-anatomy-mismatch",
      message:
        `\`${comp}\` is in Figma collection \`${collections.get(comp)}\` but has custom parts ` +
        `with no Nuxt \`${comp}\` slot — consider moving it to \`components/custom\`.`,
      tokenIds: [],
      componentName: comp,
    });
  }
  // Declared components/custom but no parts derivable (not in registry, not heuristic-flagged).
  for (const comp of declaredCustomComponents(graph)) {
    if (!allowSet.has(comp)) continue;
    if (KNOWN_CUSTOM_COMPONENTS.has(comp) || looksCustom.has(comp)) continue;
    issues.push({
      id: `cwp-${comp}`,
      category: "classification-hint",
      severity: "warning",
      kind: "custom-without-parts",
      message:
        `\`${comp}\` is declared \`components/custom\` but no foreign parts could be derived — ` +
        `its custom recipe may be empty (part-derivation for components without a Nuxt analog is not yet supported).`,
      tokenIds: [],
      componentName: comp,
    });
  }
```

(`componentCollections`, `declaredCustomComponents` are defined in this file (Task 2); `KNOWN_CUSTOM_COMPONENTS` is already imported; `allowSet` is already in scope in `scanGraph`. `ScanIssue.kind` is typed `string`, so the two new kinds need no type change.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — new disagreement tests + all existing scanner tests green.

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): collection-anatomy-mismatch + custom-without-parts warnings"
```

---

### Task 5: Wire the call site + end-to-end membership test

**Files:** Modify `src/app/App.vue`; Test `src/renderers/renderers.test.ts`

- [ ] **Step 1: Write the failing end-to-end test**

In `src/renderers/renderers.test.ts` (which already imports `scanGraph, customPartsByComponent` and the renderers; add `declaredCustomComponents` to that import), add:

```ts
it("routes a declared-custom (Nuxt-analog) component into the custom output via collection", () => {
  // badge has a Nuxt analog (normally standard); declaring it components/custom must route it to custom.
  const g = makeGraph([
    { ...makeNode({ id: "badge-bg", layer: "component", type: "color", source: "global", base: "#3b82f6" }), collection: "components/custom" },
  ]);
  const report = scanGraph(g, { components: ["badge"] });
  const customParts = customPartsByComponent(report, declaredCustomComponents(g));
  expect(customParts.has("badge")).toBe(true);
});
```

(`makeGraph`/`makeNode` — reuse the helpers already present in `renderers.test.ts`; if absent there, import from a shared test util or inline as in the other test files. The assertion proves the collection → declared-custom → membership chain end-to-end.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/renderers/renderers.test.ts -t "declared-custom"`
Expected: FAIL — without `declaredCustomComponents(g)` wired, `badge` is not in the custom set (it's a standard component, no `component-looks-custom`, not in the registry).

NOTE: This test passes once Tasks 2-3 are in (the helper + membership param exist). It fails only if run before them. Since this is Task 5, it should pass at Step 1 already — if so, it is a regression guard rather than a red driver; that is acceptable. The genuine wiring change is Step 3 (the App.vue call site), which has no unit test (Vue SFC); typecheck + this contract test cover it.

- [ ] **Step 3: Wire the App.vue call site** (`src/app/App.vue`)

Add `declaredCustomComponents` to the import from `@core/scanner.js` (line 54), and change line 126 from:

```ts
const customParts = computed(() => customPartsByComponent(scanReport.value));
```

to:

```ts
const customParts = computed(() =>
  customPartsByComponent(
    scanReport.value,
    state.graph.value ? declaredCustomComponents(state.graph.value) : undefined,
  ),
);
```

(`state.ts:83` consumes the resulting `customParts` ref — no change needed there; it inherits the augmented map.)

- [ ] **Step 4: Run the renderers test + full suite**

Run: `npx vitest run src/renderers/renderers.test.ts && npm test`
Expected: PASS — full suite green (~910 tests; was 900).

- [ ] **Step 5: Commit**

```bash
git add src/app/App.vue src/renderers/renderers.test.ts
git commit -m "feat(app): pass declaredCustomComponents to customPartsByComponent (collection drives custom set)"
```

---

## Self-Review

**1. Spec coverage:**
- Capture collection onto node (spec §1) → Task 1. ✓
- `componentCollections` / `declaredCustomComponents` helpers (spec §2) → Task 2. ✓
- `customPartsByComponent` membership-only merge, no clobber (spec §3) → Task 3. ✓
- `collection-anatomy-mismatch` + `custom-without-parts` warnings (spec §4) → Task 4. ✓
- Wire call site (spec §5) → Task 5 (corrected: only `App.vue:126` calls it; `state.ts:83` consumes the ref). ✓
- Heuristic-wins / no-demote (spec) → Task 4 (mismatch warns, never removes from the set). ✓
- Testing: build-graph, helpers, membership, warnings, end-to-end (spec "Testing") → Tasks 1-5. ✓
- Deferred parts + warning (spec) → Task 4 `custom-without-parts`. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has full code + exact insertion anchors; run steps have commands + expected red/green. Two steps include a "verify the fixture actually triggers component-looks-custom / adjust the token id" note — these are honest fixture-validation instructions (the working chip fixture is referenced at scanner.test.ts:883), not placeholders.

**3. Type consistency:** `collection?: string` is identical on `RawToken.$extensions`, `TokenNode`, and `DraftNode`. `componentCollections(graph): ReadonlyMap<string,string>` and `declaredCustomComponents(graph): ReadonlySet<string>` are used consistently in Tasks 3-5. `customPartsByComponent(report, declaredCustom?: ReadonlySet<string>)` — the optional 2nd param keeps existing 1-arg calls (scanner.test.ts:773/874/883, renderers.test.ts:388/413) compiling unchanged. New issue kinds are plain strings (`ScanIssue.kind: string`). The App.vue call guards `state.graph.value` (nullable) before calling the helper.

No issues found.

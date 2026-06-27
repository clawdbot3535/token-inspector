# Nuxt UI component-vocabulary codegen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the grammar's component slot vocabulary (`NUXT_SLOTS` + `COMPONENT_ALLOW_LIST`) from Nuxt UI's own theme definitions via a codegen script, so a new Figma component that is a Nuxt UI component is auto-supported with no per-component grammar edit. `toast` is the first beneficiary + validation case.

**Architecture:** A codegen script reads the installed `@nuxt/ui` version, fetches that version's theme source files from GitHub for a curated include-list, extracts each theme's `slots` keys via the TypeScript AST, and writes a committed `nuxt-slots.generated.ts`. The grammar composes `NUXT_SLOTS` from the generated base plus a small hand-curated overlay (deliberate deviations, Figma-name→Nuxt-name, custom components). The recipe engine/scanner/renderers are unchanged — they already consume `NUXT_SLOTS`/`COMPONENT_ALLOW_LIST` generically.

**Tech Stack:** TypeScript, `typescript` compiler API (AST), `tsx` (script runner), `gh` CLI (fetch theme files), vitest, the `@tg/grammar` workspace package.

## Global Constraints

- **Reconciliation guard:** the existing **1013-test suite must stay green** — the 16 currently-supported components' recipe/scan behavior must be unchanged. Plus `packages/grammar/src/component-anatomy.test.ts` asserts `anatomy[comp].keys === NUXT_SLOTS[comp]` for the **5 composites** (nav, accordion, modal, table, dropdown); the codegen+overlay MUST keep those 5 composites' slot sets byte-identical, or that test flips.
- **Generated file is committed + deterministic.** Network is used only when the codegen is *run*, never at build/test time.
- **Scope:** slot vocabulary only. Variants (size/color) stay token-naming-driven. Aliases (`FIGMA_NUXT_PART_ALIAS`) + custom components (`KNOWN_CUSTOM_COMPONENTS`) stay hand-curated. `COMPONENT_ANATOMY` is NOT generated. No preview/gallery for new components. Do NOT refresh the canonical `components/` fixture.
- **Target version:** v0.62.0 (minor).
- **Pin:** the codegen fetches theme files at the tag matching the installed `@nuxt/ui` version (read from `node_modules/@nuxt/ui/package.json`; currently `4.7.1` → tag `v4.7.1`).
- **Figma→Nuxt theme-filename map (the only renames):** `nav → navigation-menu`, `dropdown → dropdown-menu`, `radio → radio-group`. All other component names map to `<name>.ts` directly.

---

### Task 1: `extractSlotKeys` — pure slot-name extraction from a theme source

**Files:**
- Create: `packages/grammar/src/extract-theme-slots.ts`
- Test: `packages/grammar/src/extract-theme-slots.test.ts`

**Interfaces:**
- Produces: `export function extractSlotKeys(source: string): string[]` — the top-level `slots` object keys from a Nuxt UI theme source, in source order. Returns `[]` when there is no `slots` block (slotless components like `kbd`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { extractSlotKeys } from "./extract-theme-slots.js";

describe("extractSlotKeys", () => {
  it("extracts slot keys from a function-form theme (export default (o) => ({ slots }))", () => {
    const src = `
      export default (options) => ({
        slots: { root: 'a', title: 'b', description: 'c', progress: 'd' },
        variants: { color: { primary: { root: 'x', icon: 'y' } } },
        defaultVariants: { color: 'primary' },
      });`;
    expect(extractSlotKeys(src)).toEqual(["root", "title", "description", "progress"]);
  });

  it("extracts slot keys from an object-form theme (export default { slots })", () => {
    const src = `export default { slots: { root: 'a', image: 'b' }, variants: {} };`;
    expect(extractSlotKeys(src)).toEqual(["root", "image"]);
  });

  it("returns [] for a slotless theme (only a base string, no slots block)", () => {
    const src = `export default { base: 'inline-flex' };`;
    expect(extractSlotKeys(src)).toEqual([]);
  });

  it("does not pick up variant sub-objects that contain slot-named keys", () => {
    // `root`/`icon` appear inside variants.color.primary but there is no nested
    // property literally named `slots`, so only the top-level slots block is read.
    const src = `export default (o) => ({ slots: { root: 'a' }, variants: { color: { primary: { root: 'x', icon: 'y' } } } });`;
    expect(extractSlotKeys(src)).toEqual(["root"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/grammar/src/extract-theme-slots.test.ts`
Expected: FAIL — cannot find module `./extract-theme-slots.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/grammar/src/extract-theme-slots.ts
import ts from "typescript";

/**
 * Extract the top-level `slots` object keys from a Nuxt UI theme source file.
 * Handles both `export default { slots: {...} }` and the more common
 * `export default (options) => ({ slots: {...} })`. We never evaluate the theme
 * (the option-function + Tailwind strings are irrelevant) — we read the static
 * keys of the FIRST property literally named `slots` whose initializer is an
 * object literal. Returns [] when there is no such block (slotless components).
 */
export function extractSlotKeys(source: string): string[] {
  const sf = ts.createSourceFile("theme.ts", source, ts.ScriptTarget.Latest, true);
  let slots: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (slots) return;
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "slots" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      slots = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!slots) return [];

  const keys: string[] = [];
  for (const prop of slots.properties) {
    const name =
      (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && prop.name;
    if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) keys.push(name.text);
  }
  return keys;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/grammar/src/extract-theme-slots.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/extract-theme-slots.ts packages/grammar/src/extract-theme-slots.test.ts
git commit -m "feat(grammar): extractSlotKeys — read slot names from a Nuxt UI theme source via AST"
```

---

### Task 2: Curated codegen inputs — include-list, name map, overlay

**Files:**
- Create: `packages/grammar/src/nuxt-vocab-curated.ts`
- Test: `packages/grammar/src/nuxt-vocab-curated.test.ts`

**Interfaces:**
- Produces:
  - `export const INCLUDE_LIST: readonly string[]` — the Figma component names to generate vocabulary for (genuine form/display/overlay components; NOT Pro/app-shell/content).
  - `export const FIGMA_THEME_FILE: ReadonlyMap<string, string>` — Figma name → Nuxt theme filename (without `.ts`) for the renames only.
  - `export const SLOT_OVERLAY: ReadonlyMap<string, ReadonlySet<string>>` — deliberate per-component slot-set overrides that win over the generated base (starts with the known `chip` exception; grown during reconciliation in Task 4).
  - `export const ALLOW_LIST_EXTRA: readonly string[]` — components to force into the allow-list beyond the generated set (starts empty).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { INCLUDE_LIST, FIGMA_THEME_FILE, SLOT_OVERLAY } from "./nuxt-vocab-curated.js";

describe("nuxt-vocab-curated", () => {
  it("the include-list covers today's 16 components and adds toast", () => {
    for (const c of ["button","badge","input","textarea","card","modal","kbd","chip","checkbox","radio","switch","nav","dropdown","table","progress","accordion","toast"]) {
      expect(INCLUDE_LIST, c).toContain(c);
    }
  });
  it("excludes Pro / app-shell / content themes", () => {
    for (const c of ["dashboard-sidebar","chat-message","blog-post","prose","auth-form","header","footer"]) {
      expect(INCLUDE_LIST).not.toContain(c);
    }
  });
  it("maps the renamed components to their Nuxt theme filenames", () => {
    expect(FIGMA_THEME_FILE.get("nav")).toBe("navigation-menu");
    expect(FIGMA_THEME_FILE.get("dropdown")).toBe("dropdown-menu");
    expect(FIGMA_THEME_FILE.get("radio")).toBe("radio-group");
    expect(FIGMA_THEME_FILE.get("button")).toBeUndefined(); // identity → no entry
  });
  it("keeps chip as a deliberate {root, base} overlay", () => {
    expect([...SLOT_OVERLAY.get("chip")!].sort()).toEqual(["base","root"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/grammar/src/nuxt-vocab-curated.test.ts`
Expected: FAIL — cannot find module `./nuxt-vocab-curated.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/grammar/src/nuxt-vocab-curated.ts
// Hand-curated inputs to the Nuxt UI vocabulary codegen. Everything Nuxt UI
// itself cannot tell us lives here; the generated slots live in
// nuxt-slots.generated.ts. See docs/superpowers/specs/2026-06-27-component-vocab-codegen-design.md

/** Figma component names to generate vocabulary for — genuine form/display/overlay
 *  components. Excludes Pro/app-shell/content themes (dashboard-*, chat-*, prose, …).
 *  Extend this as the Figma kit grows. */
export const INCLUDE_LIST: readonly string[] = [
  "button", "badge", "input", "textarea", "card", "modal", "kbd", "chip",
  "checkbox", "radio", "switch", "nav", "dropdown", "table", "progress", "accordion",
  "toast", "alert", "tooltip", "popover", "tabs", "select", "breadcrumb", "drawer", "avatar",
];

/** Figma name → Nuxt UI theme filename (without `.ts`), for the few that differ.
 *  Components absent here map to `<name>.ts` directly. */
export const FIGMA_THEME_FILE: ReadonlyMap<string, string> = new Map([
  ["nav", "navigation-menu"],
  ["dropdown", "dropdown-menu"],
  ["radio", "radio-group"],
]);

/** Deliberate per-component slot-set overrides (win over the generated base).
 *  `chip` is intentionally minimal (routed via the custom path). Grown during
 *  reconciliation (Task 4) for any component whose generated set must deviate. */
export const SLOT_OVERLAY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["chip", new Set(["root", "base"])],
]);

/** Components forced into the allow-list beyond the generated set (none today). */
export const ALLOW_LIST_EXTRA: readonly string[] = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/grammar/src/nuxt-vocab-curated.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/nuxt-vocab-curated.ts packages/grammar/src/nuxt-vocab-curated.test.ts
git commit -m "feat(grammar): curated codegen inputs — include-list, name map, slot overlay"
```

---

### Task 3: Codegen script + generated file

**Files:**
- Create: `scripts/gen-nuxt-vocab.ts`
- Create (generated, by running the script): `packages/grammar/src/nuxt-slots.generated.ts`
- Modify: `package.json` (add `"gen:vocab": "tsx scripts/gen-nuxt-vocab.ts"` to scripts)

**Interfaces:**
- Produces (in the generated file): `export const GENERATED_NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>>` (Figma name → slot set) and `export const GENERATED_COMPONENTS: readonly string[]` (the Figma names that had a theme).

- [ ] **Step 1: Write the codegen script**

```ts
// scripts/gen-nuxt-vocab.ts
// Generates packages/grammar/src/nuxt-slots.generated.ts from Nuxt UI's theme
// definitions. Reads the installed @nuxt/ui version, fetches that tag's theme
// source files from GitHub for INCLUDE_LIST, extracts slot keys via the AST, and
// writes a committed, deterministic file. Run: npm run gen:vocab
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { extractSlotKeys } from "../packages/grammar/src/extract-theme-slots.ts";
import { INCLUDE_LIST, FIGMA_THEME_FILE } from "../packages/grammar/src/nuxt-vocab-curated.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(resolve(root, "node_modules/@nuxt/ui/package.json"), "utf8")).version;
const tag = `v${version}`;
console.log(`generating vocab from @nuxt/ui ${tag}`);

function themeSource(figmaName: string): string {
  const file = FIGMA_THEME_FILE.get(figmaName) ?? figmaName;
  const out = execFileSync("gh", ["api", `repos/nuxt/ui/contents/src/theme/${file}.ts?ref=${tag}`, "--jq", ".content"], { encoding: "utf8" });
  return Buffer.from(out.trim(), "base64").toString("utf8");
}

const entries: Array<[string, string[]]> = [];
for (const name of INCLUDE_LIST) {
  const slots = extractSlotKeys(themeSource(name));
  entries.push([name, slots]);
  console.log(`  ${name}: ${slots.length} slot(s)`);
}

const body = entries
  .map(([n, slots]) => `  [${JSON.stringify(n)}, new Set(${JSON.stringify(slots)})],`)
  .join("\n");
const file = `// GENERATED by scripts/gen-nuxt-vocab.ts from @nuxt/ui ${tag} — do not edit by hand.
// Re-run: npm run gen:vocab
export const GENERATED_NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
${body}
]);

export const GENERATED_COMPONENTS: readonly string[] = ${JSON.stringify(entries.map(([n]) => n))};
`;
writeFileSync(resolve(root, "packages/grammar/src/nuxt-slots.generated.ts"), file);
console.log(`wrote packages/grammar/src/nuxt-slots.generated.ts (${entries.length} components)`);
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add: `"gen:vocab": "tsx scripts/gen-nuxt-vocab.ts",`

- [ ] **Step 3: Run the codegen**

Run: `npm run gen:vocab`
Expected: prints `generating vocab from @nuxt/ui v4.7.1`, a per-component slot count for each of the ~25 include-list components, and `wrote packages/grammar/src/nuxt-slots.generated.ts`. The file now exists with `GENERATED_NUXT_SLOTS` + `GENERATED_COMPONENTS`.

- [ ] **Step 4: Sanity-check the generated file**

Run: `grep -c "new Set" packages/grammar/src/nuxt-slots.generated.ts` → expect ~25.
Run: `grep '"toast"' packages/grammar/src/nuxt-slots.generated.ts` → expect a toast entry with root/wrapper/title/description/icon/avatar/actions/progress/close.

- [ ] **Step 5: Typecheck the generated file**

Run: `npm run typecheck`
Expected: PASS (the generated file is valid TS; not yet imported anywhere).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-nuxt-vocab.ts packages/grammar/src/nuxt-slots.generated.ts package.json
git commit -m "feat(grammar): gen:vocab codegen + generated Nuxt UI slot vocabulary"
```

---

### Task 4: Compose `NUXT_SLOTS` from generated + overlay, and RECONCILE

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (the `NUXT_SLOTS` definition at :145, `COMPONENT_ALLOW_LIST`, and `FIGMA_NUXT_PART_ALIAS`)
- Possibly modify: `packages/grammar/src/nuxt-vocab-curated.ts` (grow `SLOT_OVERLAY` during reconciliation)

**Interfaces:**
- Consumes: `GENERATED_NUXT_SLOTS`, `GENERATED_COMPONENTS` (Task 3); `SLOT_OVERLAY`, `ALLOW_LIST_EXTRA` (Task 2).
- Produces: the existing public `NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>>`, `nuxtSlotsFor`, `COMPONENT_ALLOW_LIST` — unchanged signatures, now composed from the generated base.

- [ ] **Step 1: Replace the hand-written `NUXT_SLOTS` with a generated+overlay composition**

In `component-vocab.ts`, add imports at the top:
```ts
import { GENERATED_NUXT_SLOTS, GENERATED_COMPONENTS } from "./nuxt-slots.generated.js";
import { SLOT_OVERLAY, ALLOW_LIST_EXTRA } from "./nuxt-vocab-curated.js";
```
Replace the literal `export const NUXT_SLOTS = new Map([... 15 entries ...]);` (currently at :145) with:
```ts
// Composed: the codegen-derived Nuxt UI slots, with the curated overlay winning
// per component (see nuxt-vocab-curated.ts). Run `npm run gen:vocab` to re-sync
// the generated base after a @nuxt/ui upgrade. Slotless components (empty set,
// e.g. kbd) are EXCLUDED so nuxtSlotsFor() returns undefined for them — matching
// the pre-codegen behavior (kbd was never in the hand-written NUXT_SLOTS).
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [...GENERATED_NUXT_SLOTS.keys(), ...SLOT_OVERLAY.keys()]
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((c) => [c, SLOT_OVERLAY.get(c) ?? GENERATED_NUXT_SLOTS.get(c)!] as const)
    .filter(([, slots]) => slots.size > 0),
);
```

> **Slotless-component note (kbd):** `kbd` has no `slots` block → generated `Set([])`. The `.filter(slots.size > 0)` keeps it OUT of `NUXT_SLOTS` (so `nuxtSlotsFor("kbd")` stays `undefined`, as before), but it remains in `COMPONENT_ALLOW_LIST` via `GENERATED_COMPONENTS` (Step 4) so its bare tokens still route via `COMPONENT_BASE_SLOT`. If a `kbd`/`select`/etc. test flips here, this filter is the first thing to check.
Update `COMPONENT_ALLOW_LIST` to be derived (find its current definition in `app-config.ts` — note it lives there, not in the grammar; see Step 4). For now leave `COMPONENT_ALLOW_LIST` as-is and reconcile it in Step 4.

- [ ] **Step 2: Run the full suite — observe the reconciliation diff**

Run: `npx vitest run`
Expected: most pass; some `slot-mapping`/`recipe-engine`/`component-anatomy` tests for the 16 may FAIL where the generated slot set differs from the old hand-written one. This is the reconciliation surface.

- [ ] **Step 3: Reconcile each failure to green**

For each failing component, compare generated vs the old hand set:
```bash
node -e "const {GENERATED_NUXT_SLOTS:g}=await import('./packages/grammar/src/nuxt-slots.generated.ts'); console.log('nav', [...g.get('nav')])"
```
Decide per difference:
- **Generated is the correct/complete Nuxt set, old entry was an incomplete transcription** → adopt generated (the failing test asserted on the old shape; if the test encodes real behavior, update the test; if it encoded the stale slot list, the new behavior is correct — confirm the recipe output is still sensible).
- **Old set was a deliberate curation** → add that component to `SLOT_OVERLAY` in `nuxt-vocab-curated.ts` with the exact old set (verbatim from the pre-change `component-vocab.ts` git history).
**Hard rule:** the 5 composites (nav, accordion, modal, table, dropdown) MUST end up with their ORIGINAL slot sets — copy them verbatim into `SLOT_OVERLAY` if the generated differs, because `component-anatomy.test.ts` pins them. Re-run `npx vitest run` after each reconciliation until green.

- [ ] **Step 4: Reconcile `COMPONENT_ALLOW_LIST` (in `app-config.ts`)**

The allow-list currently lives in `src/renderers/app-config.ts:51`. Change it to derive from the generated components + extras, keeping the existing 16 present:
```ts
import { GENERATED_COMPONENTS } from "@tg/grammar"; // re-export GENERATED_COMPONENTS + ALLOW_LIST_EXTRA from the grammar index
export const COMPONENT_ALLOW_LIST = [...new Set([...GENERATED_COMPONENTS, ...ALLOW_LIST_EXTRA])] as const;
```
(Add `GENERATED_COMPONENTS` and `ALLOW_LIST_EXTRA` to the grammar's `index.ts` exports.) Run `npx vitest run` — confirm green (the allow-list now includes toast/alert/etc.; extra entries are no-ops without tokens).

- [ ] **Step 5: Add the `desc → description` alias for toast**

In `component-vocab.ts`, find `FIGMA_NUXT_PART_ALIAS` and add `["desc", "description"]` to it. Run `npx vitest run` → green.

- [ ] **Step 6: Run the anatomy mirror guard explicitly**

Run: `npx vitest run packages/grammar/src/component-anatomy.test.ts`
Expected: PASS — confirms the 5 composites' slots are unchanged.

- [ ] **Step 7: Full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (≥1013 tests; the count may rise from the new grammar tests).

- [ ] **Step 8: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/nuxt-vocab-curated.ts packages/grammar/src/index.ts src/renderers/app-config.ts
git commit -m "feat(grammar): compose NUXT_SLOTS + allow-list from generated vocab; reconcile the 16"
```

---

### Task 5: Toast mapping test + dogfood on the real export

**Files:**
- Test: `src/recipe-engine.test.ts` (add a toast case)

**Interfaces:**
- Consumes: the composed `NUXT_SLOTS` with `toast` (Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// in src/recipe-engine.test.ts, add inside an appropriate describe:
it("maps toast tokens to the toast recipe slots (newly-supported component)", () => {
  const graph = makeGraph([
    makeNode({ id: "toast-bg", layer: "component", type: "color", source: "global", base: "#ffffff" }),
    makeNode({ id: "toast-radius", layer: "component", type: "dimension", source: "global", base: "8px" }),
    makeNode({ id: "toast-title-font-weight", layer: "component", type: "number", source: "global", base: "600" }),
    makeNode({ id: "toast-desc-font-size", layer: "component", type: "dimension", source: "global", base: "12px" }),
  ]);
  const recipe = buildComponentRecipes(graph, { components: ["toast"] }).toast;
  expect(recipe).toBeDefined();
  expect(JSON.stringify(recipe?.slots)).toContain("title");       // toast-title-* → title slot
  expect(JSON.stringify(recipe?.slots)).toContain("description"); // toast-desc-* → description slot (alias)
});
```
(Match the exact `makeGraph`/`makeNode` helper signatures already used in `recipe-engine.test.ts`.)

- [ ] **Step 2: Run test to verify it passes (toast is now in the vocab)**

Run: `npx vitest run src/recipe-engine.test.ts -t "toast"`
Expected: PASS. If `description` is missing, the `desc → description` alias (Task 4 Step 5) is not applied — fix the alias.

- [ ] **Step 3: Dogfood on the real June-19 export**

```bash
tmp=$(mktemp -d); unzip -oq assets/tokens-20260619-214856.zip -d "$tmp"
mkdir -p /tmp/toastcheck && cp "$tmp"/*.tokens.json /tmp/toastcheck/ 2>/dev/null || find "$tmp" -name '*.tokens.json' -exec cp {} /tmp/toastcheck/ \;
```
Then write a 6-line throwaway tsx that builds the graph from `/tmp/toastcheck/*.tokens.json` and runs `appConfigRenderer.render(graph, { completeness: [], customComponents: new Set() })`, and `grep "toast:"` the output. Expected: a `toast: { slots: {...}, variants: { color: {...} } }` block with root/title/description/progress + success/error/warning/info color variants. Delete the throwaway after. (Do NOT modify the committed `components/`.)

- [ ] **Step 4: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe): toast tokens map to the toast recipe (newly-supported via codegen)"
```

---

### Task 6: Codegen-sync guard + release

**Files:**
- Test: `packages/grammar/src/nuxt-slots.generated.test.ts`
- Modify: `package.json` (version), `CHANGELOG.md`

**Interfaces:** none new.

- [ ] **Step 1: Write a sync-guard test (the generated file matches a fresh extraction)**

```ts
// packages/grammar/src/nuxt-slots.generated.test.ts
import { describe, it, expect } from "vitest";
import { GENERATED_NUXT_SLOTS, GENERATED_COMPONENTS } from "./nuxt-slots.generated.js";
import { INCLUDE_LIST } from "./nuxt-vocab-curated.js";

describe("nuxt-slots.generated", () => {
  it("covers every include-list component", () => {
    for (const c of INCLUDE_LIST) expect(GENERATED_COMPONENTS, c).toContain(c);
  });
  it("toast has the expected Nuxt UI slots", () => {
    expect([...GENERATED_NUXT_SLOTS.get("toast")!].sort()).toEqual(
      ["actions","avatar","close","description","icon","progress","root","title","wrapper"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run packages/grammar/src/nuxt-slots.generated.test.ts`
Expected: PASS. (If toast slots differ, the generated file is stale → re-run `npm run gen:vocab`.)

- [ ] **Step 3: Full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Bump version + changelog**

Set `package.json` version to `0.62.0`. Prepend a `## [0.62.0] … ### Added` entry to `CHANGELOG.md` describing: vocabulary now codegen'd from Nuxt UI (all include-list components supported, new Figma components auto-mapped via `npm run gen:vocab`), toast supported, reconciliation kept the 16 unchanged, anatomy unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/nuxt-slots.generated.test.ts package.json CHANGELOG.md
git commit -m "chore(release): v0.62.0 — Nuxt UI component-vocabulary codegen + toast support"
```

---

## Notes for the implementer

- **The reconciliation (Task 4 Step 3) is the only investigative step.** Everything else is deterministic. Expect it to be small — the current `NUXT_SLOTS` is already a Nuxt-UI transcription. The 1013-test suite + the anatomy mirror test are your guard; do not declare Task 4 done until both are green.
- **The 5 composites (nav, accordion, modal, table, dropdown) are slot-locked** — if generated differs, copy the original set verbatim into `SLOT_OVERLAY`.
- After all tasks: run the merge/tag/push/GitHub-release cadence (branch `feat/component-vocab-codegen` → main, tag `v0.62.0`, push via the `clawdbot3535` account, then switch back to `d56de`).

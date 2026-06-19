# Capability-Deviation Detectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two scanner warnings that explain why a faithful token won't render in the real Nuxt UI component — `disabled-via-opacity` (Nuxt dims disabled by opacity, not colour) and `resting-shadowed-by-state` (Nuxt's `data-[state=unchecked]:` out-specifies a plain resting colour).

**Architecture:** Two new capability sets in `@tg/grammar` `component-vocab.ts`; two detectors in `scanner.ts`'s non-null-mapping branch (siblings to `state-via-prop`/`unsupported-state`, scan-only). New `ScanIssue.kind` strings — no type change, no recipe/output change.

**Tech Stack:** TypeScript, vitest, `@tg/grammar` workspace. Verified facts: `getSlotMapping("input-bg-disabled")` → `{slot:"base",utilityType:"bg-color",statePrefix:"disabled"}`; `getSlotMapping("switch-bg")` → `{slot:"base",utilityType:"bg-color"}` (no statePrefix); `switch-bg-checked` carries `statePrefix:"data-[state=checked]"`; `nav-link-bg-disabled` → slot `link` (nav not in the set).

---

## File Structure
- **Modify `packages/grammar/src/component-vocab.ts`** — add `OPACITY_DISABLED_COMPONENTS` + `RESTING_STATE_SHADOWED` exported sets.
- **Modify `packages/grammar/src/component-vocab.test.ts`** — membership tests.
- **Modify `src/scanner.ts`** — import the two sets; add a `COLOR_UTILITIES` const; add the two detectors in the non-null mapping branch.
- **Modify `src/scanner.test.ts`** — fires / does-not-fire tests for both detectors.

The capability set is seeded conservatively: `input`/`checkbox`/`switch` are confirmed by the Real-tab deltas; `textarea`/`radio` are the same Nuxt UI component families (UTextarea≈UInput, URadioGroup≈UCheckbox) and dim disabled the same way; `button`/`select` are deliberately excluded (no evidence) to avoid mis-flagging.

---

### Task 1: Capability sets in `@tg/grammar`

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts`
- Test: `packages/grammar/src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test.** In `packages/grammar/src/component-vocab.test.ts`, add to the import (it already imports `STATELESS_COMPONENTS`) the two new names, then add a describe block:

```ts
import { OPACITY_DISABLED_COMPONENTS, RESTING_STATE_SHADOWED } from "./component-vocab.js";

describe("capability-deviation sets", () => {
  it("OPACITY_DISABLED_COMPONENTS covers the form controls Nuxt UI dims via opacity", () => {
    for (const c of ["input", "textarea", "checkbox", "radio", "switch"]) {
      expect(OPACITY_DISABLED_COMPONENTS.has(c)).toBe(true);
    }
    // not a form control → must not be flagged
    expect(OPACITY_DISABLED_COMPONENTS.has("nav")).toBe(false);
    expect(OPACITY_DISABLED_COMPONENTS.has("button")).toBe(false);
  });

  it("RESTING_STATE_SHADOWED contains switch only", () => {
    expect(RESTING_STATE_SHADOWED.has("switch")).toBe(true);
    expect(RESTING_STATE_SHADOWED.has("input")).toBe(false);
  });
});
```
(If `component-vocab.test.ts` imports its symbols from a single `import { … } from "./component-vocab.js"`, add the two names there instead of a second import line.)

- [ ] **Step 2: Run it to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run packages/grammar/src/component-vocab.test.ts -t "capability-deviation sets"`
Expected: FAIL — the two sets aren't exported yet.

- [ ] **Step 3: Add the sets.** In `packages/grammar/src/component-vocab.ts`, right after the `STATELESS_COMPONENTS` export (line ~113), add:

```ts
/** Components whose `disabled` state Nuxt UI v4 dims via opacity (not colour). A `disabled`
 *  COLOUR token maps to `disabled:bg/text-[…]` but never visibly applies, because Nuxt keeps the
 *  resting colours and only reduces opacity. (input/checkbox/switch confirmed by the Real-tab
 *  fidelity diff; textarea/radio are the same Nuxt UI component families. button/select excluded —
 *  no evidence yet.) */
export const OPACITY_DISABLED_COMPONENTS: ReadonlySet<string> = new Set([
  "input",
  "textarea",
  "checkbox",
  "radio",
  "switch",
]);

/** Components whose RESTING colour Nuxt UI v4 drives via a `data-[state=…]` variant (specificity
 *  0,1,1), which out-specifies a plain recipe utility (0,1,0). switch's unchecked track uses
 *  `data-[state=unchecked]:bg-accented`, so the recipe's plain resting `bg-[…]` loses at rest. */
export const RESTING_STATE_SHADOWED: ReadonlySet<string> = new Set(["switch"]);
```

- [ ] **Step 4: Run to verify it passes.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run packages/grammar/src/component-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck` (clean).
```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/component-vocab.test.ts
git commit -m "feat(grammar): OPACITY_DISABLED_COMPONENTS + RESTING_STATE_SHADOWED capability sets"
```

---

### Task 2: The two detectors in the scanner

**Files:**
- Modify: `src/scanner.ts`
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write the failing tests.** In `src/scanner.test.ts` (it has a `makeGraph(nodes, issues)` helper and a `makeNode({id, layer, type, source, base})` helper used by the existing detector tests), add:

```ts
describe("scanGraph — capability-deviation detectors", () => {
  it("flags a disabled colour on an opacity-disabled component (disabled-via-opacity)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-bg-disabled", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const issues = scanGraph(graph, { components: ["input"] }).issues;
    const dvo = issues.filter((i: ScanIssue) => i.kind === "disabled-via-opacity");
    expect(dvo).toHaveLength(1);
    expect(dvo[0]!.severity).toBe("warning");
    expect(dvo[0]!.componentName).toBe("input");
    expect(dvo[0]!.tokenIds).toEqual(["input-bg-disabled"]);
    expect(dvo[0]!.message).toContain("opacity");
  });

  it("does NOT flag disabled-via-opacity for a non-opacity-disabled component or a non-disabled token", () => {
    const graph = makeGraph([
      makeNode({ id: "nav-link-bg-disabled", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
      makeNode({ id: "input-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
    ]);
    const issues = scanGraph(graph, { components: ["nav", "input"] }).issues;
    expect(issues.filter((i: ScanIssue) => i.kind === "disabled-via-opacity")).toHaveLength(0);
  });

  it("flags a resting track colour out-specified by data-state (resting-shadowed-by-state)", () => {
    const graph = makeGraph([
      makeNode({ id: "switch-bg", layer: "component", type: "color", source: "global", base: "#FAFAFA" }),
    ]);
    const issues = scanGraph(graph, { components: ["switch"] }).issues;
    const rss = issues.filter((i: ScanIssue) => i.kind === "resting-shadowed-by-state");
    expect(rss).toHaveLength(1);
    expect(rss[0]!.severity).toBe("warning");
    expect(rss[0]!.componentName).toBe("switch");
    expect(rss[0]!.message).toContain("data-[state=unchecked]");
  });

  it("does NOT flag resting-shadowed-by-state for a stateful switch token or a non-switch resting colour", () => {
    const graph = makeGraph([
      makeNode({ id: "switch-bg-checked", layer: "component", type: "color", source: "global", base: "#5667A7" }),
      makeNode({ id: "input-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
    ]);
    const issues = scanGraph(graph, { components: ["switch", "input"] }).issues;
    expect(issues.filter((i: ScanIssue) => i.kind === "resting-shadowed-by-state")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/scanner.test.ts -t "capability-deviation detectors"`
Expected: FAIL — the detectors don't exist; `disabled-via-opacity` / `resting-shadowed-by-state` arrays are empty.

- [ ] **Step 3: Import the sets + add a colour-utility set.** In `src/scanner.ts`, add `OPACITY_DISABLED_COMPONENTS` and `RESTING_STATE_SHADOWED` to the existing `import { … } from "@tg/grammar";` line (the one already importing `getSlotMapping`, `RING_FRAMED_VARIANTS`, `STATELESS_COMPONENTS`, etc.). Then add a module-level const near the top of the file (next to the other helpers, before `scanGraph`):

```ts
/** Colour utilities whose value Nuxt UI can shadow via opacity / data-state precedence. */
const COLOR_UTILITIES: ReadonlySet<string> = new Set(["bg-color", "text-color", "border-color", "ring-color"]);
```

- [ ] **Step 4: Add the two detectors.** In `scanGraph`, in the non-null mapping branch, find the line `filledSlotsByComponent.set(prefix, fslots);` (right before the `// D2c:` comment). Insert immediately after it:

```ts
    // Capability deviation: disabled colour on a component Nuxt UI dims via opacity (not colour),
    // so the disabled:bg/text override maps but never visibly applies.
    if (
      OPACITY_DISABLED_COMPONENTS.has(prefix) &&
      mapping.statePrefix === "disabled" &&
      COLOR_UTILITIES.has(mapping.utilityType)
    ) {
      issues.push({
        id: `dvo-${node.id}`,
        category: "classification-hint",
        severity: "warning",
        kind: "disabled-via-opacity",
        message:
          `\`${node.id}\` sets a \`disabled\` colour, but Nuxt UI v4 dims \`${prefix}\`'s disabled ` +
          `state via opacity (not colour) — the override is emitted but won't visibly apply.`,
        tokenIds: [node.id],
        componentName: prefix,
      });
    }
    // Capability deviation: a resting colour that Nuxt UI drives via a data-state variant
    // (`data-[state=unchecked]:`, specificity 0,1,1) which out-specifies the recipe's plain utility.
    if (
      RESTING_STATE_SHADOWED.has(prefix) &&
      !mapping.statePrefix &&
      mapping.utilityType === "bg-color" &&
      mapping.slot === "base"
    ) {
      issues.push({
        id: `rss-${node.id}`,
        category: "classification-hint",
        severity: "warning",
        kind: "resting-shadowed-by-state",
        message:
          `\`${node.id}\` sets \`${prefix}\`'s resting track colour as a plain utility, but Nuxt UI v4 ` +
          `drives it via \`data-[state=unchecked]:\` (higher specificity) — the resting override is ` +
          `out-specified at rest.`,
        tokenIds: [node.id],
        componentName: prefix,
      });
    }
```

- [ ] **Step 5: Run to verify they pass.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/scanner.test.ts`
Expected: PASS (4 new tests + all existing scanner tests).

- [ ] **Step 6: Full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all pass; typecheck clean. (If an existing scanner test that counts total issues for a fixture containing `input`/`switch` disabled/resting colours now sees the new warnings, update its count — these are NEW, expected hints; do not suppress the detector.)

- [ ] **Step 7: Verify against the live export (sanity).**
```bash
cd /Users/christian/Dev/token-inspector
T=$(mktemp -d); unzip -oq assets/tokens-20260619-214856.zip -d "$T"
npx tsx -e '
import { readFileSync, readdirSync } from "node:fs";
import { buildGraph } from "./src/build-graph.ts";
import { scanGraph } from "./src/scanner.ts";
const dir=process.argv[1];
const files=readdirSync(dir).filter(f=>f.endsWith(".tokens.json")).map(f=>({name:f.replace(/\.tokens\.json$/,""),data:JSON.parse(readFileSync(`${dir}/${f}`,"utf8"))}));
const g=buildGraph(files as any);
const comps=[...new Set([...g.nodes.values()].filter((n:any)=>n.layer==="component").map((n:any)=>n.id.split("-")[0]))];
const r=scanGraph(g,{components:comps});
for(const k of ["disabled-via-opacity","resting-shadowed-by-state"]){
  const xs=r.issues.filter((i:any)=>i.kind===k);
  console.log(`${k}: ${xs.length}`, xs.slice(0,6).map((i:any)=>i.tokenIds[0]));
}
' "$T"
rm -rf "$T"
```
Expected: `disabled-via-opacity` lists input/checkbox/switch/textarea/radio disabled-colour tokens; `resting-shadowed-by-state` lists `switch-bg` (and any other resting switch bg). Confirm none fire on components outside the sets.

- [ ] **Step 8: Commit.**
```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): disabled-via-opacity + resting-shadowed-by-state capability detectors"
```

---

## Notes for the implementer
- Working dir: `/Users/christian/Dev/token-inspector`, branch `feat/capability-deviation-detectors` (holds the spec commit). The pre-commit hook runs vue-tsc + the full vitest suite — each commit is gated.
- Do NOT change the recipe engine, the slot mapping, or any output — these are scan-only diagnostics. The recipe keeps emitting the tokens.
- The detection conditions are verified: `mapping.statePrefix === "disabled"` for a disabled token, falsy for a resting token; `switch-bg` → slot `base`, utilityType `bg-color`. Don't change them without re-probing `getSlotMapping`.
- `ScanIssue.kind` is an open `string` (token-graph.ts) — the new kinds need no type change. They render through the existing scan-issue UI unchanged.
- YAGNI: exactly these two detectors and two sets. No button/select, no other mechanisms, no UI work.

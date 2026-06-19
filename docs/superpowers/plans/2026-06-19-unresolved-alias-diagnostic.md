# Actionable unresolved-alias Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the token-inspector's `unresolved-alias` scanner errors by missing target-family and add a cause hint, so dangling aliases surface as a few actionable issues instead of many opaque ones — without silencing them.

**Architecture:** `build-graph.ts` (pure graph builder) gains one additive field on `GraphIssue` (`target`) carrying the raw alias target. `scanner.ts` (the diagnostic aggregator) groups `unresolved-alias` issues by target-family into one `ScanIssue` per family with a library/remote hint; all other build-time issue kinds stay 1:1. No resolver change, no severity change, no UI change.

**Tech Stack:** TypeScript, vitest 2.1, vue-tsc (pre-commit typecheck). `@core` = `src/`, `@tg/grammar` = workspace package.

---

## File Structure
- **Modify `src/token-graph.ts`** — add optional `target?: string` to the `GraphIssue` interface.
- **Modify `src/build-graph.ts`** (~:296-302) — set `target: aliasAttempt.rawTarget` on the emitted `unresolved-alias` issue.
- **Modify `src/scanner.ts`** (~:62-76) — split the build-time loop; add a pure `groupUnresolvedAliases` helper that emits one grouped `ScanIssue` per missing target-family.
- **Modify tests:** `src/build-graph.test.ts` (assert `target` populated), `src/scanner.test.ts` (update the existing 1:1 test, add a grouping test).
- **Commit (Task 3):** `scripts/probe-unresolved-alias.ts` (already written; a reusable diagnostic for "which aliases are unresolved in export X").

---

### Task 1: `GraphIssue.target` + build-graph sets it

**Files:**
- Modify: `src/token-graph.ts` (the `GraphIssue` interface, ~:124-135)
- Modify: `src/build-graph.ts` (~:296-302)
- Test: `src/build-graph.test.ts` (extend the test at ~:226-249)

- [ ] **Step 1: Add the failing assertion** to the existing test in `src/build-graph.test.ts`. Find the test `it("emits unresolved-alias issue when target is unknown", …)` (~:226). After its last assertion (`expect(unresolved[0].nodeId).toBe("button-ghost-background");`), add:

```ts
    expect(unresolved[0].target).toBe("color/does-not-exist/500");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/build-graph.test.ts -t "emits unresolved-alias issue when target is unknown"`
Expected: FAIL — `target` is `undefined` (property not set / not on the type).

- [ ] **Step 3: Add the `target` field to `GraphIssue`** in `src/token-graph.ts`. The interface currently ends with the `path` field; add `target` after it:

```ts
export interface GraphIssue {
  kind:
    | "unresolved-alias"
    | "duplicate-id"
    | "unknown-type"
    | "malformed-value";
  /** Node id this issue is attached to (if any). */
  nodeId?: TokenId;
  message: string;
  /** Original path for tracing back to the Figma export. */
  path?: readonly string[];
  /** For unresolved-alias: the raw alias target (slash path) that could not be resolved. */
  target?: string;
}
```

- [ ] **Step 4: Set `target` in `src/build-graph.ts`.** The `unresolved-alias` issue is pushed at ~:296-302. Add the `target` field:

```ts
      if (!alias && aliasAttempt.rawTarget) {
        issues.push({
          kind: "unresolved-alias",
          nodeId: id,
          path,
          message: `unresolved alias: ${aliasAttempt.rawTarget}`,
          target: aliasAttempt.rawTarget,
        });
      }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/build-graph.test.ts`
Expected: PASS (all build-graph tests, including the extended one).

- [ ] **Step 6: Commit**

```bash
git add src/token-graph.ts src/build-graph.ts src/build-graph.test.ts
git commit -m "feat(graph): carry the raw alias target on unresolved-alias GraphIssue"
```

---

### Task 2: Scanner groups unresolved aliases by family

**Files:**
- Modify: `src/scanner.ts` (the build-time loop ~:62-76, plus a new helper near the other top-of-file helpers)
- Test: `src/scanner.test.ts` (update the test at ~:53-70, add a new grouping test after it)

- [ ] **Step 1: Write the failing grouping test.** In `src/scanner.test.ts`, inside the existing `describe("scanGraph — build-time issues", …)` block, add this test after the existing one (the `makeGraph(nodes, issues)` helper already exists in this file at ~:44):

```ts
  it("groups unresolved-alias issues by target family with a cause hint", () => {
    const graph = makeGraph(
      [],
      [
        { kind: "unresolved-alias", nodeId: "sem-a-light", message: "unresolved alias: color/white/alpha/500-8", target: "color/white/alpha/500-8" },
        { kind: "unresolved-alias", nodeId: "sem-a-dark", message: "unresolved alias: color/white/alpha/500-8", target: "color/white/alpha/500-8" },
        { kind: "unresolved-alias", nodeId: "sem-b", message: "unresolved alias: color/white/alpha/500-15", target: "color/white/alpha/500-15" },
        { kind: "unresolved-alias", nodeId: "sem-c", message: "unresolved alias: color/black/alpha/500-60", target: "color/black/alpha/500-60" },
        { kind: "malformed-value", nodeId: "mv-1", message: "malformed-value for mv-1 (type=color)" },
      ],
    );
    const buildTime = scanGraph(graph, { components: ["button"] }).issues.filter(
      (i: ScanIssue) => i.category === "build-time",
    );
    const ua = buildTime.filter((i: ScanIssue) => i.kind === "unresolved-alias");
    expect(ua).toHaveLength(2); // two families: white/alpha and black/alpha

    const white = ua.find((i) => i.message.includes("color/white/alpha/*"));
    expect(white).toBeDefined();
    expect(white!.severity).toBe("error");
    expect(white!.tokenIds).toEqual(["sem-a-light", "sem-a-dark", "sem-b"]); // 3 aliasing tokens, deduped
    expect(white!.message).toContain("3 alias(es)");
    expect(white!.message).toContain("(500-8, 500-15)"); // unique leaves, encounter order
    expect(white!.message).toContain("library/remote");

    const black = ua.find((i) => i.message.includes("color/black/alpha/*"));
    expect(black!.tokenIds).toEqual(["sem-c"]);

    // a non-alias build-time issue is NOT grouped — stays 1:1
    expect(buildTime.filter((i) => i.kind === "malformed-value")).toHaveLength(1);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/scanner.test.ts -t "groups unresolved-alias issues by target family"`
Expected: FAIL — currently each alias maps 1:1, so `ua` has length 4 (not 2) and the grouped message text is absent.

- [ ] **Step 3: Ensure `GraphIssue` is imported in `src/scanner.ts`.** Check the type-import block (~:4-12). If `GraphIssue` is not already imported from `./token-graph.js`, add it to that `import type { … } from "./token-graph.js";` list.

- [ ] **Step 4: Add the grouping helper** to `src/scanner.ts`, near the other top-of-file helper functions (e.g. just above `export function scanGraph`):

```ts
/** Target minus its last path segment, e.g. "color/white/alpha/500-8" -> "color/white/alpha". */
function familyOf(target: string): string {
  const i = target.lastIndexOf("/");
  return i === -1 ? target : target.slice(0, i);
}

/** The last path segment, e.g. "color/white/alpha/500-8" -> "500-8". */
function leafOf(target: string): string {
  const i = target.lastIndexOf("/");
  return i === -1 ? target : target.slice(i + 1);
}

/**
 * Collapse unresolved-alias GraphIssues into one ScanIssue per missing target
 * FAMILY (target minus its last segment). The grouped issue lists the missing
 * leaves and the aliasing tokens, and hints at the likely cause (a library/remote
 * variable the local-only export omitted, or a dangling reference). De-noises
 * without hiding — severity stays "error".
 */
function groupUnresolvedAliases(aliases: readonly GraphIssue[]): ScanIssue[] {
  interface Fam {
    family: string;
    leaves: string[];
    tokenIds: string[];
  }
  const byFamily = new Map<string, Fam>();
  for (const gi of aliases) {
    const target = gi.target ?? "";
    const family = familyOf(target);
    const leaf = leafOf(target);
    let fam = byFamily.get(family);
    if (!fam) {
      fam = { family, leaves: [], tokenIds: [] };
      byFamily.set(family, fam);
    }
    if (leaf && !fam.leaves.includes(leaf)) fam.leaves.push(leaf);
    if (gi.nodeId !== undefined && !fam.tokenIds.includes(gi.nodeId)) fam.tokenIds.push(gi.nodeId);
  }
  return [...byFamily.values()].map((fam) => ({
    id: `bt-unresolved-alias-${fam.family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    category: "build-time" as const,
    severity: "error" as const,
    kind: "unresolved-alias",
    message:
      `${fam.tokenIds.length} alias(es) reference unresolved targets under \`${fam.family}/*\` ` +
      `(${fam.leaves.join(", ")}) — absent from all loaded sources. Likely library/remote variables ` +
      `not included by the local-only export (export them or include the library), or dangling references.`,
    tokenIds: fam.tokenIds,
  }));
}
```

- [ ] **Step 5: Rewrite the build-time loop** in `scanGraph` (`src/scanner.ts` ~:66-76). Replace:

```ts
  // ─── 1. Build-time issues ─────────────────────────────────────────────────
  for (const gi of graph.issues) {
    issues.push({
      id: `bt-${gi.kind}-${gi.nodeId ?? "global"}-${issues.length}`,
      category: "build-time",
      severity: "error",
      kind: gi.kind,
      message: gi.message,
      tokenIds: gi.nodeId !== undefined ? [gi.nodeId] : [],
    });
  }
```

with:

```ts
  // ─── 1. Build-time issues ─────────────────────────────────────────────────
  // Non-alias kinds map 1:1. unresolved-alias issues are grouped by target-family
  // into one actionable issue per missing family (see groupUnresolvedAliases).
  const unresolvedAliases: GraphIssue[] = [];
  for (const gi of graph.issues) {
    if (gi.kind === "unresolved-alias") {
      unresolvedAliases.push(gi);
      continue;
    }
    issues.push({
      id: `bt-${gi.kind}-${gi.nodeId ?? "global"}-${issues.length}`,
      category: "build-time",
      severity: "error",
      kind: gi.kind,
      message: gi.message,
      tokenIds: gi.nodeId !== undefined ? [gi.nodeId] : [],
    });
  }
  issues.push(...groupUnresolvedAliases(unresolvedAliases));
```

- [ ] **Step 6: Update the existing 1:1 test** in `src/scanner.test.ts` (~:53-70). It constructs a single unresolved-alias issue without a `target`; add the `target` field so it exercises the grouped path realistically. Change the input issue object from:

```ts
        {
          kind: "unresolved-alias",
          nodeId: "missing-target",
          message: "unresolved alias: missing-target",
        },
```

to:

```ts
        {
          kind: "unresolved-alias",
          nodeId: "missing-target",
          message: "unresolved alias: missing-target",
          target: "missing-target",
        },
```

The existing assertions (`buildTime` length 1, `severity` "error", `kind` "unresolved-alias") remain valid — a single alias is one family of one.

- [ ] **Step 7: Run the scanner tests**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — the new grouping test and the updated 1:1 test both pass.

- [ ] **Step 8: Run the full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests pass; typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): group unresolved-alias issues by target family with cause hint"
```

---

### Task 3: Verification + commit the probe

**Files:**
- Commit: `scripts/probe-unresolved-alias.ts` (already exists, untracked)

- [ ] **Step 1: Sanity-check the real export end-to-end.** Confirm the underlying graph still emits the same 6 unresolved-alias issues and that `scanGraph` now collapses them to 2 grouped build-time issues:

```bash
T=$(mktemp -d); unzip -oq assets/tokens-20260619-093216.zip -d "$T"
npx tsx scripts/probe-unresolved-alias.ts "$T"
rm -rf "$T"
```
Expected: `unresolved-alias: 6` and `unique unresolved targets: 5` (graph level — unchanged by this feature; the grouping happens in `scanGraph`, which the scanner tests cover).

- [ ] **Step 2: Commit the probe as a tracked diagnostic**

```bash
git add scripts/probe-unresolved-alias.ts
git commit -m "chore: add probe-unresolved-alias diagnostic script"
```

---

## Notes for the implementer
- Working directory: `/Users/christian/Dev/token-inspector`, branch `feat/unresolved-alias-diagnostic` (already checked out, holds the spec commit).
- The pre-commit hook runs vue-tsc typecheck + the full vitest suite, so each commit is gated. If the hook surfaces a type error in a `.test.ts` (the hook's typecheck covers tests), fix it before the commit lands.
- Do NOT change `src/app/scan-grouping.ts` — it groups by `componentName` (an orthogonal axis) and is unaffected. Do NOT change the alias-resolution logic in `build-graph.ts` beyond setting `target`.
- YAGNI: no "did you mean?"/near-match detection, no severity change, no new `ScanIssue` fields beyond what's shown.
- If the full suite (Task 2 Step 8) surfaces a failure in some OTHER test that counts build-time or unresolved-alias issues from a real fixture, that is the EXPECTED consequence of grouping (N rows → fewer). Update that assertion to the grouped count — do not revert the grouping. Only `scanner.test.ts` and `build-graph.test.ts` are known to reference unresolved aliases today, but verify.

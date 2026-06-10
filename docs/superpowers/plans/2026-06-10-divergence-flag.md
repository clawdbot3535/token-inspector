# divergence-flag rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A part-based `component-looks-custom` scan hint that fires for a component with ≥1 genuinely-foreign part (∉ Nuxt slots, ∉ NON_PART_SEGMENTS, ∉ FIGMA_NUXT_PART_ALIAS), recommending the `custom/<name>` layer. Replaces the parked share-based heuristic.

**Architecture:** One task — a per-component rollup added to `scanner.ts`, reusing the `unsupported-part` pass's existing data (`nullTokensByComponent` etc.) + tests. `ScanIssue.kind` is a free `string` (token-graph.ts:168) — NO type change needed.

**Tech Stack:** TS engine, Vitest. Pre-commit hook = `vue-tsc` + full vitest; commit must be green.

**Branch:** `feat/divergence-flag-rebuild` (spec at `c6f8109`).

**Spec:** `docs/superpowers/specs/2026-06-10-divergence-flag-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`. The grammar lives in `@tg/grammar` (scanner already imports `nuxtSlotsFor`, `NON_PART_SEGMENTS`, `FIGMA_NUXT_PART_ALIAS` from there).
- `nullTokensByComponent: Map<string, {seg, id}[]>`, `mappedSecondSegByComponent: Map<string, Set<string>>` (scanner.ts ~85-86). The parked branch `dd8971f` (share-based) is NOT reused.

---

### Task 1: `component-looks-custom` rollup + tests

**Files:** Modify `src/scanner.ts`; Test `src/scanner.test.ts`.

- [ ] **Step 1: Failing tests** — add to `src/scanner.test.ts` (mirror the existing `unsupported-part` tests' graph-build + `scanGraph`/issues access pattern):
```typescript
  it("flags a component with a genuinely-foreign part as looks-custom", () => {
    // `close` is not a chip Nuxt slot, not a NON_PART word, and has no rename alias.
    const graph = /* build a graph with a chip token whose 2nd segment is `close`, e.g. chip-close-bg: a color */;
    const report = /* scanGraph(graph) the way neighbouring tests do */;
    const clc = report.issues.filter((i) => i.kind === "component-looks-custom");
    expect(clc).toHaveLength(1);
    expect(clc[0]!.componentName).toBe("chip");
    expect(clc[0]!.message).toContain("close");
  });
  it("does NOT flag looks-custom for an aliasable mismatch (dot → indicator)", () => {
    // `dot` IS in FIGMA_NUXT_PART_ALIAS → rename candidate, not custom.
    const graph = /* a radio token with 2nd segment `dot`, e.g. radio-dot-color */;
    const report = /* scanGraph(graph) */;
    expect(report.issues.filter((i) => i.kind === "component-looks-custom")).toHaveLength(0);
  });
  it("does NOT flag a fully-mapped component as looks-custom", () => {
    const graph = /* a button graph whose tokens all map (e.g. button-bg, button-radius) */;
    const report = /* scanGraph(graph) */;
    expect(report.issues.filter((i) => i.kind === "component-looks-custom")).toHaveLength(0);
  });
```
(Use the EXACT graph-builder + report accessor the existing scanner tests use. If an existing
`unsupported-part` test already builds a foreign-part graph, model on it.)

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/scanner.test.ts`.

- [ ] **Step 3: Implement** — in `src/scanner.ts`, AFTER the `capability-gap` loop (the last detector in that region, ends ~line 260), add the rollup. It reuses `nullTokensByComponent`, `mappedSecondSegByComponent`, `nuxtSlotsFor`, `NON_PART_SEGMENTS`, `FIGMA_NUXT_PART_ALIAS` (all already in scope / imported):
```typescript
  // component-looks-custom: a per-component rollup of genuinely-foreign parts — a
  // Figma part-segment that is not a Nuxt slot, not a NON_PART word, AND not a
  // rename-able alias (so not a typo, but truly foreign). ≥1 such part ⇒ the
  // component is likely custom (emit as `custom/<name>`, Stage C). Hint severity.
  // Part-based, deliberately NOT share-based (unmapped share over-fires on standard
  // components whose gaps are naming/grammar/prop, not divergence).
  for (const [comp, nullToks] of nullTokensByComponent) {
    const slots = nuxtSlotsFor(comp);
    if (!slots) continue;
    const mapped = mappedSecondSegByComponent.get(comp) ?? new Set<string>();
    const foreign = new Map<string, string[]>();
    for (const { seg, id } of nullToks) {
      if (mapped.has(seg) || slots.has(seg) || NON_PART_SEGMENTS.has(seg)) continue;
      if (FIGMA_NUXT_PART_ALIAS.has(seg)) continue; // rename candidate, not custom
      const ids = foreign.get(seg) ?? [];
      ids.push(id);
      foreign.set(seg, ids);
    }
    if (foreign.size === 0) continue;
    const parts = [...foreign.keys()];
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
    });
  }
```
(Match the exact `ScanIssue` field names/shape the other `issues.push(...)` calls use — `id`,
`category`, `severity`, `kind`, `message`, `tokenIds`, `componentName`. No token-graph.ts change:
`kind` is a free string.)

- [ ] **Step 4: Run → PASS** — `npx vitest run src/scanner.test.ts`; then `npm run typecheck && npx vitest run`.

- [ ] **Step 5: Real-export probe** — confirm the signal is clean:
```bash
npx tsx -e "
import fs from 'fs';
import { buildGraph } from './src/build-graph.ts';
import { scanGraph } from './src/scanner.ts';
const names=['color','dimension','typography','light','dark','global'];
const g=buildGraph(names.map(n=>({name:n,data:JSON.parse(fs.readFileSync('components/'+n+'.tokens.json','utf8'))})));
const r=scanGraph(g);
for(const i of r.issues.filter(x=>x.kind==='component-looks-custom')) console.log(i.componentName, '::', i.message.slice(0,90));
"
```
Expected: ONE line — `chip` (parts `label`, `close`). Report the exact output. (If more than `chip`
fires, investigate before committing — a surprise component means either a real divergence or an
inventory gap worth knowing.)

- [ ] **Step 6: Commit**
```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scan): component-looks-custom — part-based divergence flag"
```
Verify no trailer; amend if present.

---

## Final verification

- [ ] `npm run typecheck && npx vitest run` green.
- [ ] Real-export probe: `component-looks-custom` fires for `chip` ONLY (parts `label`, `close`);
  checkbox/radio/switch/progress (high unmapped share) do NOT fire.
- [ ] Headless: load the export, open ScanView → the `chip` looks-custom hint shows among the
  classification hints; checkbox/radio do not carry it. Screenshot.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request.

## Self-review notes

- **Spec coverage:** part-based rollup (≥1 non-aliasable foreign part), hint severity, names parts +
  custom-layer recommendation, reuses existing data, real-export = chip only. All mapped.
- **No share heuristic:** the parked share-based code is not reused; this is purely part-based.
- **No token-graph change:** `ScanIssue.kind` is a free string.
- **No placeholders:** the rollup code is given in full; test snippets defer to the file's existing
  graph-builder/scanGraph accessor (which the implementer mirrors), with the assertion logic
  explicit.

# Typo / Did-You-Mean Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scanner pass that flags token-id segments which look like misspellings of known grammar vocabulary, emitting a `possible-typo` ScanIssue with a "did you mean `X`?" suggestion.

**Architecture:** A pure, leaf module in the grammar package (`typo-detect.ts`) provides Damerau-Levenshtein distance and a `suggestVocabWord(segment)` lookup against the value-bearing vocabulary. The scanner owns graph traversal: it builds a per-segment frequency map, applies false-positive guards (length ≥ 4, non-numeric, not known vocab, frequency < 3), calls `suggestVocabWord`, and emits aggregated issues. The frequency guard is the keystone — real vocabulary recurs (`heading`), one-off typos don't (`heigth`).

**Tech Stack:** TypeScript, Vitest, pnpm/npm workspaces (`@tg/grammar` package consumed by `src/scanner.ts`).

**Spec:** `docs/superpowers/specs/2026-06-12-typo-detector-design.md`

---

## File Structure

- **Create** `packages/grammar/src/typo-detect.ts` — pure helpers: `damerauLevenshtein`, `suggestVocabWord`, `VocabSuggestion`. Depends only on `./component-vocab.js` (keeps grammar a clean leaf).
- **Create** `packages/grammar/src/typo-detect.test.ts` — unit tests for both helpers.
- **Modify** `packages/grammar/src/index.ts` — add the barrel re-export.
- **Modify** `src/scanner.ts` — import `suggestVocabWord`; add `detectPossibleTypos(graph)` (mirrors `detectAsymmetricVariantCoverage`); call it inside `scanGraph`.
- **Modify** `src/scanner.test.ts` — add `detectPossibleTypos` to the import and a new describe block.

---

## Task 1: Damerau-Levenshtein distance

**Files:**
- Create: `packages/grammar/src/typo-detect.ts`
- Test: `packages/grammar/src/typo-detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/grammar/src/typo-detect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { damerauLevenshtein } from "./typo-detect.js";

describe("damerauLevenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(damerauLevenshtein("height", "height")).toBe(0);
  });

  it("counts a single substitution as 1", () => {
    expect(damerauLevenshtein("color", "colar")).toBe(1);
  });

  it("counts a single insertion as 1", () => {
    expect(damerauLevenshtein("eror", "error")).toBe(1);
  });

  it("counts a single deletion as 1", () => {
    expect(damerauLevenshtein("widthh", "width")).toBe(1);
  });

  it("counts an adjacent transposition as 1", () => {
    expect(damerauLevenshtein("height", "heigth")).toBe(1);
    expect(damerauLevenshtein("width", "widht")).toBe(1);
  });

  it("returns the other length when one string is empty", () => {
    expect(damerauLevenshtein("", "size")).toBe(4);
    expect(damerauLevenshtein("size", "")).toBe(4);
  });

  it("scores unrelated words as large", () => {
    expect(damerauLevenshtein("primary", "shadow")).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/grammar/src/typo-detect.test.ts`
Expected: FAIL — cannot find module `./typo-detect.js` (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `packages/grammar/src/typo-detect.ts`:

```ts
// Spelling-typo detection for token-id segments. Pure, leaf module: depends only
// on the component vocabulary in this package. The scanner orchestrates the
// graph traversal and frequency guard; this file answers the narrow question
// "is this one segment a likely misspelling of a value-bearing vocab word?".

/**
 * Damerau-Levenshtein edit distance (optimal string alignment variant). A single
 * transposition of two ADJACENT characters costs 1 edit, so `height`↔`heigth` is
 * distance 1 (plain Levenshtein would score that 2). Insertions, deletions and
 * substitutions each cost 1.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const d: number[][] = Array.from({ length: al + 1 }, () =>
    new Array<number>(bl + 1).fill(0),
  );
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return d[al][bl];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/grammar/src/typo-detect.test.ts`
Expected: PASS (all 7 assertions green).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/typo-detect.ts packages/grammar/src/typo-detect.test.ts
git commit -m "feat(typo): Damerau-Levenshtein distance helper"
```

---

## Task 2: suggestVocabWord lookup

**Files:**
- Modify: `packages/grammar/src/typo-detect.ts`
- Test: `packages/grammar/src/typo-detect.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/grammar/src/typo-detect.test.ts`:

```ts
import { suggestVocabWord } from "./typo-detect.js";

describe("suggestVocabWord", () => {
  it("suggests the transposed property word", () => {
    expect(suggestVocabWord("heigth")).toEqual({ word: "height", distance: 1 });
  });

  it("suggests for a misspelled variant", () => {
    expect(suggestVocabWord("outilne")?.word).toBe("outline");
  });

  it("suggests for a misspelled color role", () => {
    expect(suggestVocabWord("eror")?.word).toBe("error");
  });

  it("returns null for a correctly-spelled vocab word", () => {
    expect(suggestVocabWord("height")).toBeNull();
    expect(suggestVocabWord("outline")).toBeNull();
  });

  it("returns null for an unrelated word", () => {
    expect(suggestVocabWord("zzzzzz")).toBeNull();
  });

  it("returns null on an ambiguous tie", () => {
    // `lint` is distance 1 from BOTH `line` (property) and `link` (variant).
    expect(suggestVocabWord("lint")).toBeNull();
  });

  it("respects maxDistance", () => {
    expect(suggestVocabWord("xxradius")).toBeNull(); // distance 2, default max 1
    expect(suggestVocabWord("xxradius", 2)?.word).toBe("radius");
  });
});
```

> Note: `suggestVocabWord` is the *pure* lookup and intentionally has NO frequency
> awareness — so `suggestVocabWord("heading")` DOES return `leading`. The
> `heading`→`leading` false positive is suppressed by the scanner's frequency
> guard (Task 3), not here. Do not add a `heading` test to this block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/grammar/src/typo-detect.test.ts`
Expected: FAIL — `suggestVocabWord` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/grammar/src/typo-detect.ts` (add the import at the top of the file, below the header comment):

```ts
import {
  NON_PART_SEGMENTS,
  KNOWN_VARIANT_NAMES,
  SIZE_KEYS,
} from "./component-vocab.js";
```

Then append below `damerauLevenshtein`:

```ts
/** Value-bearing words worth suggesting toward (length >= 4 only — short words
 *  like `bg`/`gap` are too collision-prone to be useful targets). */
const SUGGESTION_TARGETS: readonly string[] = [
  ...new Set<string>([...NON_PART_SEGMENTS, ...KNOWN_VARIANT_NAMES]),
].filter((w) => w.length >= 4);

/** Every word the grammar already recognises — never suggested-against (a
 *  correctly-spelled vocab word is not a typo). */
const KNOWN_VOCAB: ReadonlySet<string> = new Set<string>([
  ...NON_PART_SEGMENTS,
  ...KNOWN_VARIANT_NAMES,
  ...SIZE_KEYS,
]);

export interface VocabSuggestion {
  /** The nearest value-bearing vocabulary word. */
  word: string;
  /** Damerau-Levenshtein distance from the input segment. */
  distance: number;
}

/**
 * The unique nearest value-bearing vocabulary word to `segment` within
 * `maxDistance`, or null when: the segment is itself known vocabulary, no target
 * is in range, or two targets tie for nearest (ambiguous → no suggestion).
 */
export function suggestVocabWord(
  segment: string,
  maxDistance = 1,
): VocabSuggestion | null {
  if (KNOWN_VOCAB.has(segment)) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const target of SUGGESTION_TARGETS) {
    const dist = damerauLevenshtein(segment, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = target;
      tie = false;
    } else if (dist === bestDist) {
      tie = true;
    }
  }

  if (best === null || bestDist > maxDistance || tie) return null;
  return { word: best, distance: bestDist };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/grammar/src/typo-detect.test.ts`
Expected: PASS (both describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/typo-detect.ts packages/grammar/src/typo-detect.test.ts
git commit -m "feat(typo): suggestVocabWord nearest-vocab lookup"
```

---

## Task 3: detectPossibleTypos scanner pass + wiring

**Files:**
- Modify: `packages/grammar/src/index.ts` (barrel export)
- Modify: `src/scanner.ts:20` (import), end of file (new function), `src/scanner.ts:530-536` (call site)
- Test: `src/scanner.test.ts:2` (import), new describe block

- [ ] **Step 1: Write the failing test**

In `src/scanner.test.ts`, change the import on line 2 from:

```ts
import { scanGraph, customPartsByComponent } from "./scanner.js";
```

to:

```ts
import { scanGraph, customPartsByComponent, detectPossibleTypos } from "./scanner.js";
```

Then append this describe block to the end of `src/scanner.test.ts`:

```ts
describe("detectPossibleTypos", () => {
  it("flags a one-off misspelled segment with a suggestion", () => {
    // `heading` recurs (freq 3) so it is treated as intentional vocab; only the
    // one-off `heigth` on heading-2 is flagged.
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-line-height", layer: "semantic", type: "dimension", source: "global", base: "40px" }),
      makeNode({ id: "typography-heading-2-line-heigth", layer: "semantic", type: "dimension", source: "global", base: "32px" }),
      makeNode({ id: "typography-heading-3-line-height", layer: "semantic", type: "dimension", source: "global", base: "28px" }),
    ]);
    const issues = detectPossibleTypos(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "possible-typo",
      severity: "warning",
      category: "data-quality",
      tokenIds: ["typography-heading-2-line-heigth"],
    });
    expect(issues[0].message).toContain("height");
  });

  it("does not flag `heading` as `leading` when it recurs (frequency guard)", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-font-size", layer: "semantic", type: "dimension", source: "global", base: "32px" }),
      makeNode({ id: "typography-heading-2-font-size", layer: "semantic", type: "dimension", source: "global", base: "28px" }),
      makeNode({ id: "typography-heading-3-font-size", layer: "semantic", type: "dimension", source: "global", base: "24px" }),
    ]);
    expect(detectPossibleTypos(graph)).toHaveLength(0);
  });

  it("ignores correctly-spelled, numeric and short segments", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "color-primary-500", layer: "primitive", type: "color", source: "global", base: "#abc" }),
    ]);
    expect(detectPossibleTypos(graph)).toHaveLength(0);
  });

  it("notes when the corrected token already exists", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-radius", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "input-border-raduis", layer: "component", type: "dimension", source: "global", base: "4px" }),
    ]);
    const issues = detectPossibleTypos(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("already exists");
  });

  it("scanGraph surfaces possible-typo issues", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-line-height", layer: "semantic", type: "dimension", source: "global", base: "40px" }),
      makeNode({ id: "typography-heading-2-line-heigth", layer: "semantic", type: "dimension", source: "global", base: "32px" }),
      makeNode({ id: "typography-heading-3-line-height", layer: "semantic", type: "dimension", source: "global", base: "28px" }),
    ]);
    const report = scanGraph(graph, { components: [] });
    expect(report.issues.some((i) => i.kind === "possible-typo")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — `detectPossibleTypos` is not exported from `./scanner.js`.

- [ ] **Step 3a: Add the barrel export**

In `packages/grammar/src/index.ts`, add after the existing exports:

```ts
export * from "./typo-detect.js";
```

- [ ] **Step 3b: Import `suggestVocabWord` into the scanner**

In `src/scanner.ts`, line 20, add `suggestVocabWord` to the `@tg/grammar` import. The line becomes:

```ts
import { getSlotMapping, KNOWN_VARIANT_NAMES, RING_FRAMED_VARIANTS, propDrivenStateFor, nuxtSlotsFor, NON_PART_SEGMENTS, FIGMA_NUXT_PART_ALIAS, SLOT_PAIRS, SLOT_MIRROR, suggestVocabWord } from "@tg/grammar";
```

- [ ] **Step 3c: Implement `detectPossibleTypos`**

In `src/scanner.ts`, append at the end of the file (after `detectAsymmetricVariantCoverage` / near the other exported detectors):

```ts
// ────────────────────────────────────────────────────────────────────────────
// Possible-typo detection (data-quality, graph-wide)
//
// Splits every token id on `-` and flags a segment that looks like a
// misspelling of a value-bearing vocabulary word (height, width, radius,
// outline, error, …). Self-tuning false-positive guard: a segment that occurs
// on >= INTENTIONAL_FREQ distinct tokens is intentional vocabulary (e.g.
// `heading`, one Damerau edit from `leading`) and is skipped, so only genuine
// one-off typos surface.
// ────────────────────────────────────────────────────────────────────────────

const MIN_TYPO_SEGMENT_LEN = 4;
const INTENTIONAL_FREQ = 3;

export function detectPossibleTypos(graph: TokenGraph): ScanIssue[] {
  // 1. Frequency: count distinct tokens each segment appears on.
  const segFreq = new Map<string, number>();
  for (const node of graph.nodes.values()) {
    const seen = new Set<string>();
    for (const seg of node.id.split("-")) {
      if (seen.has(seg)) continue;
      seen.add(seg);
      segFreq.set(seg, (segFreq.get(seg) ?? 0) + 1);
    }
  }

  // 2. Detect. Aggregate affected ids by `${segment}->${suggestion}`.
  interface TypoHit {
    segment: string;
    suggestion: string;
    ids: string[];
  }
  const hits = new Map<string, TypoHit>();
  for (const node of graph.nodes.values()) {
    const seen = new Set<string>();
    for (const seg of node.id.split("-")) {
      if (seen.has(seg)) continue;
      seen.add(seg);
      if (seg.length < MIN_TYPO_SEGMENT_LEN) continue;
      if (/^\d+$/.test(seg)) continue;
      if ((segFreq.get(seg) ?? 0) >= INTENTIONAL_FREQ) continue;
      const maxDist = seg.length >= 7 ? 2 : 1;
      const suggestion = suggestVocabWord(seg, maxDist);
      if (suggestion === null) continue;
      const key = `${seg}->${suggestion.word}`;
      const hit = hits.get(key) ?? { segment: seg, suggestion: suggestion.word, ids: [] };
      hit.ids.push(node.id);
      hits.set(key, hit);
    }
  }

  // 3. Emit one warning per distinct typo.
  const issues: ScanIssue[] = [];
  for (const { segment, suggestion, ids } of hits.values()) {
    const fixedId = ids[0]
      .split("-")
      .map((s) => (s === segment ? suggestion : s))
      .join("-");
    const fixedExists = graph.nodes.has(fixedId);
    const count = ids.length;
    issues.push({
      id: `typo-${segment}-${suggestion}`,
      category: "data-quality",
      severity: "warning",
      kind: "possible-typo",
      message:
        `\`${segment}\` looks like a typo of \`${suggestion}\` — did you mean ` +
        `\`${fixedId}\`?${fixedExists ? " (that token already exists)" : ""} ` +
        `(${count} token${count > 1 ? "s" : ""})`,
      tokenIds: ids,
    });
  }
  return issues;
}
```

- [ ] **Step 3d: Wire it into `scanGraph`**

In `src/scanner.ts`, immediately after the section-5 asymmetry loop (after the closing `}` of `for (const issue of detectAsymmetricVariantCoverage(graph)) { ... }`, before the `// ─── 6. Output forecast ───` comment), add:

```ts
  // ─── 5b. Possible-typo detection (data-quality, graph-wide) ──────────────
  for (const issue of detectPossibleTypos(graph)) {
    issues.push(issue);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scanner.test.ts packages/grammar/src/typo-detect.test.ts`
Expected: PASS (new describe block + existing scanner tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/index.ts src/scanner.ts src/scanner.test.ts
git commit -m "feat(typo): graph-wide possible-typo scanner pass with frequency guard"
```

---

## Task 4: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite + typecheck**

Run: `npm test`
Expected: PASS — all test files green (586 prior + the new typo tests), no type errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (confirms `@tg/grammar` barrel export resolves for both the package and the web app).

- [ ] **Step 3: Manual smoke check of the CLI digest**

Confirm the new kind flows through the CLI digest with no code change. Run the token build:

Run: `npm run build:tokens`
Expected: the scan digest prints warnings in the form `[possible-typo] \`<seg>\` looks like a typo of \`<word>\` …` IF the active token fixture contains a typo. (The committed `components/` fixture is the old pre-overlay export and may be clean — a clean run with no `possible-typo` line is also a valid pass; the unit tests are the behavioral guarantee.)

- [ ] **Step 4: Confirm no per-kind allowlist hides the new kind in the web UI**

Run: `grep -rnE "possible-typo|kindLabel|KIND_LABELS|kind ===|switch \(.*kind" src/app`
Expected: no hardcoded per-kind allowlist/switch that would suppress an unknown kind. `ScanView.vue` filters by severity only, so `possible-typo` renders generically. If a per-kind map is found, add a label entry for `possible-typo`.

- [ ] **Step 5: Final commit (only if Step 4 required a UI label change; otherwise skip)**

```bash
git add -A
git commit -m "feat(typo): surface possible-typo kind label in ScanView"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Reference vocabulary (value-bearing, length ≥ 4) → Task 2 `SUGGESTION_TARGETS`. ✓
- Skip set (length<4, numeric, known vocab, frequency≥3) → Task 2 `KNOWN_VOCAB` + Task 3 guards. ✓
- Damerau distance, transposition=1, length-scaled max → Task 1 + Task 3 `maxDist`. ✓
- Unique-nearest / tie → Task 2 `tie` logic + test. ✓
- `kind`/`severity`/`category`/`tokenIds`/"already exists" → Task 3 emit + tests. ✓
- Module split (grammar leaf vs scanner traversal) → Task 1–3 file layout. ✓
- No UI change; verify generic rendering → Task 4 Step 4. ✓
- `heading→leading` FP suppressed → Task 3 frequency-guard test. ✓
- Out of scope (`ring-width 2`) → not in any task, as specified. ✓

**Placeholder scan:** none — every code/test step contains full content.

**Type consistency:** `damerauLevenshtein(string,string):number`, `suggestVocabWord(string, number?):VocabSuggestion|null`, `detectPossibleTypos(TokenGraph):ScanIssue[]` are used consistently across tasks. `ScanIssue` fields (`id`,`category`,`severity`,`kind`,`message`,`tokenIds`) match `src/token-graph.ts`. `makeNode`/`makeGraph` signatures match `src/scanner.test.ts`.

// Spelling-typo detection for token-id segments. Pure, leaf module: depends only
// on the component vocabulary in this package. The scanner orchestrates the
// graph traversal and frequency guard; this file answers the narrow question
// "is this one segment a likely misspelling of a value-bearing vocab word?".

import {
  NON_PART_SEGMENTS,
  KNOWN_VARIANT_NAMES,
  SIZE_KEYS,
} from "./component-vocab.js";

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

  const d: number[][] = [];
  for (let i = 0; i <= al; i++) {
    const row: number[] = [];
    for (let j = 0; j <= bl; j++) {
      row.push(0);
    }
    d.push(row);
  }

  for (let i = 0; i <= al; i++) d[i]![0] = i;
  for (let j = 0; j <= bl; j++) d[0]![j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = d[i - 1]![j]! + 1;
      const ins = d[i]![j - 1]! + 1;
      const sub = d[i - 1]![j - 1]! + cost;
      const canTranspose =
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      const trans = canTranspose ? d[i - 2]![j - 2]! + 1 : Infinity;
      d[i]![j] = Math.min(del, ins, sub, trans);
    }
  }
  return d[al]![bl]!;
}

/** Value-bearing words worth suggesting toward (length >= 4 only — short words
 *  like `bg`/`gap` are too collision-prone to be useful targets). */
const SUGGESTION_TARGETS: readonly string[] = [
  // Set deduplicates any word present in both sources — keep it: scoring a
  // target twice would mask a genuine tie in suggestVocabWord.
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

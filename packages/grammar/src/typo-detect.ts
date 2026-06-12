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

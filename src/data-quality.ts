// Graph-wide data-quality detectors that don't belong to the per-component scan.
// Currently: spelling-typo detection over token-id segments.

import type { TokenGraph, ScanIssue } from "./token-graph.js";
import { suggestVocabWord } from "@tg/grammar";

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

interface TypoHit {
  segment: string;
  suggestion: string;
  ids: string[];
}

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
  const hits = new Map<string, TypoHit>();
  for (const node of graph.nodes.values()) {
    const seen = new Set<string>();
    for (const seg of node.id.split("-")) {
      if (seen.has(seg)) continue;
      seen.add(seg);
      if (seg.length < MIN_TYPO_SEGMENT_LEN) continue;
      if (/^\d+$/.test(seg)) continue;
      if ((segFreq.get(seg) ?? 0) >= INTENTIONAL_FREQ) continue;
      // Allow 2 edits only for longer segments (>=7 chars), where the
      // false-positive risk of a 2-edit match is low.
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
    // Reconstruct the corrected id for the message. Replaces every occurrence of
    // the typo segment; real token ids never repeat a segment, so this is exact.
    const fixedId = ids[0]!
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

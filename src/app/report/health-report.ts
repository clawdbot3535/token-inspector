import type { TokenGraph, ScanReport } from "@core/token-graph.js";
import { ownerOf, type Owner } from "../resolve/owner-of.js";
import { shadcnThemeStats } from "../../renderers/shadcn/shadcn-theme.js";
import { genericTokenStats } from "../../renderers/generic/generic-tokens.js";

// A shareable, stakeholder-readable Markdown digest of the scan. Pure aggregation
// over (graph, scanReport) — no new analysis. The owner taxonomy is the heart of
// it: it frames every deviation by WHO fixes it, so the diagnosis is communicable
// to designers / design-system leads, not just devs. Deterministic (no timestamp)
// so the output is stable + git-diff-friendly.

// Designer action items grouped into buckets, ordered most-actionable first, so
// the section reads as a prioritized checklist instead of a flat wall of items.
const ACTION_BUCKETS: ReadonlyMap<string, { label: string; order: number }> = new Map([
  ["possible-typo", { label: "Typos & naming", order: 1 }],
  ["malformed-value", { label: "Typos & naming", order: 1 }],
  ["asymmetric-variant-coverage", { label: "Variant coverage gaps", order: 2 }],
  ["asymmetric-size-coverage", { label: "Size scale gaps", order: 3 }],
  ["incomplete-size-variant", { label: "Size scale gaps", order: 3 }],
  ["non-suffix-vs-size-conflict", { label: "Size scale gaps", order: 3 }],
  ["orphaned-size-key", { label: "Size scale gaps", order: 3 }],
  ["mode-invariant-semantic", { label: "Mode-invariant colors", order: 4 }],
  ["snap-to-tailwind", { label: "Snap to the Tailwind scale", order: 5 }],
  ["collection-anatomy-mismatch", { label: "Collection anatomy", order: 6 }],
]);

const OWNER_ROWS: ReadonlyArray<{ owner: Owner | "other"; label: string; action: string }> = [
  { owner: "figma-fix", label: "🎨 Figma-Fix", action: "Add or align tokens in Figma" },
  { owner: "data-quality", label: "🛠 Data-Quality", action: "Fix the source value or name" },
  { owner: "manual-dev", label: "🔧 Manual-Dev", action: "Hand-code in the Nuxt app" },
  { owner: "heuristic", label: "🔁 Heuristic", action: "Reroutable in the inspector" },
  { owner: "by-design", label: "⊘ by-design", action: "Inherent Nuxt UI constraint — nothing to do" },
  { owner: "other", label: "Other", action: "Un-owned" },
];

export function buildHealthReport(graph: TokenGraph, report: ScanReport): string {
  const lines: string[] = [];
  const componentCount = report.forecast.components.length;
  const tokenCount = graph.nodes.size;

  const sev = { error: 0, warning: 0, hint: 0 };
  for (const i of report.issues) sev[i.severity] += 1;

  lines.push("# Design System Health Report", "");
  lines.push(
    `${componentCount} components · ${tokenCount} tokens · ` +
      `scan: ${sev.error} errors · ${sev.warning} warnings · ${sev.hint} hints`,
    "",
  );

  // ── Deviations by owner ──────────────────────────────────────────────────
  const counts = new Map<string, number>();
  for (const i of report.issues) {
    const o = ownerOf(i) ?? "other";
    counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  lines.push("## Deviations by owner — who fixes what", "");
  lines.push("| Owner | Count | Action |", "| --- | --- | --- |");
  for (const row of OWNER_ROWS) {
    lines.push(`| ${row.label} | ${counts.get(row.owner) ?? 0} | ${row.action} |`);
  }
  lines.push("");

  // ── Component completeness ───────────────────────────────────────────────
  lines.push("## Component completeness", "");
  lines.push("| Component | Status |", "| --- | --- |");
  for (const comp of report.forecast.components) {
    const incomplete = comp.variants.filter((v) => v.defined < v.total);
    const status =
      incomplete.length === 0
        ? "✓ complete"
        : incomplete
            .map((v) => `⚠ ${v.axis} ${v.variantKey} ${v.defined}/${v.total} (missing ${v.missingUtilities.join(", ")})`)
            .join("; ");
    lines.push(`| ${comp.name} | ${status} |`);
  }
  lines.push("");

  // ── Designer action items (figma-fix + data-quality) ─────────────────────
  const designerItems = report.issues.filter((i) => {
    const o = ownerOf(i);
    return o === "figma-fix" || o === "data-quality";
  });
  lines.push("## Designer action items (🎨 Figma-Fix + 🛠 Data-Quality)", "");
  if (designerItems.length === 0) {
    lines.push("_None — the design maps cleanly._", "");
  } else {
    const byBucket = new Map<string, { order: number; messages: string[] }>();
    for (const i of designerItems) {
      const bucket = ACTION_BUCKETS.get(i.kind) ?? { label: "Other", order: 99 };
      const entry = byBucket.get(bucket.label) ?? { order: bucket.order, messages: [] };
      entry.messages.push(i.message);
      byBucket.set(bucket.label, entry);
    }
    const groups = [...byBucket.entries()].sort((a, b) => a[1].order - b[1].order);
    for (const [label, { messages }] of groups) {
      lines.push(`### ${label} (${messages.length})`, "");
      for (const m of messages) lines.push(`- [ ] ${m}`);
      lines.push("");
    }
  }

  // ── Output targets ───────────────────────────────────────────────────────
  // Summarize the whole multi-target output, not just the Nuxt mapping — and
  // surface each target's coverage (the shadcn gaps otherwise hide in a comment).
  const shadcn = shadcnThemeStats(graph);
  const generic = genericTokenStats(graph);
  const shadcnCoverage =
    shadcn.missing.length > 0
      ? `${shadcn.mapped} theme vars (${shadcn.missing.length} skipped — no source token)`
      : `${shadcn.mapped} theme vars + sidebar (mirrors the main palette); a \`--chart-*\` palette is a manual choice`;
  lines.push("## Output targets", "");
  lines.push("| Target | Output | Coverage |", "| --- | --- | --- |");
  lines.push(`| Nuxt UI | \`nuxt/app.config.ts\` + runnable \`kit/\` | ${componentCount} components |`);
  lines.push(`| shadcn/ui | \`shadcn/globals.css\` | ${shadcnCoverage} |`);
  lines.push(
    `| Generic | \`tokens/\` (\`variables.css\`, \`tokens.json\`, \`tokens.ts\`) | ${generic.total} design tokens (${generic.dark} with dark-mode) |`,
  );
  lines.push("");

  // ── Output forecast ──────────────────────────────────────────────────────
  const f = report.forecast.tokensCss;
  lines.push("## Output forecast", "");
  lines.push(
    `~${Math.round(f.estimatedBytes / 100) / 10} KB tokens.css · ${f.tailwindMatches} Tailwind matches · ` +
      `${f.themeExtensions} theme extensions · ${f.modeVariantEntries} mode-variant entries`,
    "",
  );

  return lines.join("\n");
}

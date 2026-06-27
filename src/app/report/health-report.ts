import type { TokenGraph, ScanReport } from "@core/token-graph.js";
import { ownerOf, type Owner } from "../resolve/owner-of.js";
import { shadcnThemeStats } from "../../renderers/shadcn/shadcn-theme.js";
import { genericTokenStats } from "../../renderers/generic/generic-tokens.js";

// A shareable, stakeholder-readable Markdown digest of the scan. Pure aggregation
// over (graph, scanReport) — no new analysis. The owner taxonomy is the heart of
// it: it frames every deviation by WHO fixes it, so the diagnosis is communicable
// to designers / design-system leads, not just devs. Deterministic (no timestamp)
// so the output is stable + git-diff-friendly.

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
    for (const i of designerItems) lines.push(`- [ ] ${i.message}`);
    lines.push("");
  }

  // ── Output targets ───────────────────────────────────────────────────────
  // Summarize the whole multi-target output, not just the Nuxt mapping — and
  // surface each target's coverage (the shadcn gaps otherwise hide in a comment).
  const shadcn = shadcnThemeStats(graph);
  const generic = genericTokenStats(graph);
  const shadcnCoverage =
    shadcn.missing.length > 0
      ? `${shadcn.mapped} theme vars (${shadcn.missing.length} skipped — no source token)`
      : `${shadcn.mapped} theme vars (\`--chart-*\`/\`--sidebar-*\` have no Figma equivalent — add manually)`;
  lines.push("## Output targets", "");
  lines.push("| Target | Output | Coverage |", "| --- | --- | --- |");
  lines.push(`| Nuxt UI | \`nuxt/app.config.ts\` + runnable \`kit/\` | ${componentCount} components |`);
  lines.push(`| shadcn/ui | \`shadcn/globals.css\` | ${shadcnCoverage} |`);
  lines.push(
    `| Generic | \`tokens/variables.css\` + \`tokens/tokens.json\` | ${generic.total} design tokens (${generic.dark} with dark-mode) |`,
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

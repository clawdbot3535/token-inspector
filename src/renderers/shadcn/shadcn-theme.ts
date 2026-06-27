import type { TokenGraph } from "../../token-graph.js";

// A shadcn/ui theme (globals.css) generated from the Figma semantic tokens.
// shadcn theming is primarily CSS variables — components are copied in and read
// `--background`, `--primary`, `--radius`, … — so a real, usable shadcn theme is
// reachable WITHOUT the per-component recipe machinery (that is Nuxt UI's job).
//
// The map below is curated, but both vocabularies follow the same modern semantic
// conventions, so the overlap is near 1:1. A shadcn var whose source token is
// absent is skipped (never broken CSS) and listed in a trailing comment.

/** shadcn CSS var (without `--`) → our semantic token id. */
const COLOR_MAP: ReadonlyArray<readonly [string, string]> = [
  ["background", "color-bg-base"],
  ["foreground", "color-text-primary"],
  ["card", "color-bg-elevated"],
  ["card-foreground", "color-text-primary"],
  ["popover", "color-bg-elevated"],
  ["popover-foreground", "color-text-primary"],
  ["primary", "color-action-bg"],
  ["primary-foreground", "color-action-text"],
  ["secondary", "color-action-bg-subtle"],
  ["secondary-foreground", "color-action-text-subtle"],
  ["muted", "color-bg-muted"],
  ["muted-foreground", "color-text-muted"],
  ["accent", "color-action-bg-subtle"],
  ["accent-foreground", "color-text-accent"],
  // color-border-error is a saturated red in BOTH modes (#EF4444 / #DC2626) —
  // the right source for shadcn's vivid destructive action, not the pale error-bg.
  ["destructive", "color-border-error"],
  ["destructive-foreground", "color-text-on-accent"],
  ["border", "color-border-default"],
  ["input", "color-border-default"],
  ["ring", "color-state-focus-ring"],
];

/** Tried in order for shadcn's single base `--radius`; first present wins. */
const RADIUS_TOKEN_CANDIDATES = ["rounded-md", "rounded-lg", "rounded-sm"] as const;
const RADIUS_FALLBACK = "0.5rem";

interface Row {
  readonly cssVar: string;
  readonly light?: string;
  readonly dark?: string;
}

function resolveRows(graph: TokenGraph): { rows: Row[]; missing: string[] } {
  const rows: Row[] = [];
  const missing: string[] = [];
  for (const [cssVar, tokenId] of COLOR_MAP) {
    const node = graph.nodes.get(tokenId);
    if (!node) {
      missing.push(`--${cssVar} (${tokenId})`);
      continue;
    }
    rows.push({ cssVar, light: node.cssValue.light ?? node.cssValue.base, dark: node.cssValue.dark });
  }
  return { rows, missing };
}

/** Coverage of the shadcn theme: how many of the curated vars resolved to a
 *  Figma token, and which had no source token. (`--chart-*`/`--sidebar-*` are
 *  not counted — they are deliberately not attempted, see the renderer comment.) */
export function shadcnThemeStats(graph: TokenGraph): { mapped: number; missing: readonly string[] } {
  const { rows, missing } = resolveRows(graph);
  return { mapped: rows.length, missing };
}

export function buildShadcnTheme(graph: TokenGraph): string {
  const { rows, missing } = resolveRows(graph);

  let radius = RADIUS_FALLBACK;
  for (const cand of RADIUS_TOKEN_CANDIDATES) {
    const v = graph.nodes.get(cand)?.cssValue.base;
    if (v) {
      radius = v;
      break;
    }
  }

  const lines: string[] = [];
  lines.push("/* shadcn/ui theme — generated from Figma tokens by token-inspector. */", "");

  lines.push(":root {");
  lines.push(`  --radius: ${radius};`);
  for (const r of rows) if (r.light) lines.push(`  --${r.cssVar}: ${r.light};`);
  lines.push("}", "");

  lines.push(".dark {");
  for (const r of rows) if (r.dark) lines.push(`  --${r.cssVar}: ${r.dark};`);
  lines.push("}", "");

  lines.push("@theme inline {");
  for (const r of rows) lines.push(`  --color-${r.cssVar}: var(--${r.cssVar});`);
  lines.push("  --radius-sm: calc(var(--radius) - 4px);");
  lines.push("  --radius-md: calc(var(--radius) - 2px);");
  lines.push("  --radius-lg: var(--radius);");
  lines.push("  --radius-xl: calc(var(--radius) + 4px);");
  lines.push("}");

  if (missing.length > 0) {
    lines.push("", `/* Not mapped — no matching Figma token, add manually: ${missing.join(", ")}. */`);
  }
  lines.push("/* No clean Figma equivalent — add manually if needed: --chart-1..5, --sidebar-*. */");

  return lines.join("\n") + "\n";
}

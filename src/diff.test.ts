// One-shot comparison: new builder+renderer vs the original build-tokens.mjs output.

import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGraph } from "./build-graph.js";
import { cssRenderer } from "./renderers/css.js";
import type { SourceFile, SourceLayer } from "./token-graph.js";

const ROOT = resolve(__dirname, "..");
const FILES: Record<SourceLayer, string> = {
  color: "color.tokens.json",
  dimension: "dimension.tokens.json",
  typography: "typography.tokens.json",
  light: "light.tokens.json",
  dark: "dark.tokens.json",
  global: "global.tokens.json",
};

function collectDecls(text: string): Map<string, string[]> {
  const lines = text.split("\n");
  const out = new Map<string, string[]>();
  for (const line of lines) {
    const m = line.match(/^\s*(--[a-z0-9-]+):\s*([^;]+);/i);
    if (!m) continue;
    const arr = out.get(m[1]) ?? [];
    arr.push(m[2].trim());
    out.set(m[1], arr);
  }
  return out;
}

describe("diff: original build-tokens.mjs output vs new pipeline", () => {
  it("reports declaration-level differences", () => {
    const sources: SourceFile[] = (Object.entries(FILES) as [SourceLayer, string][]).map(
      ([name, file]) => ({
        name,
        data: JSON.parse(readFileSync(resolve(ROOT, "components", file), "utf8")),
      }),
    );
    const graph = buildGraph(sources);
    const rendered = cssRenderer.render(graph);
    const orig = readFileSync(resolve(ROOT, "output/tokens.css"), "utf8");

    const a = collectDecls(orig);
    const b = collectDecls(rendered.text);

    const aKeys = new Set(a.keys());
    const bKeys = new Set(b.keys());
    const both = [...aKeys].filter((k) => bKeys.has(k));
    const onlyA = [...aKeys].filter((k) => !bKeys.has(k));
    const onlyB = [...bKeys].filter((k) => !aKeys.has(k));
    const valueDiffs: string[] = [];
    for (const k of both) {
      const av = a.get(k)!.join(" | ");
      const bv = b.get(k)!.join(" | ");
      if (av !== bv) valueDiffs.push(`${k}: orig=[${av}] new=[${bv}]`);
    }
    console.log(
      JSON.stringify(
        {
          graphNodes: graph.nodes.size,
          issues: graph.issues.length,
          origDecls: aKeys.size,
          newDecls: bKeys.size,
          onlyOrig: onlyA.length,
          onlyNew: onlyB.length,
          valueDiffs: valueDiffs.length,
          firstOnlyOrig: onlyA.slice(0, 5),
          firstOnlyNew: onlyB.slice(0, 5),
          firstValueDiffs: valueDiffs.slice(0, 5),
          lineMapEntries: rendered.lines.size,
          origBytes: orig.length,
          newBytes: rendered.text.length,
        },
        null,
        2,
      ),
    );
  });
});

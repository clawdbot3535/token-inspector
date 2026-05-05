// Regression guard: the real Figma export should build cleanly with no
// graph issues. If this fails in the future, run with `console.log` to
// re-categorize before fixing forward.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGraph } from "./build-graph.js";
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

describe("issues against real Figma export", () => {
  it("graph builds with zero issues", () => {
    const sources: SourceFile[] = (Object.entries(FILES) as [SourceLayer, string][]).map(
      ([name, file]) => ({
        name,
        data: JSON.parse(readFileSync(resolve(ROOT, "components", file), "utf8")),
      }),
    );
    const graph = buildGraph(sources);
    if (graph.issues.length > 0) {
      const byKind: Record<string, number> = {};
      for (const i of graph.issues) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
      console.log("Issue breakdown:", byKind);
      console.log("First 5:", graph.issues.slice(0, 5));
    }
    expect(graph.issues.length).toBe(0);
  });
});

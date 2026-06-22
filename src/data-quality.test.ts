// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "./build-graph.js";
import type { SourceFile } from "./token-graph.js";
import { detectPossibleTypos } from "./data-quality.js";

function typoGraph() {
  // "heigth" is a near-miss of the vocab word "height".
  const sources: SourceFile[] = [
    { name: "global", data: { button: { heigth: { md: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("detectPossibleTypos structured suggestion", () => {
  it("emits typoFrom/typoTo on the possible-typo issue", () => {
    const issues = detectPossibleTypos(typoGraph());
    const typo = issues.find((i) => i.kind === "possible-typo" && i.tokenIds.includes("button-heigth-md"));
    expect(typo, "expected a possible-typo issue for button-heigth-md").toBeDefined();
    expect(typo!.typoFrom).toBe("heigth");
    expect(typo!.typoTo).toBe("height");
  });
});

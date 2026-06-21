// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import { scanGraph } from "@core/scanner.js";
import type { SourceFile } from "@core/token-graph.js";
import { heuristicExtendable, guessUtilityType } from "./heuristic-extendable.js";

function mysteryGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { mystery: { bg: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("guessUtilityType", () => {
  it("guesses from the token name suffix", () => {
    expect(guessUtilityType("button-mystery-bg")).toBe("bg-color");
    expect(guessUtilityType("button-foo-padding-x")).toBe("padding-x");
    expect(guessUtilityType("button-foo-radius")).toBe("rounded");
    expect(guessUtilityType("chip-close-button-size")).toBe("size");
  });
});

describe("heuristicExtendable", () => {
  it("returns a resolvable for an unsupported-part token with candidate slots + a guess", () => {
    const report = scanGraph(mysteryGraph(), { components: ["button"] });
    const resolvables = heuristicExtendable(report);
    const r = resolvables.find((x) => x.tokenId === "button-mystery-bg");
    expect(r, "expected button-mystery-bg to be resolvable").toBeDefined();
    expect(r!.component).toBe("button");
    expect(r!.candidateSlots).toContain("base");
    expect(r!.guess.utilityType).toBe("bg-color");
    expect(typeof r!.guess.slot).toBe("string");
  });

  it("ignores by-design kinds (no state-via-prop / unsupported-state)", () => {
    const report = scanGraph(mysteryGraph(), { components: ["button"] });
    const kinds = new Set(heuristicExtendable(report).map((r) => r.kind));
    expect(kinds.has("state-via-prop")).toBe(false);
    expect(kinds.has("unsupported-state")).toBe(false);
  });
});

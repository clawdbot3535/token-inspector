// @vitest-environment node
import { describe, it, expect } from "vitest";
import { customComponentsRenderer } from "./custom-components.js";
import { buildGraph } from "../build-graph.js";
import type { SourceFile } from "../token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";

function chipGraph() {
  return buildGraph([
    { name: "global", data: { chip: { close: { radius: { $value: 8, $type: "dimension" } } } } },
  ] as SourceFile[]);
}
const parts = new Map([["chip", ["close"]]]);

describe("customComponentsRenderer slotMappingOverride", () => {
  it("threads a session override into the rendered custom recipe", () => {
    const g = chipGraph();
    const override: SlotMappingOverride = {
      "chip-close-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const withOverride = customComponentsRenderer.render(g, { customParts: parts, slotMappingOverride: override }).text;
    const auto = customComponentsRenderer.render(g, { customParts: parts }).text;
    expect(withOverride).not.toBe(auto);
    expect(withOverride).toContain("rounded");
  });
});

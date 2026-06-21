// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { SourceFile } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";

function mysteryGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { mystery: { radius: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("slotMappingOverride routes a previously-unmapped token", () => {
  it("places button-mystery-radius into base/rounded when overridden", () => {
    const g = mysteryGraph();
    const override: SlotMappingOverride = {
      "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const withOverride = buildComponentRecipes(g, { components: ["button"], slotMappingOverride: override })["button"];
    const without = buildComponentRecipes(g, { components: ["button"] })["button"];
    expect(JSON.stringify(withOverride)).not.toBe(JSON.stringify(without));
    expect(withOverride?.slots?.base ?? "").toContain("rounded");
  });
});

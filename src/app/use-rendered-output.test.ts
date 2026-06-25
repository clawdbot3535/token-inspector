// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { createAppState, useRenderedOutput } from "./state.js";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";

function mysteryGraph() {
  return buildGraph([
    { name: "global", data: { button: { mystery: { radius: { $value: 8, $type: "dimension" } } } } },
  ] as SourceFile[]);
}
const override: SlotMappingOverride = {
  "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
};

describe("useRenderedOutput slotMappingOverride", () => {
  it("threads a session override into the app.config.ts render", () => {
    const state = createAppState();
    state.graph.value = mysteryGraph();
    state.outputTab.value = "app.config.ts";

    const withOverride = useRenderedOutput(state, undefined, undefined, ref(override));
    const without = useRenderedOutput(state, undefined, undefined, ref<SlotMappingOverride>({}));

    expect(withOverride.value?.text).toContain("rounded");
    expect(withOverride.value?.text).not.toBe(without.value?.text);
  });
});

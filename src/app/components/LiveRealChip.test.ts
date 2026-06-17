// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealChip from "./LiveRealChip.vue";

function chipGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      radius: { $value: 999, $type: "number" },
      "label-text": { $value: "#18181B", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const parts = new Map<string, readonly string[]>([["chip", ["label", "close"]]]);

describe("LiveRealChip", () => {
  it("renders the chip anatomy with the base slot sentinel-stamped", () => {
    const w = mount(LiveRealChip, { props: { graph: chipGraph(), customParts: parts } });
    const base = w.find('[data-testid="real-chip"]');
    expect(base.exists()).toBe(true);
    expect(base.classes()).toContain("ti-slot-base");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealChip, { props: { graph: null, customParts: parts } });
    expect(w.find('[data-testid="real-chip"]').exists()).toBe(false);
    expect(w.text()).toContain("No chip recipe");
  });
});

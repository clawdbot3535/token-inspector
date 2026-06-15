// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveChip from "./LiveChip.vue";

function chipGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      radius: { $value: 999, $type: "number" },
      "label-text": { $value: "#18181B", $type: "color" },
      "bg-error": { $value: "#FECACA", $type: "color" },
      "bg-success": { $value: "#BBF7D0", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const parts = new Map<string, readonly string[]>([["chip", ["label", "close"]]]);
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveChip", () => {
  it("shows a fallback message when the graph has no chip tokens", () => {
    const wrapper = mount(LiveChip, { props: { graph: null, customParts: parts }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="chip"]')).toHaveLength(0);
  });
  it("renders a default pill plus one per color variant, styled from tokens", () => {
    const wrapper = mount(LiveChip, { props: { graph: chipGraph(), customParts: parts }, ...mountOpts });
    const pills = wrapper.findAll('[data-testid="chip"]');
    expect(pills).toHaveLength(3); // default + error + success
    expect((pills[0]!.element as HTMLElement).style.backgroundColor).not.toBe("");
  });
});

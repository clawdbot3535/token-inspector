// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveSwitch from "./LiveSwitch.vue";

function switchGraph() {
  const global = {
    switch: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "bg-checked": { $value: "#4F63D2", $type: "color" },
      border: { $value: "#D4D4D8", $type: "color" },
      "width-md": { $value: 36, $type: "number" },
      "height-md": { $value: 20, $type: "number" },
      radius: { $value: 9999, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveSwitch", () => {
  it("shows a fallback message when the graph has no switch tokens", () => {
    const wrapper = mount(LiveSwitch, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="switch-track"]')).toHaveLength(0);
  });
  it("renders an unchecked and a checked track with a thumb, and the checked bg differs", () => {
    const wrapper = mount(LiveSwitch, { props: { graph: switchGraph() }, ...mountOpts });
    const tracks = wrapper.findAll('[data-testid="switch-track"]');
    expect(tracks.length).toBe(2);
    expect(wrapper.findAll('[data-testid="switch-thumb"]').length).toBe(2);
    const bgs = tracks.map((t) => (t.element as HTMLElement).style.backgroundColor);
    // unchecked bg (#E4E4E7) vs checked bg (#4F63D2) — both resolved inline (JIT-safe).
    expect(bgs[0]).not.toBe(bgs[1]);
    expect(bgs.every((b) => b !== "")).toBe(true);
  });
});

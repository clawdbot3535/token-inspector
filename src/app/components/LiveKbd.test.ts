// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveKbd from "./LiveKbd.vue";

function kbdGraph() {
  const global = {
    kbd: {
      bg: { $value: "#F4F4F5", $type: "color" },
      "padding-x": { $value: 2, $type: "number" },
      radius: { $value: 2, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveKbd", () => {
  it("shows a fallback message when the graph has no kbd tokens", () => {
    const wrapper = mount(LiveKbd, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="kbd-key"]')).toHaveLength(0);
  });
  it("renders a keycap whose background comes from the token", () => {
    const wrapper = mount(LiveKbd, { props: { graph: kbdGraph() }, ...mountOpts });
    const key = wrapper.find('[data-testid="kbd-key"]');
    expect(key.exists()).toBe(true);
    expect((key.element as HTMLElement).style.backgroundColor).not.toBe("");
  });
});

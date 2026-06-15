// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveCard from "./LiveCard.vue";

function cardGraph() {
  const global = {
    card: {
      bg: { $value: "#FFFFFF", $type: "color" },
      padding: { $value: 24, $type: "number" },
      radius: { $value: 8, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveCard", () => {
  it("shows a fallback message when the graph has no card tokens", () => {
    const wrapper = mount(LiveCard, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="card-root"]')).toHaveLength(0);
  });
  it("renders a card box whose background comes from the token", () => {
    const wrapper = mount(LiveCard, { props: { graph: cardGraph() }, ...mountOpts });
    const box = wrapper.find('[data-testid="card-root"]');
    expect(box.exists()).toBe(true);
    expect((box.element as HTMLElement).style.backgroundColor).not.toBe("");
  });
});

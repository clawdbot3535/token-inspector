// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveDropdown from "./LiveDropdown.vue";

function dropdownGraph() {
  const global = {
    dropdown: {
      bg: { $value: "#FFFFFF", $type: "color" },
      border: { $value: "#E4E4E7", $type: "color" },
      radius: { $value: 8, $type: "number" },
      "item-bg-hover": { $value: "#F4F4F5", $type: "color" },
      "item-bg-active": { $value: "#E4E4E7", $type: "color" },
      "item-padding": { $value: 8, $type: "number" },
      "item-radius": { $value: 6, $type: "number" },
      "item-text": { $value: "#18181B", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveDropdown", () => {
  it("shows a fallback message when the graph has no dropdown tokens", () => {
    const wrapper = mount(LiveDropdown, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="dropdown-content"]')).toHaveLength(0);
  });
  it("renders a content surface with default/hover/active item rows", () => {
    const wrapper = mount(LiveDropdown, { props: { graph: dropdownGraph() }, ...mountOpts });
    expect(wrapper.find('[data-testid="dropdown-content"]').exists()).toBe(true);
    const items = wrapper.findAll('[data-testid="dropdown-item"]');
    expect(items).toHaveLength(3);
    // The hover row promotes hover:bg-[…] to an applied background.
    expect((items[1]!.element as HTMLElement).style.backgroundColor).not.toBe("");
  });
});

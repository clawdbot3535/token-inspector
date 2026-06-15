// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveModal from "./LiveModal.vue";

function modalGraph() {
  const global = {
    modal: {
      bg: { $value: "#FFFFFF", $type: "color" },
      "overlay-bg": { $value: "#000000", $type: "color" },
      padding: { $value: 12, $type: "number" },
      radius: { $value: 12, $type: "number" },
      border: { $value: "#E4E4E7", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveModal", () => {
  it("shows a fallback message when the graph has no modal tokens", () => {
    const wrapper = mount(LiveModal, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="modal-overlay"]')).toHaveLength(0);
  });
  it("renders an overlay with a content panel whose background comes from the token", () => {
    const wrapper = mount(LiveModal, { props: { graph: modalGraph() }, ...mountOpts });
    expect(wrapper.find('[data-testid="modal-overlay"]').exists()).toBe(true);
    const content = wrapper.find('[data-testid="modal-content"]');
    expect(content.exists()).toBe(true);
    expect((content.element as HTMLElement).style.backgroundColor).not.toBe("");
  });
});

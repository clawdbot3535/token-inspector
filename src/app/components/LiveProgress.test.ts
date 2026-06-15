// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveProgress from "./LiveProgress.vue";

function progressGraph() {
  const global = {
    progress: {
      "track-bg": { $value: "#E4E4E7", $type: "color" },
      "fill-bg": { $value: "#5667A7", $type: "color" },
      "height-md": { $value: 8, $type: "number" },
      radius: { $value: 999, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveProgress", () => {
  it("shows a fallback message when the graph has no progress tokens", () => {
    const wrapper = mount(LiveProgress, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="progress-track"]')).toHaveLength(0);
  });
  it("renders a track and an indicator fill with distinct backgrounds", () => {
    const wrapper = mount(LiveProgress, { props: { graph: progressGraph() }, ...mountOpts });
    const track = wrapper.find('[data-testid="progress-track"]');
    const indicator = wrapper.find('[data-testid="progress-indicator"]');
    expect(track.exists()).toBe(true);
    expect(indicator.exists()).toBe(true);
    const tbg = (track.element as HTMLElement).style.backgroundColor;
    const ibg = (indicator.element as HTMLElement).style.backgroundColor;
    expect(tbg).not.toBe("");
    expect(ibg).not.toBe("");
    expect(tbg).not.toBe(ibg);
    expect((indicator.element as HTMLElement).style.width).toBe("60%");
  });
});

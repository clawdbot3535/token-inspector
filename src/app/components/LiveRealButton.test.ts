// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealButton from "./LiveRealButton.vue";

function buttonGraph() {
  const global = {
    button: {
      radius: { $value: 8, $type: "number" },
      bg: { $value: "#3b82f6", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// Capture the :ui prop the real UButton would receive.
const UButtonStub = {
  props: ["ui", "variant", "size"],
  template: '<button data-testid="real-ubutton" :data-ui="JSON.stringify(ui)"><slot /></button>',
};
const mountOpts = { global: { stubs: { UButton: UButtonStub, UIcon: true } } };

describe("LiveRealButton", () => {
  it("renders a real UButton and passes the generated recipe's base classes via :ui", () => {
    const w = mount(LiveRealButton, {
      props: { graph: buttonGraph(), componentName: "button" },
      ...mountOpts,
    });
    const btn = w.find('[data-testid="real-ubutton"]');
    expect(btn.exists()).toBe(true);
    const ui = JSON.parse(btn.attributes("data-ui") ?? "{}");
    expect(typeof ui.base).toBe("string");
    expect(ui.base.length).toBeGreaterThan(0); // carries the generated recipe classes
  });

  it("shows a fallback (no UButton) when the graph is null", () => {
    const w = mount(LiveRealButton, {
      props: { graph: null, componentName: "button" },
      ...mountOpts,
    });
    expect(w.find('[data-testid="real-ubutton"]').exists()).toBe(false);
  });
});

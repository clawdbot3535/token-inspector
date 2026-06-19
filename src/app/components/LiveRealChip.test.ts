// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealChip from "./LiveRealChip.vue";
import RealVariantCell from "./RealVariantCell.vue";

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
    expect(base.classes()).toContain("rounded-[999px]");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealChip, { props: { graph: null, customParts: parts } });
    expect(w.find('[data-testid="real-chip"]').exists()).toBe(false);
    expect(w.text()).toContain("No chip recipe");
  });
});

// chip graph with colour variants (error/success) so buildVariantCells yields cells
function chipColorGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "bg-error": { $value: "#FECACA", $type: "color" },
      "bg-success": { $value: "#BBF7D0", $type: "color" },
    },
  };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealChip — colour cells", () => {
  it("renders a RealVariantCell per colour variant", () => {
    const w = mount(LiveRealChip, { props: { graph: chipColorGraph(), customParts: parts } });
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(2); // error + success
  });
});

function chipCloseGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "close-button-size": { $value: 16, $type: "number" },
    },
  };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealChip — close button", () => {
  it("renders the close as a <button> wrapping the close-slotted span", () => {
    const w = mount(LiveRealChip, { props: { graph: chipCloseGraph(), customParts: parts } });
    const btn = w.find('[data-testid="real-chip"] button');
    expect(btn.exists()).toBe(true);
    const span = btn.find("span");
    expect(span.classes()).toContain("ti-slot-close");
    expect(span.classes().some((c) => c.startsWith("size-["))).toBe(true);
  });
});

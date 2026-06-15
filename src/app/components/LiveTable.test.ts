// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveTable from "./LiveTable.vue";

function tableGraph() {
  const global = {
    table: {
      bg: { $value: "#FFFFFF", $type: "color" },
      border: { $value: "#E4E4E7", $type: "color" },
      radius: { $value: 8, $type: "number" },
      "th-bg": { $value: "#F4F4F5", $type: "color" },
      "th-text": { $value: "#52525B", $type: "color" },
      "td-text": { $value: "#18181B", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveTable", () => {
  it("shows a fallback message when the graph has no table tokens", () => {
    const wrapper = mount(LiveTable, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="table-root"]')).toHaveLength(0);
  });
  it("renders a table with header and body cells styled from tokens", () => {
    const wrapper = mount(LiveTable, { props: { graph: tableGraph() }, ...mountOpts });
    expect(wrapper.find('[data-testid="table-root"]').exists()).toBe(true);
    const th = wrapper.find('[data-testid="table-th"]');
    const td = wrapper.find('[data-testid="table-td"]');
    expect(th.exists()).toBe(true);
    expect(td.exists()).toBe(true);
    expect((th.element as HTMLElement).style.backgroundColor).not.toBe("");
    expect((td.element as HTMLElement).style.color).not.toBe("");
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealTable from "./LiveRealTable.vue";

function tableGraph() {
  const global = {
    table: {
      th: { padding: { $value: 8, $type: "number" } },
      td: { padding: { $value: 4, $type: "number" } },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const UTableStub = {
  props: ["data", "columns", "ui"],
  template: '<table data-testid="real-utable" :data-ui="JSON.stringify(ui)"></table>',
};
const mountOpts = { global: { stubs: { UTable: UTableStub, UIcon: true } } };

describe("LiveRealTable", () => {
  it("renders a real UTable and stamps th/td slots with recipe classes + sentinels", () => {
    const w = mount(LiveRealTable, { props: { graph: tableGraph(), componentName: "table" }, ...mountOpts });
    const t = w.find('[data-testid="real-utable"]');
    expect(t.exists()).toBe(true);
    const ui = JSON.parse(t.attributes("data-ui") ?? "{}");
    expect(ui.th).toContain("ti-slot-th");
    expect(ui.td).toContain("ti-slot-td");
    expect(ui.th.length).toBeGreaterThan("ti-slot-th".length); // also carries recipe classes
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealTable, { props: { graph: null, componentName: "table" }, ...mountOpts });
    expect(w.find('[data-testid="real-utable"]').exists()).toBe(false);
  });
});

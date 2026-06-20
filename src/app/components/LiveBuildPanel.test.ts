// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveBuildPanel from "./LiveBuildPanel.vue";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "dimension" } } } },
  ];
  return buildGraph(sources);
}
function fakeSubstrate() {
  return { openExternal: vi.fn() };
}
const stubs = {
  UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' },
};

describe("LiveBuildPanel", () => {
  it("disables the open button when there is no graph", () => {
    const wrapper = mount(LiveBuildPanel, { props: { graph: null, substrate: fakeSubstrate() }, global: { stubs } });
    expect(wrapper.get("[data-testid=live-build-open]").attributes("disabled")).toBeDefined();
  });

  it("does not open anything on mount (only on click)", () => {
    const substrate = fakeSubstrate();
    mount(LiveBuildPanel, { props: { graph: buttonGraph(), substrate }, global: { stubs } });
    expect(substrate.openExternal).not.toHaveBeenCalled();
  });

  it("opens the live build externally with the kit files when clicked", async () => {
    const substrate = fakeSubstrate();
    const wrapper = mount(LiveBuildPanel, { props: { graph: buttonGraph(), substrate }, global: { stubs } });
    await wrapper.get("[data-testid=live-build-open]").trigger("click");
    expect(substrate.openExternal).toHaveBeenCalledTimes(1);
    const [files] = substrate.openExternal.mock.calls[0]!;
    expect(files["package.json"]).toBeDefined();
    expect(files["src/App.vue"]).toBeDefined();
  });
});

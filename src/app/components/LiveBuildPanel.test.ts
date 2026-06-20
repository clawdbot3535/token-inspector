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
  return { embed: vi.fn().mockResolvedValue(undefined), openExternal: vi.fn() };
}
const stubs = {
  UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' },
};

describe("LiveBuildPanel", () => {
  it("disables the start button when there is no graph", () => {
    const wrapper = mount(LiveBuildPanel, { props: { graph: null, substrate: fakeSubstrate() }, global: { stubs } });
    expect(wrapper.get("[data-testid=live-build-start]").attributes("disabled")).toBeDefined();
  });

  it("does not auto-embed on mount (on-demand only)", () => {
    const substrate = fakeSubstrate();
    mount(LiveBuildPanel, { props: { graph: buttonGraph(), substrate }, global: { stubs } });
    expect(substrate.embed).not.toHaveBeenCalled();
  });

  it("embeds the live-build files when the start button is clicked", async () => {
    const substrate = fakeSubstrate();
    const wrapper = mount(LiveBuildPanel, { props: { graph: buttonGraph(), substrate }, global: { stubs } });
    await wrapper.get("[data-testid=live-build-start]").trigger("click");
    expect(substrate.embed).toHaveBeenCalledTimes(1);
    const [, files] = substrate.embed.mock.calls[0]!;
    expect(files["package.json"]).toBeDefined();
    expect(files["src/App.vue"]).toBeDefined();
  });
});

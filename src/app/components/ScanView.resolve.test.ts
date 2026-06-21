// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport } from "@core/token-graph.js";

function reportWith(kind: string, tokenIds: string[] = ["button-mystery-bg"]): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "warning", kind, message: "m", tokenIds, componentName: "button" }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView resolve affordance", () => {
  it("shows a Resolve button for an unresolved heuristic-extendable issue and emits resolve", async () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("unsupported-part") }, global: { stubs } });
    const btn = wrapper.find("[data-testid=resolve-issue]");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(wrapper.emitted("resolve")?.[0]?.[0]).toBe("button-mystery-bg");
  });

  it("shows NO Resolve button for a non-extendable issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("malformed-value") }, global: { stubs } });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });

  it("shows ✓ resolved (no Resolve button) when the token is in the resolved set", () => {
    const wrapper = mount(ScanView, {
      props: { report: reportWith("unsupported-part"), resolved: new Set(["button-mystery-bg"]) },
      global: { stubs },
    });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-done]").exists()).toBe(true);
  });

  it("still shows Resolve when a multi-token issue has one resolved and one not", () => {
    const wrapper = mount(ScanView, {
      props: { report: reportWith("component-looks-custom", ["button-mystery-bg", "button-other-bg"]), resolved: new Set(["button-mystery-bg"]) },
      global: { stubs },
    });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(true);
  });
});

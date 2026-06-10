// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import type { ScanReport } from "@core/token-graph.js";
import HeaderStatusStrip from "./HeaderStatusStrip.vue";

function report(): ScanReport {
  return {
    issues: [],
    completeness: [],
    forecast: {
      tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 },
      components: [],
      unmappedComponentPrefixes: [],
    },
    generatedAt: 0,
  };
}

describe("HeaderStatusStrip", () => {
  it("marks the strip pressed when the scan view is active", () => {
    const wrapper = mount(HeaderStatusStrip, {
      props: { report: report(), scanViewActive: true },
    });
    const btn = wrapper.find("button");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(btn.classes().join(" ")).toContain("ring-1");
  });

  it("is unpressed when the scan view is inactive", () => {
    const wrapper = mount(HeaderStatusStrip, {
      props: { report: report(), scanViewActive: false },
    });
    const btn = wrapper.find("button");
    expect(btn.attributes("aria-pressed")).toBe("false");
    expect(btn.classes().join(" ")).not.toContain("ring-1");
  });
});

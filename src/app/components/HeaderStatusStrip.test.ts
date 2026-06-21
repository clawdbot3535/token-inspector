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
      nonComponentPrefixes: [],
    },
    generatedAt: 0,
  };
}

function reportWith(tokenIds: string[]): ScanReport {
  return {
    issues: [
      {
        id: "a",
        category: "classification-hint",
        severity: "warning",
        kind: "unsupported-part",
        message: "m",
        tokenIds,
        componentName: "chip",
      },
    ],
    completeness: [],
    forecast: {
      tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 },
      components: [],
      unmappedComponentPrefixes: [],
      nonComponentPrefixes: [],
    },
    generatedAt: 0,
  } as ScanReport;
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

describe("HeaderStatusStrip resolved subtraction", () => {
  it("drops a fully-resolved warning from the warning count", () => {
    const r = reportWith(["chip-mystery-bg"]);
    const without = mount(HeaderStatusStrip, {
      props: { report: r, scanViewActive: false },
    });
    const withResolved = mount(HeaderStatusStrip, {
      props: { report: r, scanViewActive: false, resolved: new Set(["chip-mystery-bg"]) },
    });
    expect(without.text()).toContain("1 warnings");
    expect(withResolved.text()).toContain("0 warnings");
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";
import ScanView from "./ScanView.vue";

function issue(o: Partial<ScanIssue> & { id: string }): ScanIssue {
  return {
    id: o.id, category: o.category ?? "data-quality", severity: o.severity ?? "warning",
    kind: o.kind ?? "k", message: o.message ?? "msg", tokenIds: o.tokenIds ?? [],
    componentName: o.componentName, variantKey: o.variantKey,
  };
}
function report(issues: ScanIssue[]): ScanReport {
  return {
    issues,
    completeness: [
      { component: "button", axis: "size", variantKey: "md", defined: 3, total: 4, missingUtilities: ["gap"] },
    ],
    forecast: {
      tokensCss: { estimatedBytes: 1200, tailwindMatches: 52, themeExtensions: 10, modeVariantEntries: 44 },
      components: [],
      unmappedComponentPrefixes: [],
      nonComponentPrefixes: [],
    },
    generatedAt: 0,
  };
}

describe("ScanView", () => {
  const base = [
    issue({ id: "1", componentName: "button", severity: "warning", message: "button warn" }),
    issue({ id: "2", componentName: "badge", severity: "hint", message: "badge hint" }),
    issue({ id: "3", severity: "warning", message: "general warn", tokenIds: ["x-y"] }),
  ];

  it("defaults to the Issues tab with a total count and groups by component", () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    expect(w.text()).toContain("Issues");
    expect(w.text()).toContain("· 3");
    const text = w.text();
    expect(text).toContain("button");
    expect(text).toContain("badge");
    expect(text).toContain("General");
  });

  it("filters by severity (Hints hides warning-only components)", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    const hintBtn = w.findAll("button").find((b) => b.text().startsWith("Hints"));
    await hintBtn!.trigger("click");
    expect(w.text()).toContain("badge hint");
    expect(w.text()).not.toContain("button warn");
  });

  it("emits select-tokens when a row with tokenIds is clicked", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    const row = w.findAll("li").find((li) => li.text().includes("general warn"));
    await row!.trigger("click");
    expect(w.emitted("select-tokens")?.[0]).toEqual([["x-y"]]);
  });

  it("switches to the Readiness and Forecast tabs", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    const readiness = w.findAll("button").find((b) => b.text().startsWith("Readiness"));
    await readiness!.trigger("click");
    expect(w.text()).toContain("button");
    expect(w.text()).toContain("3/4");
    const forecast = w.findAll("button").find((b) => b.text().startsWith("Forecast"));
    await forecast!.trigger("click");
    expect(w.text()).toContain("Tailwind matches");
  });

  it("collapses and expands a component group", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    expect(w.text()).toContain("button warn");
    const header = w.findAll("button").find((b) => b.text().startsWith("▾ button"));
    await header!.trigger("click");
    expect(w.text()).not.toContain("button warn"); // collapsed
    const header2 = w.findAll("button").find((b) => b.text().startsWith("▸ button"));
    await header2!.trigger("click");
    expect(w.text()).toContain("button warn"); // expanded again
  });
});

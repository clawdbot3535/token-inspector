// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

const mk = (kind: string, message: string, severity: ScanIssue["severity"] = "warning"): ScanIssue => ({
  id: message,
  category: "classification-hint",
  severity,
  kind,
  message,
  tokenIds: [],
  componentName: "button",
});

function report(issues: ScanIssue[]): ScanReport {
  return {
    issues,
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

const ISSUES: ScanIssue[] = [
  mk("capability-gap", "MSGBYDESIGN"),
  mk("asymmetric-variant-coverage", "MSGFIGMA"),
  mk("custom-without-parts", "MSGMANUAL"),
  // A synthetic kind no owner claims — "Other" is now a forward-compat bucket
  // (every real scanner kind is routed since full owner-routing).
  mk("future-unknown-kind", "MSGOTHER", "hint"),
  mk("capability-gap", "MSGBYDESIGNHINT", "hint"),
];

function ownerChip(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.find("[data-testid=owner-filter]").findAll("button").find((b) => b.text().includes(label));
}

describe("ScanView owner filter", () => {
  it("renders an owner filter chip row with all seven chips", () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    const row = w.find("[data-testid=owner-filter]");
    expect(row.exists()).toBe(true);
    expect(row.findAll("button").length).toBe(7);
  });

  it("shows all issues by default", () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    const t = w.text();
    expect(t).toContain("MSGBYDESIGN");
    expect(t).toContain("MSGFIGMA");
    expect(t).toContain("MSGMANUAL");
    expect(t).toContain("MSGOTHER");
  });

  it("filters to a single owner when its chip is clicked", async () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    await ownerChip(w, "Figma-Fix")!.trigger("click");
    const t = w.text();
    expect(t).toContain("MSGFIGMA");
    expect(t).not.toContain("MSGBYDESIGN");
    expect(t).not.toContain("MSGMANUAL");
  });

  it("the Other chip shows only un-owned issues", async () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    await ownerChip(w, "Other")!.trigger("click");
    const t = w.text();
    expect(t).toContain("MSGOTHER");
    expect(t).not.toContain("MSGFIGMA");
  });

  it("combines the owner filter with the severity filter (AND)", async () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    await ownerChip(w, "by-design")!.trigger("click");
    expect(w.text()).toContain("MSGBYDESIGNHINT");
    const sevWarn = w.findAll("button").find((b) => b.text().includes("Warnings"));
    await sevWarn!.trigger("click");
    const t = w.text();
    expect(t).toContain("MSGBYDESIGN");
    expect(t).not.toContain("MSGBYDESIGNHINT");
  });
});

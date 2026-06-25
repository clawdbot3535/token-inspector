// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import { OWNER_BADGES } from "../owner-badges.js";
import type { Owner } from "../resolve/owner-of.js";
import type { ScanReport } from "@core/token-graph.js";

function reportWith(kind: string): ScanReport {
  return {
    issues: [{
      id: "i1",
      category: "classification-hint",
      severity: "warning",
      kind,
      message: "m",
      tokenIds: ["alert-success-border"],
      componentName: "alert",
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

// One representative kind per static-badge owner. ScanView binds the badge's
// `title` from the OWNER_BADGES registry; assert the wiring reaches the DOM
// (owner-badges.test.ts covers the registry strings themselves).
const CASES: ReadonlyArray<readonly [Owner, string]> = [
  ["by-design", "capability-gap"],
  ["figma-fix", "asymmetric-variant-coverage"],
  ["manual-dev", "custom-without-parts"],
];

describe("ScanView owner badge title", () => {
  for (const [owner, kind] of CASES) {
    it(`renders the registry title on the ${owner} badge`, () => {
      const wrapper = mount(ScanView, { props: { report: reportWith(kind) }, global: { stubs } });
      const badge = wrapper.find(`[data-testid=${owner}]`);
      expect(badge.exists(), kind).toBe(true);
      expect(badge.attributes("title")).toBe(OWNER_BADGES[owner]!.title);
    });
  }
});

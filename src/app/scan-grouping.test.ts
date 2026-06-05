import { describe, it, expect } from "vitest";
import { groupIssuesByComponent } from "./scan-grouping.js";
import type { ScanIssue } from "@core/token-graph.js";

function issue(opts: Partial<ScanIssue> & { id: string }): ScanIssue {
  return {
    id: opts.id,
    category: opts.category ?? "data-quality",
    severity: opts.severity ?? "warning",
    kind: opts.kind ?? "test",
    message: opts.message ?? "msg",
    tokenIds: opts.tokenIds ?? [],
    componentName: opts.componentName,
    variantKey: opts.variantKey,
  };
}

describe("groupIssuesByComponent", () => {
  it("groups by componentName, named alphabetically, General last", () => {
    const groups = groupIssuesByComponent([
      issue({ id: "1", componentName: "input" }),
      issue({ id: "2", componentName: "badge" }),
      issue({ id: "3" }),
      issue({ id: "4", componentName: "input" }),
    ]);
    expect(groups.map((g) => g.component)).toEqual(["badge", "input", "General"]);
    expect(groups.find((g) => g.component === "input")!.issues.map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("omits the General group when every issue has a component", () => {
    const groups = groupIssuesByComponent([issue({ id: "1", componentName: "button" })]);
    expect(groups.map((g) => g.component)).toEqual(["button"]);
  });

  it("preserves issue order within a group", () => {
    const groups = groupIssuesByComponent([
      issue({ id: "a", componentName: "x" }),
      issue({ id: "b", componentName: "x" }),
      issue({ id: "c", componentName: "x" }),
    ]);
    expect(groups[0]!.issues.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("returns [] for no issues", () => {
    expect(groupIssuesByComponent([])).toEqual([]);
  });
});

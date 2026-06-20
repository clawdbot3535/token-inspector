import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import { behaviorsFor, allBehaviorsFor, scannerNotesFor } from "./kit-behaviors.js";

describe("behaviorsFor", () => {
  it("returns the seeded notes for button outline + link", () => {
    expect(behaviorsFor("button", { variant: "outline" }).length).toBe(1);
    expect(behaviorsFor("button", { variant: "link" })[0]!.text.toLowerCase()).toContain("hover");
  });
  it("returns [] for an unknown component/variant/state", () => {
    expect(behaviorsFor("button", { variant: "solid" })).toEqual([]);
    expect(behaviorsFor("card", { state: "disabled" })).toEqual([]);
  });
});

describe("allBehaviorsFor", () => {
  it("flattens a component's catalog entries", () => {
    expect(allBehaviorsFor("button").length).toBe(2); // outline + link
    expect(allBehaviorsFor("card")).toEqual([]);
  });
});

function inputDisabledGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { input: { bg: { disabled: { $value: "#F4F4F5", $type: "color" } } } } },
  ];
  return buildGraph(sources);
}

describe("scannerNotesFor", () => {
  it("maps disabled-via-opacity to the disabled state + the catalog", () => {
    const r = scannerNotesFor("input", inputDisabledGraph());
    expect(r.all.length).toBeGreaterThanOrEqual(1);
    expect(r.all[0]!.kind).toBe("expected");
    expect(r.byState["disabled"]?.length).toBeGreaterThanOrEqual(1);
  });
  it("returns empty for a null graph", () => {
    expect(scannerNotesFor("input", null)).toEqual({ byState: {}, all: [] });
  });
});

function inputThreeDisabledGraph() {
  return buildGraph([
    {
      name: "global",
      data: {
        input: {
          border: { disabled: { $value: "#F4F4F5", $type: "color" } },
          bg: { disabled: { $value: "#F4F4F5", $type: "color" } },
          text: { disabled: { $value: "#A1A1AA", $type: "color" } },
        },
      },
    },
  ]);
}

describe("scannerNotesFor — dedup", () => {
  it("collapses multiple disabled-via-opacity issues into one token-agnostic note", () => {
    const r = scannerNotesFor("input", inputThreeDisabledGraph());
    expect(r.byState["disabled"]?.length).toBe(1); // not 3
    expect(r.all.length).toBe(1);
    expect(r.all[0]!.text).not.toMatch(/input-(border|bg|text)-disabled/); // token-agnostic
    expect(r.all[0]!.text.toLowerCase()).toContain("opacity");
  });
});

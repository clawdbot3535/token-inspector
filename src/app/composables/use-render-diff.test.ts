// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeRenderDiff, computeSlotDiffs } from "./use-render-diff.js";

describe("computeRenderDiff", () => {
  it("returns [] when the base classes carry no extractable arbitrary styles", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    expect(computeRenderDiff(el, "inline-flex items-center")).toEqual([]);
    el.remove();
  });

  it("returns one delta per extracted property (keys come from extractArbitrary)", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    // rounded-[8px] + bg-[#ffffff] extract to borderRadius + backgroundColor
    const deltas = computeRenderDiff(el, "rounded-[8px] bg-[#ffffff]");
    const props = deltas.map((d) => d.property).sort();
    expect(props).toContain("borderRadius");
    expect(props).toContain("backgroundColor");
    el.remove();
  });
});

describe("computeSlotDiffs", () => {
  it("returns a SlotDiff per spec; [] for a selector that matches nothing", () => {
    const host = document.createElement("div");
    const th = document.createElement("div");
    th.className = "ti-slot-th";
    host.appendChild(th);
    document.body.appendChild(host);

    const diffs = computeSlotDiffs(host, [
      { slot: "th", selector: ".ti-slot-th", classes: "rounded-[8px]" },
      { slot: "td", selector: ".ti-slot-td", classes: "p-[16px]" }, // not present
    ]);
    expect(diffs.map((d) => d.slot)).toEqual(["th", "td"]);
    expect(diffs.find((d) => d.slot === "th")!.deltas.length).toBeGreaterThan(0); // rounded → borderRadius
    expect(diffs.find((d) => d.slot === "td")!.deltas).toEqual([]); // selector miss
    host.remove();
  });
});

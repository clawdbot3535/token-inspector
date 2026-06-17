// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeRenderDiff } from "./use-render-diff.js";

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

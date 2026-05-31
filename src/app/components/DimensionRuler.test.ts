// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DimensionRuler from "./DimensionRuler.vue";

function bar(value: string) {
  return mount(DimensionRuler, { props: { value } }).find<HTMLDivElement>(
    ".bg-primary",
  );
}

describe("DimensionRuler", () => {
  it("scales rem to px so the bar is to scale (2rem → 32px, not 2px)", () => {
    expect(bar("2rem").element.style.width).toBe("32px");
  });

  it("draws px values directly", () => {
    expect(bar("10px").element.style.width).toBe("10px");
  });

  it("hides the bar for non-length units (%, vw, calc())", () => {
    expect(bar("50%").exists()).toBe(false);
    expect(bar("calc(100% - 4px)").exists()).toBe(false);
  });

  it("clamps oversized values and shows a truncation indicator", () => {
    const w = mount(DimensionRuler, { props: { value: "400px" } });
    expect(w.find<HTMLDivElement>(".bg-primary").element.style.width).toBe("320px");
    expect(w.text()).toContain("…");
  });

  it("draws an empty bar for negative lengths without a truncation indicator", () => {
    const w = mount(DimensionRuler, { props: { value: "-0.05em" } });
    expect(w.find<HTMLDivElement>(".bg-primary").element.style.width).toBe("0px");
    expect(w.text()).not.toContain("…");
  });
});

import { describe, it, expect } from "vitest";
import { isOpaqueColor } from "./color-opacity.js";

describe("isOpaqueColor", () => {
  it("treats fully-transparent values as not opaque", () => {
    expect(isOpaqueColor("rgba(0, 0, 0, 0)")).toBe(false);
    expect(isOpaqueColor("transparent")).toBe(false);
    expect(isOpaqueColor("#00000000")).toBe(false);
    expect(isOpaqueColor("")).toBe(false);
  });
  it("treats painted values as opaque", () => {
    expect(isOpaqueColor("#4F63D2")).toBe(true);
    expect(isOpaqueColor("#000000ff")).toBe(true);
    expect(isOpaqueColor("rgba(79, 99, 210, 1)")).toBe(true);
    expect(isOpaqueColor("rgb(0, 0, 0)")).toBe(true);
    expect(isOpaqueColor("var(--x)")).toBe(true);
  });
  it("handles fractional rgba alpha", () => {
    expect(isOpaqueColor("rgba(0, 0, 0, 0.5)")).toBe(true);
    expect(isOpaqueColor("rgba(0, 0, 0, 0.0)")).toBe(false);
  });
});

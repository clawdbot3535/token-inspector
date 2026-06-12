import { describe, it, expect } from "vitest";
import { normalizeTrailingColorRole } from "./custom-recipe-engine.js";

describe("normalizeTrailingColorRole", () => {
  it("moves a trailing color-role to the 2nd segment", () => {
    expect(normalizeTrailingColorRole("chip-bg-error")).toBe("chip-error-bg");
    expect(normalizeTrailingColorRole("chip-border-success")).toBe("chip-success-border");
  });
  it("moves a trailing color-role ahead of a sub-element + property", () => {
    expect(normalizeTrailingColorRole("chip-label-text-error")).toBe("chip-error-label-text");
  });
  it("leaves a trailing STATE word untouched", () => {
    expect(normalizeTrailingColorRole("chip-bg-hover")).toBe("chip-bg-hover");
    expect(normalizeTrailingColorRole("chip-label-text-active")).toBe("chip-label-text-active");
  });
  it("leaves a 2nd-segment color-role untouched", () => {
    expect(normalizeTrailingColorRole("button-error-bg")).toBe("button-error-bg");
  });
  it("leaves short ids untouched", () => {
    expect(normalizeTrailingColorRole("chip-bg")).toBe("chip-bg");
  });
});

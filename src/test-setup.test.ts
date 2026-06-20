// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isBenignCssParseError } from "./test-setup.js";

describe("isBenignCssParseError", () => {
  it("matches the jsdom Tailwind-v4 CSS parse error", () => {
    expect(isBenignCssParseError(new Error("Could not parse CSS stylesheet"))).toBe(true);
  });
  it("does not match other errors", () => {
    expect(isBenignCssParseError(new Error("ReferenceError: x is not defined"))).toBe(false);
    expect(isBenignCssParseError("a string")).toBe(false);
    expect(isBenignCssParseError(undefined)).toBe(false);
  });
});

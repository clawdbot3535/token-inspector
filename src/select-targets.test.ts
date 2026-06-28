// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseTargetSelection } from "./select-targets.js";

const AVAIL = ["nuxt", "shadcn", "generic"];

describe("parseTargetSelection", () => {
  it("returns null (= emit all) when --targets is absent", () => {
    expect(parseTargetSelection([], AVAIL)).toBeNull();
    expect(parseTargetSelection(["--something-else"], AVAIL)).toBeNull();
  });

  it("parses a comma-separated list of target ids", () => {
    expect([...parseTargetSelection(["--targets=shadcn,generic"], AVAIL)!]).toEqual(["shadcn", "generic"]);
  });

  it("trims whitespace and ignores empty entries", () => {
    expect([...parseTargetSelection(["--targets= shadcn , , generic "], AVAIL)!]).toEqual(["shadcn", "generic"]);
  });

  it("throws a clear error naming the unknown target(s) + the available ones", () => {
    expect(() => parseTargetSelection(["--targets=foo"], AVAIL)).toThrow(
      /Unknown target.*foo.*Available.*nuxt, shadcn, generic/,
    );
  });
});

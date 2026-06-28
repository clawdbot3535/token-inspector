// @vitest-environment node
import { describe, it, expect } from "vitest";
import { wantsHelp, buildHelpText } from "./cli-help.js";

describe("wantsHelp", () => {
  it("detects --help and -h, ignores other args", () => {
    expect(wantsHelp(["--help"])).toBe(true);
    expect(wantsHelp(["-h"])).toBe(true);
    expect(wantsHelp(["--targets=shadcn"])).toBe(false);
    expect(wantsHelp([])).toBe(false);
  });
});

describe("buildHelpText", () => {
  const text = buildHelpText(["nuxt", "shadcn", "generic"]);

  it("documents the usage, flags, and available targets", () => {
    expect(text).toContain("Usage:");
    expect(text).toContain("--targets");
    expect(text).toContain("--out");
    expect(text).toContain("--help");
    expect(text).toContain("nuxt, shadcn, generic");
  });
});

// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseOutDir } from "./parse-out-dir.js";

describe("parseOutDir", () => {
  it("returns null (= default output dir) when --out is absent", () => {
    expect(parseOutDir([])).toBeNull();
    expect(parseOutDir(["--targets=shadcn"])).toBeNull();
  });

  it("returns the path when --out is given (relative or absolute)", () => {
    expect(parseOutDir(["--out=./design"])).toBe("./design");
    expect(parseOutDir(["--out=/abs/path"])).toBe("/abs/path");
  });

  it("throws a clear error when --out= is empty", () => {
    expect(() => parseOutDir(["--out="])).toThrow(/--out.*requires a directory/);
  });
});

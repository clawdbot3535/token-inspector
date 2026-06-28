// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseSourceFile } from "./load-sources.js";

describe("parseSourceFile", () => {
  it("parses valid token content into a SourceFile", () => {
    const out = parseSourceFile("color", "color.tokens.json", JSON.stringify({ blue: { $value: "#00f" } }));
    expect(out).toEqual({ name: "color", data: { blue: { $value: "#00f" } } });
  });

  it("throws a clear error naming the file when it is missing (null content)", () => {
    expect(() => parseSourceFile("color", "color.tokens.json", null)).toThrow(/color\.tokens\.json.*not found/);
  });

  it("throws a clear error for invalid JSON, naming the file", () => {
    expect(() => parseSourceFile("color", "color.tokens.json", "{ not json")).toThrow(
      /color\.tokens\.json.*not valid JSON/,
    );
  });

  it("throws when the payload is not a JSON object (array/primitive)", () => {
    expect(() => parseSourceFile("color", "color.tokens.json", "[1, 2, 3]")).toThrow(/must be a JSON object/);
  });
});

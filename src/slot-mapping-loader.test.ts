import { describe, it, expect } from "vitest";
import { parseSlotMappingFile } from "./slot-mapping-loader.js";

describe("parseSlotMappingFile", () => {
  it("returns empty when given an empty/null/undefined input", () => {
    expect(parseSlotMappingFile("")).toEqual({
      overrides: undefined,
      defaultSizeByComponent: undefined,
    });
    expect(parseSlotMappingFile(null)).toEqual({
      overrides: undefined,
      defaultSizeByComponent: undefined,
    });
    expect(parseSlotMappingFile(undefined)).toEqual({
      overrides: undefined,
      defaultSizeByComponent: undefined,
    });
  });

  it("parses components.<name>.defaultSize into defaultSizeByComponent", () => {
    const result = parseSlotMappingFile(
      JSON.stringify({
        components: { button: { defaultSize: "lg" } },
      }),
    );
    expect(result.defaultSizeByComponent).toEqual({ button: "lg" });
    expect(result.overrides).toBeUndefined();
  });

  it("parses overrides and passes them through as-is", () => {
    const result = parseSlotMappingFile(
      JSON.stringify({
        overrides: { "button-shadow": null },
      }),
    );
    expect(result.overrides).toEqual({ "button-shadow": null });
    expect(result.defaultSizeByComponent).toBeUndefined();
  });

  it("parses both components and overrides together", () => {
    const result = parseSlotMappingFile(
      JSON.stringify({
        components: { button: { defaultSize: "md" } },
        overrides: {
          "button-custom": {
            slot: "base",
            utilityType: "rounded",
            variantAxis: null,
            variantKey: null,
          },
        },
      }),
    );
    expect(result.defaultSizeByComponent).toEqual({ button: "md" });
    expect(result.overrides).toBeDefined();
    expect(result.overrides?.["button-custom"]).toMatchObject({
      slot: "base",
      utilityType: "rounded",
    });
  });

  it("returns undefined defaultSizeByComponent when components map is empty", () => {
    const result = parseSlotMappingFile(JSON.stringify({ overrides: {} }));
    expect(result.defaultSizeByComponent).toBeUndefined();
  });

  // Regression: a malformed slot-mapping.json previously threw a raw
  // SyntaxError deep in the CLI. It should fail with a clear, actionable
  // message naming the file.
  it("throws a clear error on malformed JSON instead of a raw SyntaxError", () => {
    expect(() => parseSlotMappingFile("{ not: valid json,, }")).toThrow(
      /Invalid slot-mapping\.json/,
    );
  });
});

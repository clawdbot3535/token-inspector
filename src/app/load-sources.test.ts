import { describe, it, expect } from "vitest";
import { loadSources } from "./load-sources.js";

function jsonFile(name: string, value: unknown): File {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}

describe("loadSources", () => {
  it("accepts a valid token object for a recognized layer", async () => {
    const { sources, warnings } = await loadSources([
      jsonFile("color.tokens.json", {
        color: { blue: { $value: "#00f", $type: "color" } },
      }),
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.name).toBe("color");
    expect(warnings).toHaveLength(0);
  });

  // Regression: array-root JSON passed `typeof === "object"` and walked into
  // numeric-keyed garbage nodes ("0-color-blue"). It must be rejected.
  it("rejects array-root JSON instead of producing garbage nodes", async () => {
    const { sources, warnings } = await loadSources([
      jsonFile("color.tokens.json", [{ $value: "#00f" }]),
    ]);
    expect(sources).toHaveLength(0);
    expect(warnings.join(" ")).toContain("color.tokens.json");
  });

  it("skips an unrecognized filename with a warning", async () => {
    const { sources, warnings } = await loadSources([
      jsonFile("random.json", { a: 1 }),
    ]);
    expect(sources).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/Unknown file/);
  });

  it("uses the first file when a layer is dropped twice", async () => {
    const { sources, warnings } = await loadSources([
      jsonFile("color.tokens.json", { a: { $value: "#1", $type: "color" } }),
      jsonFile("color.tokens.json", { b: { $value: "#2", $type: "color" } }),
    ]);
    expect(sources).toHaveLength(1);
    expect(warnings.join(" ")).toMatch(/Duplicate color/);
  });

  it("accepts a well-formed figma-mapping.json", async () => {
    const { figmaMapping } = await loadSources([
      jsonFile("figma-mapping.json", {
        components: [{ prefix: "button", figmaName: "Button" }],
      }),
    ]);
    expect(figmaMapping).not.toBeNull();
    expect(figmaMapping?.components).toHaveLength(1);
  });

  // Regression: a non-object element let matchMapping read `c.prefix` and
  // throw a TypeError. The whole mapping must be rejected instead.
  it("skips a figma-mapping.json whose components hold a non-object element", async () => {
    const { figmaMapping, warnings } = await loadSources([
      jsonFile("figma-mapping.json", { components: ["not-an-object"] }),
    ]);
    expect(figmaMapping).toBeNull();
    expect(warnings.join(" ")).toMatch(/figma-mapping/i);
  });
});

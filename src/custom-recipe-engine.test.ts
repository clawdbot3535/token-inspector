import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { describe, it, expect } from "vitest";
import { normalizeTrailingColorRole, buildCustomRecipes } from "./custom-recipe-engine.js";
import { buildGraph } from "./build-graph.js";
import type { SourceFile, SourceLayer } from "./token-graph.js";

function realGraph() {
  const dir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../components",
  );
  const files: ReadonlyArray<{ name: SourceLayer; file: string }> = [
    { name: "color", file: "color.tokens.json" },
    { name: "dimension", file: "dimension.tokens.json" },
    { name: "typography", file: "typography.tokens.json" },
    { name: "light", file: "light.tokens.json" },
    { name: "dark", file: "dark.tokens.json" },
    { name: "global", file: "global.tokens.json" },
  ];
  const sources: SourceFile[] = files.map((s) => ({
    name: s.name,
    data: JSON.parse(readFileSync(resolve(dir, s.file), "utf8")) as Record<
      string,
      unknown
    >,
  }));
  return buildGraph(sources);
}

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

describe("buildCustomRecipes", () => {
  it("returns {} when no components are flagged", () => {
    expect(buildCustomRecipes(realGraph(), new Map())).toEqual({});
  });

  it("builds a full-fidelity chip recipe with sub-element slots + color variants", () => {
    const recipes = buildCustomRecipes(
      realGraph(),
      new Map([["chip", ["label", "close"]]]),
    );
    const chip = recipes["chip"];
    expect(chip).toBeDefined();
    expect(chip!.slots.base).toBeTypeOf("string");
    expect(chip!.slots.label).toBeTypeOf("string");
    expect(chip!.slots.label).toMatch(/text-\[/);
    // icon-size resolves via the spacing scale (size-3), NOT arbitrary size-[..] (JIT-class guard)
    expect(chip!.slots.close).toMatch(/\bsize-\d/);
    expect(chip!.slots.close).not.toMatch(/size-\[/);
    expect(chip!.variants.color?.error?.base).toBeTypeOf("string");
    expect(chip!.variants.color?.error?.label).toMatch(/text-\[/);
    expect(chip!.variants.color?.success?.base).toBeTypeOf("string");
  });

  it("only builds the flagged components", () => {
    const recipes = buildCustomRecipes(
      realGraph(),
      new Map([["chip", ["label", "close"]]]),
    );
    expect(Object.keys(recipes)).toEqual(["chip"]);
  });
});

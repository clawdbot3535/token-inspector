// @vitest-environment node
import { describe, it, expect } from "vitest";
import { TARGETS } from "./targets.js";
import { buildGraph } from "./build-graph.js";
import { scanGraph } from "./scanner.js";
import { COMPONENT_ALLOW_LIST } from "./renderers/app-config.js";
import type { TargetContext } from "./targets.js";

function ctx(): TargetContext {
  const graph = buildGraph([
    { name: "global", data: { button: { "padding-x": { $value: 8, $type: "dimension" } } } },
  ]);
  const scanReport = scanGraph(graph, { components: [...COMPONENT_ALLOW_LIST] });
  return { graph, scanReport };
}

const targetById = (id: string) => TARGETS.find((t) => t.id === id)!;

describe("targets registry", () => {
  it("registers the nuxt + shadcn + generic targets in order", () => {
    expect(TARGETS.map((t) => t.id)).toEqual(["nuxt", "shadcn", "generic"]);
  });

  it("the generic target emits the framework-agnostic tokens/ files", () => {
    expect(targetById("generic").emit(ctx()).map((f) => f.path)).toEqual([
      "tokens/variables.css",
      "tokens/tokens.json",
      "tokens/tokens.ts",
    ]);
  });

  it("the nuxt target emits the nested css/ + nuxt/ + kit/ paths", () => {
    const paths = targetById("nuxt").emit(ctx()).map((f) => f.path);
    expect(paths).toContain("css/tokens.css");
    expect(paths).toContain("nuxt/app.config.ts");
    expect(paths.some((p) => p.startsWith("kit/"))).toBe(true);
    // unified to the nested convention — never the bare root names.
    expect(paths).not.toContain("app.config.ts");
    expect(paths).not.toContain("tokens.css");
  });

  it("the shadcn target emits exactly shadcn/globals.css", () => {
    expect(targetById("shadcn").emit(ctx()).map((f) => f.path)).toEqual(["shadcn/globals.css"]);
  });
});

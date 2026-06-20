// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import { toLiveBuildFiles } from "./to-live-build-files.js";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "dimension" } } } },
  ];
  return buildGraph(sources);
}

describe("toLiveBuildFiles", () => {
  it("strips the kit/ prefix so the project root holds package.json", () => {
    const files = toLiveBuildFiles(buttonGraph());
    expect(files["package.json"]).toBeDefined();
    expect(files["src/App.vue"]).toBeDefined();
    expect(Object.keys(files).some((p) => p.startsWith("kit/"))).toBe(false);
  });
  it("augments package.json with the stackblitz run config, preserving canonical fields", () => {
    const pkg = JSON.parse(toLiveBuildFiles(buttonGraph())["package.json"]!);
    expect(pkg.stackblitz).toEqual({ installDependencies: true, startCommand: "npm run dev" });
    expect(pkg.dependencies["@nuxt/ui"]).toBeDefined();
    expect(pkg.scripts.dev).toBe("vite");
  });
  it("keeps theme.ts, tokens.css and vite.config.ts intact at the root", () => {
    const files = toLiveBuildFiles(buttonGraph());
    expect(files["theme.ts"]).toContain("export const theme");
    expect(files["tokens.css"]).toBeDefined();
    expect(files["vite.config.ts"]).toContain("ui({ ui: theme })");
  });
});

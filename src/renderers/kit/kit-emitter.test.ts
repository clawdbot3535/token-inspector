import { describe, it, expect } from "vitest";
import { buildGraph } from "../../build-graph.js";
import type { SourceFile } from "../../token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { buildKitFiles } from "./kit-emitter.js";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "dimension" } } } },
  ];
  return buildGraph(sources);
}

// button-mystery-radius is unmapped until a resolve override routes it into the
// button recipe (button is an allow-list component the kit renders).
function mysteryGraph() {
  return buildGraph([
    { name: "global", data: { button: { mystery: { radius: { $value: 8, $type: "dimension" } } } } },
  ] as SourceFile[]);
}
// A non-suffix token (button-padding-x) with a size sibling (button-padding-x-lg)
// redirects to the default size — "md" by default, or the configured size.
function sizeGraph() {
  return buildGraph([
    { name: "global", data: { button: { "padding-x": { $value: 8, $type: "dimension" }, "padding-x-lg": { $value: 16, $type: "dimension" } } } },
  ] as SourceFile[]);
}
const contentByPath = (
  graph: ReturnType<typeof buildGraph>,
  override?: SlotMappingOverride,
  defaultSizeByComponent?: Readonly<Record<string, string>>,
) =>
  new Map(buildKitFiles(graph, override, defaultSizeByComponent).map((f) => [f.path, f.content] as const));

describe("buildKitFiles", () => {
  it("emits a self-contained runnable kit under kit/", () => {
    const files = buildKitFiles(buttonGraph());
    const byPath = new Map(files.map((f) => [f.path, f.content] as const));
    for (const p of ["kit/package.json", "kit/vite.config.ts", "kit/index.html", "kit/tokens.css", "kit/theme.ts", "kit/src/main.ts", "kit/src/main.css", "kit/src/App.vue", "kit/README.md"]) {
      expect(byPath.has(p), `missing ${p}`).toBe(true);
    }
  });
  it("vite.config wires the theme via the @nuxt/ui plugin ui option", () => {
    const vc = new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content] as const)).get("kit/vite.config.ts")!;
    expect(vc).toContain('from "@nuxt/ui/vite"');
    expect(vc).toContain("ui({ ui: theme })");
    expect(vc).toContain("tailwindcss()");
  });
  it("package.json pins the runtime + build deps incl. vue-router 4.6.4", () => {
    const pkg = JSON.parse(new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content] as const)).get("kit/package.json")!);
    expect(pkg.dependencies["@nuxt/ui"]).toBeDefined();
    expect(pkg.dependencies["vue-router"]).toBe("4.6.4");
    expect(pkg.scripts.dev).toBe("vite");
  });
  it("main.css imports tailwind, the tokens, and nuxt ui in order", () => {
    const css = new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content] as const)).get("kit/src/main.css")!;
    expect(css.indexOf('@import "tailwindcss"')).toBeLessThan(css.indexOf('@import "../tokens.css"'));
    expect(css.indexOf('@import "../tokens.css"')).toBeLessThan(css.indexOf('@import "@nuxt/ui"'));
  });
  it("theme.ts exports a serialised theme object", () => {
    const t = new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content] as const)).get("kit/theme.ts")!;
    expect(t).toContain("export const theme");
    expect(t).toContain('"colors"');
  });
  it("threads a resolve override into the kit theme AND gallery", () => {
    const override: SlotMappingOverride = {
      "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const withOverride = contentByPath(mysteryGraph(), override);
    const without = contentByPath(mysteryGraph());
    // theme.ts is built by buildKitTheme, src/App.vue by buildKitGallery — both
    // build component recipes, so both must reflect the override.
    expect(withOverride.get("kit/theme.ts")).not.toBe(without.get("kit/theme.ts"));
    expect(withOverride.get("kit/src/App.vue")).not.toBe(without.get("kit/src/App.vue"));
    expect(withOverride.get("kit/theme.ts")).toContain("rounded");
  });
  it("threads defaultSizeByComponent into the kit theme", () => {
    const withSize = contentByPath(sizeGraph(), undefined, { button: "sm" });
    const without = contentByPath(sizeGraph());
    // the non-suffix token redirects to "sm" instead of "md" → theme differs
    expect(withSize.get("kit/theme.ts")).not.toBe(without.get("kit/theme.ts"));
  });
});

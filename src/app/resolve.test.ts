import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import { aliasChain, resolveCss, usedBy } from "./resolve.js";

const sources: SourceFile[] = [
  {
    name: "color",
    data: {
      color: {
        zinc: {
          "100": {
            $type: "color",
            $value: { components: [0.96, 0.96, 0.97], hex: "#F4F4F5" },
          },
          "900": {
            $type: "color",
            $value: { components: [0.07, 0.07, 0.09], hex: "#18181B" },
          },
        },
      },
    },
  },
  {
    name: "light",
    data: {
      surface: {
        primary: {
          $type: "color",
          $value: { components: [0.96, 0.96, 0.97], hex: "#F4F4F5" },
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/zinc/100" },
          },
        },
      },
    },
  },
  {
    name: "dark",
    data: {
      surface: {
        primary: {
          $type: "color",
          $value: { components: [0.07, 0.07, 0.09], hex: "#18181B" },
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/zinc/900" },
          },
        },
      },
    },
  },
  {
    name: "global",
    data: {
      card: {
        background: {
          $type: "color",
          $value: { components: [0.96, 0.96, 0.97], hex: "#F4F4F5" },
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "surface/primary" },
          },
        },
      },
    },
  },
];

describe("resolveCss", () => {
  const g = buildGraph(sources);

  it("returns the terminal CSS value through a multi-hop chain", () => {
    expect(resolveCss(g, "card-background", "light")).toBe("#F4F4F5");
    expect(resolveCss(g, "card-background", "dark")).toBe("#18181B");
  });

  it("returns the literal value for a primitive (no chain)", () => {
    expect(resolveCss(g, "color-zinc-100", "base")).toBe("#F4F4F5");
  });

  it("falls back to base when a theme variant is missing", () => {
    expect(resolveCss(g, "color-zinc-100", "light")).toBe("#F4F4F5");
  });

  it("returns undefined for an unknown id", () => {
    expect(resolveCss(g, "does-not-exist", "base")).toBeUndefined();
  });
});

describe("aliasChain", () => {
  const g = buildGraph(sources);

  it("returns one node for a primitive (no aliases)", () => {
    const chain = aliasChain(g, "color-zinc-100", "base");
    expect(chain.map((n) => n.id)).toEqual(["color-zinc-100"]);
  });

  it("returns the full path through a multi-hop chain", () => {
    const chain = aliasChain(g, "card-background", "light");
    expect(chain.map((n) => n.id)).toEqual([
      "card-background",
      "surface-primary",
      "color-zinc-100",
    ]);
  });

  it("differs between light and dark for theme-aware semantics", () => {
    const light = aliasChain(g, "card-background", "light");
    const dark = aliasChain(g, "card-background", "dark");
    expect(light.at(-1)?.id).toBe("color-zinc-100");
    expect(dark.at(-1)?.id).toBe("color-zinc-900");
  });
});

describe("usedBy", () => {
  const g = buildGraph(sources);

  it("returns nodes that alias to a given target", () => {
    expect(usedBy(g, "color-zinc-100").map((n) => n.id)).toContain("surface-primary");
    expect(usedBy(g, "surface-primary").map((n) => n.id)).toContain("card-background");
  });

  it("returns empty array for nodes nobody references", () => {
    expect(usedBy(g, "card-background")).toEqual([]);
  });
});

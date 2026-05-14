import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import { resolveComponentTokens, tokensForGroup } from "./component-preview.js";

function makeGraph(): ReturnType<typeof buildGraph> {
  const primitives: SourceFile = {
    name: "color",
    data: {
      color: {
        white: { $type: "color", $value: "#FFFFFF" },
        black: { $type: "color", $value: "#000000" },
        accent: {
          500: { $type: "color", $value: "#3B82F6" },
        },
      },
    },
  };
  const semantic: SourceFile = {
    name: "light",
    data: {
      "color-bg-primary": { $type: "color", $value: "{color.accent.500}" },
      "color-text-primary": { $type: "color", $value: "{color.black}" },
    },
  };
  const semanticDark: SourceFile = {
    name: "dark",
    data: {
      "color-bg-primary": { $type: "color", $value: "{color.accent.500}" },
      "color-text-primary": { $type: "color", $value: "{color.white}" },
    },
  };
  const components: SourceFile = {
    name: "global",
    data: {
      button: {
        solid: {
          bg: { $type: "color", $value: "{color-bg-primary}" },
          text: { $type: "color", $value: "{color-text-primary}" },
        },
        "padding-x": { $type: "dimension", $value: "12px" },
      },
      input: {
        bg: { $type: "color", $value: "{color.white}" },
      },
    },
  };
  return buildGraph([primitives, semantic, semanticDark, components]);
}

describe("resolveComponentTokens", () => {
  it("returns every component token whose id starts with the prefix", () => {
    const graph = makeGraph();
    const tokens = resolveComponentTokens(graph, "button", "light");
    expect(Object.keys(tokens).sort()).toEqual(
      ["--button-padding-x", "--button-solid-bg", "--button-solid-text"].sort(),
    );
  });

  it("resolves to terminal CSS values, not aliases", () => {
    const graph = makeGraph();
    const tokens = resolveComponentTokens(graph, "button", "light");
    expect(tokens["--button-padding-x"]).toBe("12px");
    expect(tokens["--button-solid-bg"]).toBe("#3B82F6");
    expect(tokens["--button-solid-text"]).toBe("#000000");
  });

  it("respects theme variant for tokens that branch on theme", () => {
    const graph = makeGraph();
    const light = resolveComponentTokens(graph, "button", "light");
    const dark = resolveComponentTokens(graph, "button", "dark");
    expect(light["--button-solid-text"]).toBe("#000000");
    expect(dark["--button-solid-text"]).toBe("#FFFFFF");
  });

  it("does not bleed into unrelated component prefixes", () => {
    const graph = makeGraph();
    const tokens = resolveComponentTokens(graph, "button", "light");
    for (const key of Object.keys(tokens)) {
      expect(key.startsWith("--button-")).toBe(true);
    }
  });

  it("returns an empty record for an unknown prefix", () => {
    const graph = makeGraph();
    expect(resolveComponentTokens(graph, "nope", "light")).toEqual({});
  });
});

describe("tokensForGroup", () => {
  it("returns only the ids that are present in the available set", () => {
    const available = new Set(["button-solid-bg", "button-padding-x"]);
    const group = ["button-solid-bg", "button-solid-bg-hover", "button-padding-x"];
    const result = tokensForGroup(available, group);
    expect([...result].sort()).toEqual(["button-padding-x", "button-solid-bg"]);
  });

  it("returns an empty set when no ids match", () => {
    const result = tokensForGroup(new Set(), ["button-solid-bg"]);
    expect(result.size).toBe(0);
  });
});

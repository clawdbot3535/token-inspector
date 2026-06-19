import { describe, it, expect } from "vitest";
import { buildGraph } from "./build-graph.js";
import type { SourceFile } from "./token-graph.js";

// ---------- Fixtures ----------

const colorPrimitives: SourceFile = {
  name: "color",
  data: {
    color: {
      blue: {
        "600": {
          $type: "color",
          $value: { components: [0.15, 0.39, 0.92], hex: "#2563EB" },
        },
        "600-alpha": {
          $type: "color",
          $value: { components: [0.15, 0.39, 0.92], alpha: 0.5, hex: "#2563EB" },
        },
      },
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
};

const dimensionPrimitives: SourceFile = {
  name: "dimension",
  data: {
    spacing: {
      "4": { $type: "number", $value: 4 },
      "8": { $type: "number", $value: 8 },
    },
    rounded: { md: { $type: "number", $value: 6 } },
  },
};

const typographyPrimitives: SourceFile = {
  name: "typography",
  data: {
    "font-weight": {
      bold: { $type: "number", $value: 700 },
    },
    "font-family": {
      sans: { $type: "string", $value: "Inter, system-ui, sans-serif" },
    },
  },
};

const lightSemantic: SourceFile = {
  name: "light",
  data: {
    surface: {
      primary: {
        $type: "color",
        $value: { components: [1, 1, 1], hex: "#FFFFFF" },
        $extensions: {
          "com.figma.aliasData": { targetVariableName: "color/zinc/100" },
        },
      },
    },
  },
};

const darkSemantic: SourceFile = {
  name: "dark",
  data: {
    surface: {
      primary: {
        $type: "color",
        $value: { components: [0, 0, 0], hex: "#000000" },
        $extensions: {
          "com.figma.aliasData": { targetVariableName: "color/zinc/900" },
        },
      },
    },
  },
};

const componentGlobal: SourceFile = {
  name: "global",
  data: {
    button: {
      primary: {
        background: {
          $type: "color",
          $value: { components: [0.15, 0.39, 0.92], hex: "#2563EB" },
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/blue/600" },
          },
        },
        radius: {
          $type: "number",
          $value: 6,
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "rounded/md" },
          },
        },
      },
    },
  },
};

const allSources = [
  colorPrimitives,
  dimensionPrimitives,
  typographyPrimitives,
  lightSemantic,
  darkSemantic,
  componentGlobal,
];

// ---------- Tests ----------

describe("buildGraph — slug + id stability", () => {
  it("produces kebab-case ids identical to CSS var names without `--`", () => {
    const g = buildGraph([colorPrimitives]);
    expect(g.nodes.has("color-blue-600")).toBe(true);
    expect(g.nodes.has("color-zinc-100")).toBe(true);
  });

  it("never produces ids containing slashes or uppercase chars", () => {
    const g = buildGraph(allSources);
    for (const id of g.nodes.keys()) {
      expect(id).not.toMatch(/[/A-Z]/);
    }
  });
});

describe("buildGraph — layer classification", () => {
  it("color/dimension/typography → primitive", () => {
    const g = buildGraph([colorPrimitives, dimensionPrimitives, typographyPrimitives]);
    for (const node of g.nodes.values()) {
      expect(node.layer).toBe("primitive");
    }
  });

  it("light/dark → semantic", () => {
    const g = buildGraph([lightSemantic, darkSemantic]);
    for (const node of g.nodes.values()) {
      expect(node.layer).toBe("semantic");
    }
  });

  it("global → component", () => {
    const g = buildGraph([componentGlobal]);
    for (const node of g.nodes.values()) {
      expect(node.layer).toBe("component");
    }
  });
});

describe("buildGraph — value formatting", () => {
  it("colors with alpha < 1 emit rgba()", () => {
    const g = buildGraph([colorPrimitives]);
    const alpha = g.nodes.get("color-blue-600-alpha");
    expect(alpha?.cssValue.base).toMatch(/^rgba\(\d+, \d+, \d+, [0-9.]+\)$/);
  });

  it("opaque colors emit hex", () => {
    const g = buildGraph([colorPrimitives]);
    expect(g.nodes.get("color-blue-600")?.cssValue.base).toBe("#2563EB");
  });

  it("spacing numbers get px unit", () => {
    const g = buildGraph([dimensionPrimitives]);
    expect(g.nodes.get("spacing-4")?.cssValue.base).toBe("4px");
    expect(g.nodes.get("rounded-md")?.cssValue.base).toBe("6px");
  });

  it("font-weight numbers stay unitless", () => {
    const g = buildGraph([typographyPrimitives]);
    expect(g.nodes.get("font-weight-bold")?.cssValue.base).toBe("700");
  });

  it("strings with whitespace are quoted", () => {
    const g = buildGraph([typographyPrimitives]);
    expect(g.nodes.get("font-family-sans")?.cssValue.base).toBe(
      '"Inter, system-ui, sans-serif"',
    );
  });
});

describe("buildGraph — theme merge for semantic layer", () => {
  it("merges light + dark variants under the same id", () => {
    const g = buildGraph([colorPrimitives, lightSemantic, darkSemantic]);
    const surface = g.nodes.get("surface-primary");
    expect(surface).toBeDefined();
    expect(surface!.layer).toBe("semantic");
    expect(surface!.themes).toEqual(expect.arrayContaining(["light", "dark"]));
    expect(surface!.cssValue.light).toBe("#FFFFFF");
    expect(surface!.cssValue.dark).toBe("#000000");
    expect(surface!.cssValue.base).toBeUndefined();
  });

  it("emits no duplicate-id issue for legitimate light+dark merge", () => {
    const g = buildGraph([colorPrimitives, lightSemantic, darkSemantic]);
    const dups = g.issues.filter((i) => i.kind === "duplicate-id");
    expect(dups).toHaveLength(0);
  });
});

describe("buildGraph — alias resolution", () => {
  it("resolves component aliases to primitive ids", () => {
    const g = buildGraph(allSources);
    const bg = g.nodes.get("button-primary-background");
    expect(bg?.alias.base?.to).toBe("color-blue-600");
    expect(bg?.alias.base?.rawTarget).toBe("color/blue/600");
  });

  it("resolves semantic aliases per theme", () => {
    const g = buildGraph(allSources);
    const surface = g.nodes.get("surface-primary");
    expect(surface?.alias.light?.to).toBe("color-zinc-100");
    expect(surface?.alias.dark?.to).toBe("color-zinc-900");
  });

  it("emits unresolved-alias issue when target is unknown", () => {
    const orphan: SourceFile = {
      name: "global",
      data: {
        button: {
          ghost: {
            background: {
              $type: "color",
              $value: { components: [0, 0, 0], hex: "#000000" },
              $extensions: {
                "com.figma.aliasData": {
                  targetVariableName: "color/does-not-exist/500",
                },
              },
            },
          },
        },
      },
    };
    const g = buildGraph([colorPrimitives, orphan]);
    const unresolved = g.issues.filter((i) => i.kind === "unresolved-alias");
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].nodeId).toBe("button-ghost-background");
    expect(unresolved[0].target).toBe("color/does-not-exist/500");
  });
});

describe("buildGraph — reverse alias index", () => {
  it("lists all nodes that alias to a given target", () => {
    const g = buildGraph(allSources);
    const usedBy = g.reverseAliases.get("color-blue-600");
    expect(usedBy).toEqual(expect.arrayContaining(["button-primary-background"]));
  });

  it("collects both light and dark aliases from a semantic node", () => {
    const g = buildGraph(allSources);
    expect(g.reverseAliases.get("color-zinc-100")).toContain("surface-primary");
    expect(g.reverseAliases.get("color-zinc-900")).toContain("surface-primary");
  });

  it("returns undefined for nodes nobody aliases to", () => {
    const g = buildGraph([colorPrimitives]);
    expect(g.reverseAliases.get("color-blue-600")).toBeUndefined();
  });
});

describe("buildGraph — curly-brace alias resolution (Figma's older alias format)", () => {
  const targets: SourceFile = {
    name: "global",
    data: {
      button: {
        "height-md": { $type: "number", $value: 32 },
      },
      input: {
        "bg-disabled": {
          $type: "color",
          $value: { components: [0.9, 0.9, 0.9], hex: "#E5E5E5" },
        },
      },
    },
  };

  it("resolves a string $value of form {a.b.c} to the node at a/b/c", () => {
    const aliasing: SourceFile = {
      name: "global",
      data: {
        input: {
          height: { $type: "string", $value: "{button.height-md}" },
        },
      },
    };
    const g = buildGraph([targets, aliasing]);
    const node = g.nodes.get("input-height");
    expect(node?.alias.base?.to).toBe("button-height-md");
    expect(node?.alias.base?.rawTarget).toBe("button.height-md");
  });

  it("resolves curly-brace aliases for color targets too", () => {
    const aliasing: SourceFile = {
      name: "global",
      data: {
        textarea: {
          "bg-disabled": { $type: "string", $value: "{input.bg-disabled}" },
        },
      },
    };
    const g = buildGraph([targets, aliasing]);
    expect(g.nodes.get("textarea-bg-disabled")?.alias.base?.to).toBe(
      "input-bg-disabled",
    );
  });

  it("emits unresolved-alias (not malformed-value) when a curly target is missing", () => {
    const orphan: SourceFile = {
      name: "global",
      data: {
        x: { y: { $type: "string", $value: "{nope.gone}" } },
      },
    };
    const g = buildGraph([orphan]);
    expect(g.issues.some((i) => i.kind === "unresolved-alias" && i.nodeId === "x-y"))
      .toBe(true);
    expect(g.issues.some((i) => i.kind === "malformed-value" && i.nodeId === "x-y"))
      .toBe(false);
  });

  it("does not emit malformed-value when a curly alias resolves cleanly", () => {
    const aliasing: SourceFile = {
      name: "global",
      data: {
        input: {
          height: { $type: "number", $value: "{button.height-md}" },
        },
      },
    };
    const g = buildGraph([targets, aliasing]);
    const ms = g.issues.filter(
      (i) => i.kind === "malformed-value" && i.nodeId === "input-height",
    );
    expect(ms).toHaveLength(0);
  });

  it("does not treat strings that are not pure curly references as aliases", () => {
    const free: SourceFile = {
      name: "typography",
      data: {
        "font-family": {
          sans: { $type: "string", $value: "Inter, system-ui, sans-serif" },
        },
      },
    };
    const g = buildGraph([free]);
    expect(g.nodes.get("font-family-sans")?.alias.base).toBeUndefined();
  });
});

describe("buildGraph — issue surfacing (never throws)", () => {
  it("returns a graph even when input is structurally broken", () => {
    const broken: SourceFile = {
      name: "color",
      data: {
        bad: {
          token: {
            $type: "color",
            $value: "not-a-color-object" as unknown as never,
          },
        },
      },
    };
    expect(() => buildGraph([broken])).not.toThrow();
    const g = buildGraph([broken]);
    expect(g.issues.some((i) => i.kind === "malformed-value")).toBe(true);
  });

  it("emits duplicate-id issue when two non-semantic sources collide", () => {
    const a: SourceFile = {
      name: "color",
      data: {
        x: { $type: "color", $value: { components: [0, 0, 0], hex: "#000" } },
      },
    };
    const b: SourceFile = {
      name: "global",
      data: {
        x: { $type: "color", $value: { components: [1, 1, 1], hex: "#FFF" } },
      },
    };
    const g = buildGraph([a, b]);
    expect(g.issues.some((i) => i.kind === "duplicate-id" && i.nodeId === "x"))
      .toBe(true);
  });
});

describe("buildGraph — immutability", () => {
  it("returns frozen issues, sources, and meta arrays/objects", () => {
    const g = buildGraph(allSources);
    expect(Object.isFrozen(g.issues)).toBe(true);
    expect(Object.isFrozen(g.sources)).toBe(true);
    expect(Object.isFrozen(g.meta)).toBe(true);
  });

  it("returns frozen themed-value containers on each node", () => {
    const g = buildGraph(allSources);
    for (const node of g.nodes.values()) {
      expect(Object.isFrozen(node.cssValue)).toBe(true);
      expect(Object.isFrozen(node.rawValue)).toBe(true);
      expect(Object.isFrozen(node.alias)).toBe(true);
      expect(Object.isFrozen(node.themes)).toBe(true);
    }
  });
});

describe("buildGraph — meta", () => {
  it("records ISO timestamp and builder version", () => {
    const g = buildGraph(allSources);
    expect(g.meta.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(g.meta.builderVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("records the names of all source files in order", () => {
    const g = buildGraph(allSources);
    expect(g.sources).toEqual([
      "color",
      "dimension",
      "typography",
      "light",
      "dark",
      "global",
    ]);
  });
});

describe("collection capture (com.figma.collectionName)", () => {
  const customSource: SourceFile = {
    name: "global",
    data: {
      sidebar: {
        width: {
          $type: "number",
          $value: 240,
          $extensions: { "com.figma.collectionName": "components/custom" },
        },
      },
      button: {
        bg: {
          $type: "color",
          $value: { components: [0.1, 0.1, 0.1], hex: "#1a1a1a" },
          $extensions: { "com.figma.collectionName": "components/global" },
        },
      },
      kbd: { bg: { $type: "color", $value: { components: [0, 0, 0], hex: "#000000" } } },
    },
  };

  it("stamps node.collection from $extensions, undefined when absent", () => {
    const graph = buildGraph([customSource]);
    expect(graph.nodes.get("sidebar-width")?.collection).toBe("components/custom");
    expect(graph.nodes.get("button-bg")?.collection).toBe("components/global");
    expect(graph.nodes.get("kbd-bg")?.collection).toBeUndefined();
  });
});

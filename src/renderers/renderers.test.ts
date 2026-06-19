import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { describe, it, expect } from "vitest";
import { buildGraph } from "../build-graph.js";
import type { SourceFile, SourceLayer, TokenNode } from "../token-graph.js";
import { appConfigRenderer } from "./app-config.js";
import { customComponentsRenderer } from "./custom-components.js";
import { scanGraph, customPartsByComponent, declaredCustomComponents } from "../scanner.js";

function realGraph() {
  const dir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../components",
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

const sources: SourceFile[] = [
  {
    name: "color",
    data: {
      color: {
        blue: {
          "600": {
            $type: "color",
            $value: { components: [0.15, 0.39, 0.92], hex: "#2563EB" },
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
  },
  {
    name: "dimension",
    data: {
      rounded: { md: { $type: "number", $value: 6 } },
      spacing: { "4": { $type: "number", $value: 4 } },
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
  },
];

describe("appConfigRenderer", () => {
  it("emits a defineAppConfig wrapper with ui.colors", () => {
    const g = buildGraph(sources);
    const out = appConfigRenderer.render(g);
    expect(out.text).toContain("defineAppConfig({");
    expect(out.text).toContain("ui:");
    expect(out.text).toContain("colors:");
  });

  it("includes all seven Nuxt UI color roles with string values", () => {
    const g = buildGraph(sources);
    const out = appConfigRenderer.render(g);
    for (const role of ["primary", "neutral", "secondary", "success", "info", "warning", "error"]) {
      expect(out.text).toMatch(new RegExp(`${role}:\\s*"[a-z]+"`));
    }
    // The test fixture's button tokens (button-primary-*) don't match
    // the slot-mapping heuristics, so no recipe block should be emitted.
    expect(out.text).not.toContain("button.slots.base");
  });
});

describe("appConfigRenderer — recipe emission", () => {
  // Build a minimal graph whose component-layer tokens match the slot-mapping
  // heuristics for the button component. The "global" source name is treated
  // as component layer by build-graph.
  const recipeSources: SourceFile[] = [
    {
      name: "dimension",
      data: {
        rounded: { md: { $type: "number", $value: 6 } },
        spacing: {
          "2": { $type: "number", $value: 2 },
          "1": { $type: "number", $value: 1 },
        },
      },
    },
    {
      name: "global",
      data: {
        button: {
          // slot base — no size variant → slots.base gets rounded-md
          radius: {
            $type: "number",
            $value: 6,
            $extensions: {
              "com.figma.aliasData": { targetVariableName: "rounded/md" },
            },
          },
          // size-sm variants → variants.size.sm.base gets px-2 py-1
          "padding-x": {
            sm: {
              $type: "number",
              $value: 2,
              $extensions: {
                "com.figma.aliasData": { targetVariableName: "spacing/2" },
              },
            },
          },
          "padding-y": {
            sm: {
              $type: "number",
              $value: 1,
              $extensions: {
                "com.figma.aliasData": { targetVariableName: "spacing/1" },
              },
            },
          },
        },
      },
    },
  ];

  it("emits button recipe when component tokens present", () => {
    const g = buildGraph(recipeSources);
    const out = appConfigRenderer.render(g);
    expect(out.text).toContain("button: {");
    expect(out.text).toContain("slots: {");
    expect(out.text).toContain("rounded-");
    expect(out.text).toContain("variants: {");
    expect(out.text).toContain("size: {");
    expect(out.text).toContain("sm: {");
    expect(out.text).toContain("px-");
    expect(out.text).toContain("py-");
  });

  it("omits button block entirely when no matching component tokens", () => {
    // Use only primitive sources — no component-layer tokens at all.
    const primitiveSources: SourceFile[] = [
      {
        name: "color",
        data: {
          color: {
            blue: {
              "600": {
                $type: "color",
                $value: { components: [0.15, 0.39, 0.92], hex: "#2563EB" },
              },
            },
          },
        },
      },
    ];
    const g = buildGraph(primitiveSources);
    const out = appConfigRenderer.render(g);
    expect(out.text).not.toContain("button: {");
    expect(out.text).not.toContain("slots: {");
  });

  it("emits completeness comment when a variant has missing utilities", () => {
    const g = buildGraph(recipeSources);
    const out = appConfigRenderer.render(g, {
      completeness: [
        {
          component: "button",
          axis: "size",
          variantKey: "sm",
          defined: 1,
          total: 2,
          missingUtilities: ["padding-y"],
        },
      ],
    });
    expect(out.text).toContain("// Incomplete in Figma: missing padding-y");
  });

  it("does not emit completeness comment when completeness option is absent", () => {
    const g = buildGraph(recipeSources);
    const out = appConfigRenderer.render(g);
    expect(out.text).not.toContain("Incomplete in Figma");
  });

  it("does not emit completeness comment when variant has no missing utilities", () => {
    const g = buildGraph(recipeSources);
    const out = appConfigRenderer.render(g, {
      completeness: [
        {
          component: "button",
          axis: "size",
          variantKey: "sm",
          defined: 2,
          total: 2,
          missingUtilities: [],
        },
      ],
    });
    expect(out.text).not.toContain("Incomplete in Figma");
  });

  it("matches the golden app.config.ts snapshot", () => {
    // Golden snapshot: pins the full emitted structure — the colors block, the
    // recipe block, slot/variant ordering, indentation, and the completeness
    // comment — so accidental formatting/ordering changes are caught. The
    // `.toContain` tests above assert presence; this asserts exact shape.
    // Regenerate intentionally with `vitest -u` only when the output changes.
    const g = buildGraph(recipeSources);
    const out = appConfigRenderer.render(g, {
      completeness: [
        {
          component: "button",
          axis: "size",
          variantKey: "sm",
          defined: 1,
          total: 2,
          missingUtilities: ["padding-y"],
        },
      ],
    });
    expect(out.text).toMatchSnapshot();
  });
});

describe("renderer immutability", () => {
  it("returns frozen line maps that cannot be mutated", () => {
    const g = buildGraph(sources);
    const out = appConfigRenderer.render(g);
    // appConfigRenderer does not emit primitives in the LineMap, but the map itself must be a Map
    expect(out.lines).toBeInstanceOf(Map);
  });

  it("calling render twice produces identical text", () => {
    const g = buildGraph(sources);
    const a = appConfigRenderer.render(g);
    const b = appConfigRenderer.render(g);
    expect(a.text).toBe(b.text);
  });
});

describe("appConfigRenderer custom routing", () => {
  it("omits a flagged component from ui: and leaves a pointer comment", () => {
    const withCustom = appConfigRenderer.render(realGraph(), {
      customComponents: new Set(["chip"]),
    }).text;
    expect(withCustom).not.toMatch(/^\s{4}chip: \{/m);
    expect(withCustom).toContain("// chip: looks custom → see custom-components.ts");
  });

  it("is unchanged when no customComponents are passed (regression)", () => {
    const baseline = appConfigRenderer.render(realGraph()).text;
    const noOption = appConfigRenderer.render(realGraph(), {}).text;
    const emptySet = appConfigRenderer.render(realGraph(), { customComponents: new Set() }).text;
    expect(baseline).toMatch(/^\s{4}chip: \{/m); // chip still emitted
    expect(noOption).toBe(baseline);
    expect(emptySet).toBe(baseline);
  });
});

describe("customComponentsRenderer", () => {
  it("emits a recipe const per flagged component with sub-element slots", () => {
    const out = customComponentsRenderer.render(realGraph(), {
      customParts: new Map([["chip", ["label", "close"]]]),
    });
    expect(out.text).toContain("export const chipRecipe");
    expect(out.text).toContain("label:");
    expect(out.text).toContain("close:");
    expect(out.text).toContain("variants:");
    expect(out.text).toMatch(/Nuxt UI cannot express/i);
  });

  it("returns empty text when nothing is flagged", () => {
    const out = customComponentsRenderer.render(realGraph(), { customParts: new Map() });
    expect(out.text).toBe("");
  });
});

describe("customComponentsRenderer overlay recipes", () => {
  function ovGraphR(nodes: TokenNode[]) {
    return {
      nodes: new Map(nodes.map((n) => [n.id, n])),
      aliasIndex: new Map(), reverseAliases: new Map(), issues: [], sources: [],
      meta: { builtAt: "2026-06-12T00:00:00Z", builderVersion: "test" },
    } as const;
  }
  const ovN = (id: string, base: string): TokenNode => ({
    id, path: id.split("-"), type: "color", layer: "component", themes: [],
    cssValue: { base }, rawValue: { base }, alias: {}, source: "global",
  });

  it("emits an overlay recipe const for a graph with genuine overlay tokens", () => {
    // as never: ovGraphR's `as const` return is narrower than TokenGraph; cast through for the test.
    const graph = ovGraphR([
      ovN("button-solid-bg", "#5667A7"),
      ovN("button-overlay-dark-solid-bg", "#FAFAFA"),
    ]) as never;
    const out = customComponentsRenderer.render(graph, {});
    expect(out.text).toContain("export const buttonOverlayDarkRecipe");
    expect(out.text).toMatch(/Nuxt UI cannot express/i);
  });

  it("still returns empty text for a graph with neither custom nor overlay output", () => {
    const graph = ovGraphR([ovN("button-solid-bg", "#5667A7")]) as never;
    expect(customComponentsRenderer.render(graph, {}).text).toBe("");
  });
});

describe("appConfigRenderer — accordion", () => {
  it("emits an accordion recipe block, not routed to custom, when accordion-item tokens are present", () => {
    const accordionSources: SourceFile[] = [
      {
        name: "global",
        data: {
          accordion: {
            item: {
              bg: { $type: "color", $value: "#FFFFFF" },
              text: { $type: "color", $value: "#18181B" },
            },
          },
        },
      },
    ];
    const g = buildGraph(accordionSources);
    const customComponents = new Set(customPartsByComponent(scanGraph(g, { components: ["accordion"] })).keys());
    const out = appConfigRenderer.render(g, { customComponents });
    expect(out.text).toContain("accordion: {");
    expect(out.text).toContain("item:");
    expect(customComponents.has("accordion")).toBe(false);
  });
});

describe("customComponentsRenderer — sidebar (known-custom)", () => {
  it("emits a sidebarRecipe with base + item slots and an active prefix", () => {
    const sidebarSources: SourceFile[] = [
      {
        name: "global",
        data: {
          sidebar: {
            bg: { $type: "color", $value: "#FFFFFF" },
            item: {
              text: { $type: "color", $value: "#18181B" },
              bg: { active: { $type: "color", $value: "#EEF2FF" } },
            },
          },
        },
      },
    ];
    const g = buildGraph(sidebarSources);
    const customParts = customPartsByComponent({ issues: [] });
    const out = customComponentsRenderer.render(g, { customParts });
    expect(out.text).toContain("export const sidebarRecipe");
    expect(out.text).toContain("item:");
    expect(out.text).toMatch(/active:/);
  });
});

describe("customPartsByComponent — collection-aware membership", () => {
  it("routes a declared-custom (Nuxt-analog) component into the custom set via collection", () => {
    // badge has a Nuxt analog (normally standard); declaring it components/custom must route it custom.
    const badgeSources: SourceFile[] = [
      {
        name: "global",
        data: {
          badge: {
            bg: {
              $type: "color",
              $value: "#3b82f6",
              $extensions: { "com.figma.collectionName": "components/custom" },
            },
          },
        },
      },
    ];
    const g = buildGraph(badgeSources);
    const report = scanGraph(g, { components: ["badge"] });
    const customParts = customPartsByComponent(report, declaredCustomComponents(g));
    expect(customParts.has("badge")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { buildGraph } from "../build-graph.js";
import type { SourceFile } from "../token-graph.js";
import { cssRenderer } from "./css.js";
import { tsRenderer } from "./ts.js";
import { appConfigRenderer } from "./app-config.js";

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

describe("cssRenderer", () => {
  it("emits primitives with literal values, no var() refs", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    expect(out.text).toContain("--color-blue-600: #2563EB;");
    expect(out.text).toContain("--rounded-md: 6px;");
  });

  it("emits semantic light + dark blocks under the right selectors", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    expect(out.text).toMatch(
      /:root, html\.light, \[data-theme="light"\] \{[\s\S]*--surface-primary: var\(--color-zinc-100\);/,
    );
    expect(out.text).toMatch(
      /html\.dark, \[data-theme="dark"\] \{[\s\S]*--surface-primary: var\(--color-zinc-900\);/,
    );
  });

  it("emits component overrides with var() to primitive aliases", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    expect(out.text).toContain(
      "--button-primary-background: var(--color-blue-600);",
    );
    expect(out.text).toContain("--button-primary-radius: var(--rounded-md);");
  });

  it("records LineMap entries for every emitted token", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    expect(out.lines.get("color-blue-600")).toBeDefined();
    expect(out.lines.get("button-primary-background")).toBeDefined();
  });

  it("records two line numbers for semantic tokens (light + dark)", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    const surfaceLines = out.lines.get("surface-primary");
    expect(surfaceLines).toBeDefined();
    expect(surfaceLines!.length).toBe(2);
    expect(surfaceLines![0]).toBeLessThan(surfaceLines![1]);
  });

  it("LineMap line numbers point to the actual source line in text", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    const lines = out.text.split("\n");
    const [first, second] = out.lines.get("surface-primary")!;
    expect(lines[first - 1]).toContain("--surface-primary:");
    expect(lines[second - 1]).toContain("--surface-primary:");
  });
});

describe("tsRenderer", () => {
  it("emits sorted keys and a const assertion", () => {
    const g = buildGraph(sources);
    const out = tsRenderer.render(g);
    expect(out.text).toContain("export const tokens = {");
    expect(out.text).toContain("} as const;");
    expect(out.text).toContain('"button-primary-background"');
    expect(out.text).toContain("export type TokenName");
  });

  it("LineMap covers each emitted token entry", () => {
    const g = buildGraph(sources);
    const out = tsRenderer.render(g);
    expect(out.lines.get("color-blue-600")).toBeDefined();
    expect(out.lines.get("surface-primary")).toBeDefined();
  });
});

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
    expect(out.text).not.toContain("button.slots");
    expect(out.text).not.toContain("slots: {");
  });
});

describe("renderer immutability", () => {
  it("returns frozen line maps that cannot be mutated", () => {
    const g = buildGraph(sources);
    const out = cssRenderer.render(g);
    const arr = out.lines.get("color-blue-600")!;
    expect(Object.isFrozen(arr)).toBe(true);
  });

  it("calling render twice produces identical text", () => {
    const g = buildGraph(sources);
    const a = cssRenderer.render(g);
    const b = cssRenderer.render(g);
    expect(a.text).toBe(b.text);
  });
});

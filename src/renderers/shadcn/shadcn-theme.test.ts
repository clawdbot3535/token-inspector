// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildShadcnTheme, shadcnThemeStats } from "./shadcn-theme.js";
import type { TokenGraph, TokenNode } from "../../token-graph.js";

const node = (id: string, cssValue: { base?: string; light?: string; dark?: string }): TokenNode =>
  ({
    id,
    path: id.split("-"),
    type: "color",
    layer: "semantic",
    themes: [],
    cssValue,
    rawValue: {},
    alias: {},
    source: "light",
  }) as unknown as TokenNode;

const graph = (nodes: TokenNode[]): TokenGraph =>
  ({ nodes: new Map(nodes.map((n) => [n.id, n])) }) as unknown as TokenGraph;

describe("buildShadcnTheme", () => {
  const css = buildShadcnTheme(
    graph([
      node("color-bg-base", { light: "#FFFFFF", dark: "#09090B" }),
      node("color-text-primary", { light: "#0A0A0A", dark: "#FAFAFA" }),
      node("color-action-bg", { light: "#4F63D2", dark: "#4F63D2" }),
      node("color-action-text", { light: "#FFFFFF", dark: "#FFFFFF" }),
      node("color-state-focus-ring", { light: "#818CF8", dark: "#A5B4FC" }),
      node("color-border-default", { light: "#E4E4E7", dark: "#27272A" }),
      node("rounded-md", { base: "6px" }),
    ]),
  );

  it("emits :root with light values as oklch + the radius (px, unconverted)", () => {
    expect(css).toContain(":root {");
    expect(css).toContain("--radius: 6px;");
    expect(css).toContain("--background: oklch(1 0 0);"); // #FFFFFF → white
    expect(css).toContain("--primary: oklch("); // #4F63D2 → oklch (exact value covered by oklch.test)
    expect(css).toContain("--ring: oklch(");
  });

  it("emits a .dark block with the dark values as oklch (in mapping order)", () => {
    expect(css).toMatch(/\.dark \{[\s\S]*--background: oklch\([\s\S]*--ring: oklch\(/);
  });

  it("emits @theme inline mapping vars to Tailwind color + radius utilities", () => {
    expect(css).toContain("@theme inline {");
    expect(css).toContain("--color-background: var(--background);");
    expect(css).toContain("--color-primary: var(--primary);");
    expect(css).toContain("--radius-lg: var(--radius);");
  });

  it("skips shadcn vars whose source token is absent (never broken CSS), and notes them", () => {
    // color-bg-elevated absent → no `--card:` declaration, but it's listed as not-mapped.
    expect(css).not.toContain("--card:");
    expect(css).toContain("--card (");
    expect(css).toContain("add manually");
  });

  it("falls back to a default radius when no radius token exists", () => {
    const css2 = buildShadcnTheme(graph([node("color-bg-base", { light: "#fff", dark: "#000" })]));
    expect(css2).toContain("--radius: 0.5rem;");
  });
});

describe("shadcnThemeStats", () => {
  it("reports the mapped count + the missing (absent-token) vars", () => {
    const stats = shadcnThemeStats(
      graph([
        node("color-bg-base", { light: "#fff", dark: "#000" }), // → background, card, popover
        node("color-action-bg", { light: "#00f", dark: "#00f" }), // → primary
      ]),
    );
    expect(stats.mapped).toBeGreaterThanOrEqual(2);
    // color-text-primary etc. are absent → their vars land in missing.
    expect(stats.missing.length).toBeGreaterThan(0);
    expect(stats.missing.some((m) => m.includes("foreground"))).toBe(true);
  });
});

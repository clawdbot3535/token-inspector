import { describe, it, expect } from "vitest";
import { buildGraph } from "../../build-graph.js";
import type { SourceFile } from "../../token-graph.js";
import { buildKitTheme } from "./kit-theme.js";

function buttonGraph() {
  const sources: SourceFile[] = [
    {
      name: "global",
      data: {
        button: {
          radius: { $value: 8, $type: "dimension" },
        },
      },
    },
  ];
  return buildGraph(sources);
}

describe("buildKitTheme", () => {
  it("includes the colour roles", () => {
    const theme = buildKitTheme(buttonGraph());
    expect(theme.colors).toBeDefined();
    expect(typeof theme.colors!.primary).toBe("string"); // e.g. "blue"
    expect(typeof theme.colors!.neutral).toBe("string");
  });
  it("includes a per-component recipe (slots/variants) for components present in the export", () => {
    const theme = buildKitTheme(buttonGraph());
    expect(theme.button).toBeDefined();
    expect((theme.button as { slots: unknown }).slots).toBeDefined();
  });
  it("omits components with no recipe", () => {
    const theme = buildKitTheme(buttonGraph());
    // a component with no tokens in this fixture should be absent — no crash
    expect(theme).toBeTypeOf("object");
    expect(theme.accordion).toBeUndefined();
  });
});

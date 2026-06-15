import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { usePreviewRecipe, useCustomPreviewRecipe } from "./use-preview-recipe.js";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile, TokenGraph } from "@core/token-graph.js";

function graphWith(global: Record<string, unknown>): TokenGraph {
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("usePreviewRecipe", () => {
  it("returns null recipe when graph is null", () => {
    const { recipe } = usePreviewRecipe(() => null, () => "progress");
    expect(recipe.value).toBeNull();
  });

  it("picks the md size base classes when present", () => {
    const g = graphWith({
      progress: {
        "height-md": { $value: 8, $type: "number" },
        "fill-bg": { $value: "#5667A7", $type: "color" },
      },
    });
    const { sizeClasses } = usePreviewRecipe(() => g, () => "progress");
    expect(sizeClasses.value).toContain("h-[8px]");
  });

  it("returns empty sizeClasses when the component has no size variants", () => {
    const g = graphWith({ card: { bg: { $value: "#FFFFFF", $type: "color" } } });
    const { sizeClasses } = usePreviewRecipe(() => g, () => "card");
    expect(sizeClasses.value).toBe("");
  });

  it("reacts to a changing graph getter", () => {
    const gref = ref<TokenGraph | null>(null);
    const { recipe } = usePreviewRecipe(() => gref.value, () => "kbd");
    expect(recipe.value).toBeNull();
    gref.value = graphWith({ kbd: { bg: { $value: "#F4F4F5", $type: "color" } } });
    expect(recipe.value).not.toBeNull();
  });
});

describe("useCustomPreviewRecipe", () => {
  it("returns null when graph is null", () => {
    const { recipe } = useCustomPreviewRecipe(() => null, () => "sidebar", () => new Map());
    expect(recipe.value).toBeNull();
  });
  it("builds a custom recipe from buildCustomRecipes + parts", () => {
    const g = graphWith({
      sidebar: {
        bg: { $value: "#F4F4F5", $type: "color" },
        "item-text": { $value: "#52525B", $type: "color" },
      },
    });
    const parts = new Map<string, readonly string[]>([["sidebar", ["item"]]]);
    const { recipe } = useCustomPreviewRecipe(() => g, () => "sidebar", () => parts);
    expect(recipe.value?.slots["base"]).toContain("bg-[#F4F4F5]");
    expect(recipe.value?.slots["item"]).toContain("#52525B");
  });
});

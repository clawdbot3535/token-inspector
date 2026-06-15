import { computed, type ComputedRef } from "vue";
import { buildComponentRecipes, type ComponentRecipe } from "@core/recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";

const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

/**
 * Build the recipe for a component and expose the representative size base
 * classes (md if present, else the smallest defined). Dedups the recipe-build +
 * SIZE_ORDER/sizeClasses logic previously copy-pasted across the form-control
 * previews. Getters keep it reactive without binding to a specific ref API.
 */
export function usePreviewRecipe(
  graphFn: () => TokenGraph | null,
  componentNameFn: () => string,
): { recipe: ComputedRef<ComponentRecipe | null>; sizeClasses: ComputedRef<string> } {
  const recipe = computed<ComponentRecipe | null>(() => {
    const g = graphFn();
    if (!g) return null;
    const name = componentNameFn();
    return buildComponentRecipes(g, { components: [name] })[name] ?? null;
  });
  const sizeClasses = computed<string>(() => {
    const sizes = recipe.value?.variants.size ?? {};
    const keys = Object.keys(sizes);
    if (keys.length === 0) return "";
    const key = keys.includes("md")
      ? "md"
      : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
    return sizes[key]?.["base"] ?? "";
  });
  return { recipe, sizeClasses };
}

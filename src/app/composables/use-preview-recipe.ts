import { computed, inject, ref, type ComputedRef } from "vue";
import { buildComponentRecipes, type ComponentRecipe } from "@core/recipe-engine.js";
import { buildCustomRecipes } from "@core/custom-recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { RESOLVE_OVERRIDE_KEY } from "../resolve/override-key.js";

const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

/** The representative size variant's base classes (md if present, else smallest). */
export function representativeSizeClasses(recipe: ComponentRecipe | null): string {
  const sizes = recipe?.variants.size ?? {};
  const keys = Object.keys(sizes);
  if (keys.length === 0) return "";
  const key = keys.includes("md")
    ? "md"
    : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
  return sizes[key]?.["base"] ?? "";
}

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
  // inject() returns undefined when called outside a component setup context
  // (e.g. in unit tests that call usePreviewRecipe directly). Fall back to an
  // empty override ref so the recipe engine's heuristic path is unaffected.
  const override = inject(RESOLVE_OVERRIDE_KEY) ?? ref<SlotMappingOverride>({});
  const recipe = computed<ComponentRecipe | null>(() => {
    const g = graphFn();
    if (!g) return null;
    const name = componentNameFn();
    return buildComponentRecipes(g, { components: [name], slotMappingOverride: override.value })[name] ?? null;
  });
  const sizeClasses = computed<string>(() => representativeSizeClasses(recipe.value));
  return { recipe, sizeClasses };
}

/**
 * Like usePreviewRecipe, but for custom components (chip, sidebar) that emit to
 * custom-components.ts via buildCustomRecipes. `partsFn` supplies the
 * component→foreign-parts map (App.vue's `customParts`).
 */
export function useCustomPreviewRecipe(
  graphFn: () => TokenGraph | null,
  componentNameFn: () => string,
  partsFn: () => ReadonlyMap<string, ReadonlyArray<string>>,
): { recipe: ComputedRef<ComponentRecipe | null>; sizeClasses: ComputedRef<string> } {
  const recipe = computed<ComponentRecipe | null>(() => {
    const g = graphFn();
    if (!g) return null;
    const name = componentNameFn();
    return buildCustomRecipes(g, partsFn(), {})[name] ?? null;
  });
  const sizeClasses = computed<string>(() => representativeSizeClasses(recipe.value));
  return { recipe, sizeClasses };
}

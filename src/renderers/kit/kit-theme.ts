import type { TokenGraph } from "../../token-graph.js";
import type { ComponentRecipe } from "../../recipe-engine.js";
import { buildComponentRecipes } from "../../recipe-engine.js";
import { COMPONENT_ALLOW_LIST, deriveRoles } from "../app-config.js";

/** The `@nuxt/ui` app-config `ui` shape consumed by the Vite plugin's `ui` option:
 *  colours + per-component slot/variant overrides. Built from the SAME functions the
 *  app.config.ts renderer uses, so the kit and the Nuxt export stay consistent. */
export interface KitTheme {
  colors?: Record<string, string>;
  [component: string]: ComponentRecipe | Record<string, string> | undefined;
}

export function buildKitTheme(graph: TokenGraph): KitTheme {
  const roles = deriveRoles(graph);
  const recipes = buildComponentRecipes(graph, { components: [...COMPONENT_ALLOW_LIST] });
  const theme: KitTheme = { colors: { ...roles } };
  for (const name of COMPONENT_ALLOW_LIST) {
    const recipe = recipes[name];
    if (recipe) theme[name] = recipe;
  }
  return theme;
}

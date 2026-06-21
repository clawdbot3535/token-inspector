import type { InjectionKey, Ref } from "vue";
import type { SlotMappingOverride } from "@tg/grammar";

/** Session slot-mapping override, provided by App.vue and injected by
 *  usePreviewRecipe so the live Kit render reflects applied resolutions.
 *  An empty `{}` override is a no-op (the recipe engine falls back to the
 *  heuristic for unkeyed tokens). */
export const RESOLVE_OVERRIDE_KEY: InjectionKey<Ref<SlotMappingOverride>> = Symbol("resolve-override");

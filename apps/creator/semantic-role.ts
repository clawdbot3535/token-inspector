// Nuxt UI semantic alias map.
// Maps scaffold AliasCtx (utility + state) to a Nuxt UI semantic token name.
// Returns null for dimension utilities and any unrecognised utility — scaffold
// falls back to a placeholder value in those cases.

import type { AliasCtx } from "@tg/grammar";

const DIMENSION_UTILITIES = new Set([
  "size",
  "radius",
  "width",
  "height",
  "padding",
  "gap",
]);

/**
 * Best-effort resolver from a scaffold AliasCtx to a Nuxt UI semantic token name.
 *
 * Color utilities:
 *   bg        → color.bg.muted (base) | color.action.bg (checked/active) | color.bg.disabled (disabled)
 *   border    → color.border.default
 *   text-color→ color.text.default
 *   ring      → color.border.focus
 *
 * Dimension utilities (size/radius/width/height/padding/gap) → null (raw fallback).
 * Unknown utilities → null.
 */
export function nuxtUiAliasResolver(ctx: AliasCtx): string | null {
  const { utility, state } = ctx;

  if (DIMENSION_UTILITIES.has(utility)) return null;

  switch (utility) {
    case "bg":
      if (state === "disabled") return "color.bg.disabled";
      if (state === "checked" || state === "active") return "color.action.bg";
      return "color.bg.muted";

    case "border":
      return "color.border.default";

    case "text-color":
      return "color.text.default";

    case "ring":
      return "color.border.focus";

    default:
      return null;
  }
}

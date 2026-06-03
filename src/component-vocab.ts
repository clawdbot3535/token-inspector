// Shared component-token vocabulary. Single source of truth for both the
// scanner (asymmetric-variant detection) and slot-mapping (recipe mapping).

/** Nuxt UI v4 visual variants (button-style). 2nd-segment variant axis. */
export const BUTTON_VARIANT_KEYS: ReadonlySet<string> = new Set([
  "solid", "outline", "ghost", "link", "subtle", "soft",
]);

/** Semantic color roles used as a variant axis (badge/alert/status). */
export const COLOR_ROLE_KEYS: ReadonlySet<string> = new Set([
  "accent", "default", "primary", "secondary", "success", "error", "warning", "info", "neutral",
]);

/** Union — a 2nd-segment is "variant-like" when in this set. */
export const KNOWN_VARIANT_NAMES: ReadonlySet<string> = new Set([
  ...BUTTON_VARIANT_KEYS, ...COLOR_ROLE_KEYS,
]);

export const SIZE_KEYS: ReadonlySet<string> = new Set(["xs", "sm", "md", "lg", "xl", "2xl"]);

/**
 * Components whose Nuxt UI v4 frame is a Tailwind `ring` (not a CSS border):
 * their `border-*` tokens emit `ring-*` utilities. Limited to frames expressed
 * on the base slot.
 *
 * Excluded on purpose:
 * - `button`, `badge`: ring is variant/color-conditional (only outline/subtle) —
 *   their border tokens live on the variant/color axis; needs a variant-aware
 *   remap (D2c), not this component-level one.
 * - `switch`: its `border-*` is a transparent `border-2` used only for sizing
 *   (the visible state is a background fill); it is not a frame.
 * - `table`, `nav`: genuine CSS borders (`divide-y`, `border-s`).
 */
export const RING_FRAMED_COMPONENTS: ReadonlySet<string> = new Set([
  "input", "textarea", "checkbox", "radio", "kbd", "dropdown", "modal",
  "card", "chip",
]);

/** Trailing interaction-state keys → Tailwind pseudo-class prefixes. */
export const STATE_KEYS: ReadonlySet<string> = new Set([
  "default", "hover", "active", "disabled", "focus", "checked", "hovered",
]);

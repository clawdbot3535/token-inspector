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

/**
 * Components whose ring frame is *variant-conditional*: only the listed
 * variants draw a Tailwind `ring`; the others have no frame. Distinct from
 * RING_FRAMED_COMPONENTS, where every `border-*` token is a ring. Nuxt UI v4
 * frames the button `outline` and `subtle` variants with `ring ring-inset`;
 * `solid`/`soft`/`ghost`/`link` have no frame (their `border` tokens are
 * transparent placeholders). `subtle` is included for Nuxt-correctness even
 * though the current export defines no `subtle` tokens.
 */
export const RING_FRAMED_VARIANTS: ReadonlyMap<string, ReadonlySet<string>> =
  new Map([["button", new Set(["outline", "subtle"])]]);

/** True when `component`'s `variant` draws a Tailwind ring frame (D2c). */
export function isRingFramedVariant(
  component: string,
  variant: string | null,
): boolean {
  if (variant === null) return false;
  return RING_FRAMED_VARIANTS.get(component)?.has(variant) ?? false;
}

/** Trailing interaction-state keys → Tailwind pseudo-class prefixes. */
export const STATE_KEYS: ReadonlySet<string> = new Set([
  "default", "hover", "active", "disabled", "focus", "checked", "hovered",
]);

/**
 * Per-component states that Nuxt UI v4 applies via a PROP, not a CSS
 * pseudo-class. Such tokens cannot be expressed as a recipe slot/class, so the
 * grammar drops them and the scanner flags them as deviations.
 *
 * Seed: Nuxt Input has no `:active` state — its "active / selected" look is the
 * `highlight` boolean prop (`ring ring-inset ring-<color>`). `:active` IS valid
 * for button (pressed), so this is keyed per component. Only deviations live
 * here; real pseudo-class states (hover/focus/disabled) route via STATE_KEYS.
 * Textarea is Input's twin (same `highlight` prop, no `:active`), so it shares the entry.
 */
export const PROP_DRIVEN_STATES: ReadonlyMap<string, ReadonlyMap<string, string>> =
  new Map([
    ["input", new Map([["active", "highlight"]])],
    ["textarea", new Map([["active", "highlight"]])],
  ]);

/** Returns the Nuxt prop that drives `state` on `component`, or null. */
export function propDrivenStateFor(component: string, state: string | null): string | null {
  if (state === null) return null;
  return PROP_DRIVEN_STATES.get(component)?.get(state) ?? null;
}

/**
 * Per-Figma-component → the Nuxt UI v4 theme slot ("part") names that component
 * defines. Hand-authored from each component's theme `slots` keys (Nuxt UI MCP;
 * Nuxt UI v4 is the pinned target). Keyed by the Figma component name as it
 * appears in token ids (chip, dropdown, nav); slots taken from the matching Nuxt
 * component (Chip, DropdownMenu, NavigationMenu, …). Used to tell "Nuxt has no
 * such slot (custom/mis-named)" from "valid Nuxt slot the adapter doesn't route
 * yet". Covers the parts-bearing + form/display components; the rest of the
 * allow-list (card, kbd, modal, progress, radio, switch) have no referenced
 * parts today — add their slot sets here when they do (the detector skips
 * uninventoried components safely).
 */
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["button", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
  ["badge", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
  ["input", new Set(["root", "base", "leading", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailing", "trailingIcon"])],
  ["textarea", new Set(["root", "base", "leading", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailing", "trailingIcon"])],
  ["chip", new Set(["root", "base"])],
  ["checkbox", new Set(["root", "container", "base", "indicator", "icon", "wrapper", "label", "description"])],
  ["dropdown", new Set([
    "content", "input", "empty", "viewport", "arrow", "group", "label", "separator",
    "item", "itemLeadingIcon", "itemLeadingAvatar", "itemLeadingAvatarSize", "itemTrailing",
    "itemTrailingIcon", "itemTrailingKbds", "itemTrailingKbdsSize", "itemWrapper", "itemLabel",
    "itemDescription", "itemLabelExternalIcon",
  ])],
  ["table", new Set(["root", "base", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "separator", "empty", "loading"])],
  ["nav", new Set([
    "root", "list", "label", "item", "link", "linkLeadingIcon", "linkLeadingAvatar",
    "linkLeadingAvatarSize", "linkLeadingChipSize", "linkTrailing", "linkTrailingBadge",
    "linkTrailingBadgeSize", "linkTrailingIcon", "linkLabel", "linkLabelExternalIcon",
    "childList", "childLabel", "childItem", "childLink", "childLinkWrapper", "childLinkIcon",
    "childLinkLabel", "childLinkLabelExternalIcon", "childLinkDescription", "separator",
    "viewportWrapper", "viewport", "content", "indicator", "arrow",
  ])],
]);

/** The Nuxt UI v4 theme slot names for a Figma component, or undefined if not inventoried. */
export function nuxtSlotsFor(component: string): ReadonlySet<string> | undefined {
  return NUXT_SLOTS.get(component);
}

/**
 * 2nd segments that are NEVER a sub-element part — utility / state / dimension
 * words. Excluded from the unsupported-part detector: the "mapped 2nd segment"
 * trick alone misses utility words that, for a given component, appear only in
 * null-mapped tokens (e.g. `checkbox-size-md`, `nav-ring-radius`, `textarea-min-height`).
 */
export const NON_PART_SEGMENTS: ReadonlySet<string> = new Set<string>([
  ...STATE_KEYS,
  "selected", "visited",
  "size", "min", "max", "height", "width", "radius", "gap", "offset", "spacing", "padding",
  "font", "letter", "line", "text", "tracking", "leading", "weight", "family",
  "border", "bg", "ring", "placeholder", "underline", "color",
  "fill", "stroke", "resize", "shadow",
]);

/**
 * Figma part name → the Nuxt UI v4 slot it corresponds to (a naming mismatch).
 * Drives a concrete "rename in Figma" suggestion in the unsupported-part hint.
 * Only suggested when the aliased name is a real slot of that component
 * (self-validating in the scanner).
 */
export const FIGMA_NUXT_PART_ALIAS: ReadonlyMap<string, string> = new Map([
  ["row", "tr"],
  ["divider", "separator"],
  ["check", "icon"],
]);

// Shared component-token vocabulary. Single source of truth for both the
// scanner (asymmetric-variant detection) and slot-mapping (recipe mapping).

import { GENERATED_NUXT_SLOTS } from "./nuxt-slots.generated.js";
import { SLOT_OVERLAY } from "./nuxt-vocab-curated.js";

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
 * Legitimate token-name words that coincidentally sit within one edit of a
 * value-bearing vocab word, so the typo detector must NOT flag them. Seeded from
 * observed false positives; extend as new collisions surface.
 * - `full`    — `rounded-full` (Tailwind radius keyword), one edit from `fill`.
 * - `loading` — loading-state tokens (e.g. `color-state-loading-bg`), one edit from `leading`.
 */
export const NON_TYPO_WORDS: ReadonlySet<string> = new Set<string>([
  "full",
  "loading",
]);

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

/** Trailing interaction-state keys → Tailwind pseudo-class or data-variant prefixes. */
export const STATE_KEYS: ReadonlySet<string> = new Set([
  "default", "hover", "active", "disabled", "focus", "checked", "hovered",
  "opened", "open",
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
    // Nuxt UI v4 NavigationMenu applies the active (current-page) look via a baked-in
    // `active` boolean variant + compoundVariants, not a `:active` pseudo-class. So the
    // recipe can't express it (slot `ui` overrides apply unconditionally) — drop + flag.
    ["nav", new Map([["active", "active"]])],
  ]);

/** Returns the Nuxt prop that drives `state` on `component`, or null. */
export function propDrivenStateFor(component: string, state: string | null): string | null {
  if (state === null) return null;
  return PROP_DRIVEN_STATES.get(component)?.get(state) ?? null;
}

/**
 * Components mapped to Nuxt UI v4 components that expose NO interaction states at all
 * (UKbd is a static key display — no hover/active/focus/disabled). Any state token on these
 * is unexpressible: the grammar drops it and the scanner flags an `unsupported-state` deviation.
 * Distinct from PROP_DRIVEN_STATES (there a prop drives the state; here the state does not exist).
 * Seed: kbd (the live-export case `kbd-bg-active`). badge/card/progress are candidate additions
 * when an export carries their state tokens; custom components (chip/sidebar) are excluded.
 */
export const STATELESS_COMPONENTS: ReadonlySet<string> = new Set(["kbd", "badge"]);

/** Components whose `disabled` state Nuxt UI v4 dims via opacity (not colour). A `disabled`
 *  COLOUR token maps to `disabled:bg/text-[…]` but never visibly applies, because Nuxt keeps the
 *  resting colours and only reduces opacity. (input/checkbox/switch confirmed by the Real-tab
 *  fidelity diff; textarea/radio are the same Nuxt UI component families. button/select excluded —
 *  no evidence yet.) */
export const OPACITY_DISABLED_COMPONENTS: ReadonlySet<string> = new Set([
  "input",
  "textarea",
  "checkbox",
  "radio",
  "switch",
]);

/** Components whose RESTING colour Nuxt UI v4 drives via a `data-[state=…]` variant (specificity
 *  0,1,1), which out-specifies a plain recipe utility (0,1,0). switch's unchecked track uses
 *  `data-[state=unchecked]:bg-accented`, so the recipe's plain resting `bg-[…]` loses at rest. */
export const RESTING_STATE_SHADOWED: ReadonlySet<string> = new Set(["switch"]);

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
// Composed from the codegen-derived Nuxt UI slots (nuxt-slots.generated.ts) with
// the curated overlay (nuxt-vocab-curated.ts) winning per component. Slotless
// components (empty set, e.g. kbd) are EXCLUDED so nuxtSlotsFor() returns undefined
// for them — matching the pre-codegen behavior. Run `npm run gen:vocab` to re-sync
// the generated base after a @nuxt/ui upgrade.
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [...GENERATED_NUXT_SLOTS.keys(), ...SLOT_OVERLAY.keys()]
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((c) => [c, SLOT_OVERLAY.get(c) ?? GENERATED_NUXT_SLOTS.get(c)!] as const)
    .filter(([, slots]) => slots.size > 0),
);

/** The Nuxt UI v4 theme slot names for a Figma component, or undefined if not inventoried. */
export function nuxtSlotsFor(component: string): ReadonlySet<string> | undefined {
  return NUXT_SLOTS.get(component);
}

/**
 * The component's leading-icon slot — `leadingIcon` for most, `linkLeadingIcon` (nav) or
 * `itemLeadingIcon` (dropdown) for link/item-scoped anatomies, or undefined if it has none.
 * `icon-size` routes here instead of collapsing a sub-element base (accordion-item-icon-size,
 * nav-item-icon-size). Derived from NUXT_SLOTS so new components need no extra wiring.
 */
export function leadingIconSlotFor(component: string): string | undefined {
  const slots = nuxtSlotsFor(component);
  if (!slots) return undefined;
  if (slots.has("leadingIcon")) return "leadingIcon";
  return [...slots].find((s) => /leadingIcon$/i.test(s));
}

/**
 * The default recipe slot for a component's bare (no sub-element) tokens. Nuxt UI
 * v4 components name their styling base differently — Card's is `root`, Dropdown
 * and Modal's is `content` — whereas most components use `base`.
 */
export const COMPONENT_BASE_SLOT: ReadonlyMap<string, string> = new Map([
  ["card", "root"],
  ["dropdown", "content"],
  ["modal", "content"],
]);

/** The base slot for a component's bare tokens (`base` unless overridden). */
export function defaultBaseSlot(component: string): string {
  return COMPONENT_BASE_SLOT.get(component) ?? "base";
}

/**
 * Components with no Nuxt UI recipe that the inspector emits as hand-anatomy
 * custom recipes (custom-components.ts), independent of the scanner's
 * `component-looks-custom` flag. Maps component → its routable sub-element slots
 * (used as extraSlots; base-level tokens use the default `base` slot).
 */
export const KNOWN_CUSTOM_COMPONENTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["sidebar", ["item"]],
]);

/**
 * Top-level token prefixes that are layout / type-scale primitives, not Nuxt
 * UI components. They land in the component layer (authored in the `global`
 * source) but belong to the theme/CSS layer — the scan forecast reports them as
 * non-component primitives, not as "unmapped components".
 */
export const NON_COMPONENT_PREFIXES: ReadonlySet<string> = new Set<string>([
  "typography", "container", "page", "grid", "stack", "section",
]);

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
  "fill", "stroke", "resize", "shadow", "overlay",
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
  ["dot", "indicator"],
  ["fill", "indicator"],
  ["track", "base"],
  ["desc", "description"], // toast-desc-* → the `description` slot
  // Composite (2-segment) part name: a `close` element that IS a button → the `close` slot.
  // Consulted by the 2-segment composite lookup in slot-mapping; the `button` descriptor is
  // thereby consumed so e.g. `chip-close-button-size` → close slot + size utility.
  ["close-button", "close"],
]);

/**
 * Leading/trailing slot counterparts among the grammar-fillable RecipeSlots.
 * Used by the capability-gap detector: when one half is filled by a Figma token
 * and the other is a real Nuxt slot but unfilled, that asymmetry is flagged.
 * Only `leadingIcon`/`trailingIcon` is fillable today (the `leading`/`trailing`
 * input wrappers are not RecipeSlot values). Extensible. Typed as `string` pairs
 * (not `RecipeSlot`) on purpose: `slot-mapping.ts` already imports from this
 * module, so importing `RecipeSlot` here would create a cycle; the values are
 * only compared against the `string` `NUXT_SLOTS` sets.
 */
export const SLOT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["leadingIcon", "trailingIcon"],
];

/** Slots whose classes mirror to a partner slot when the partner has no own
 *  tokens. Figma defines icon utilities once (`icon-size`) for ANY icon;
 *  Nuxt's theme sizes leading AND trailing alike. Consumed by the recipe
 *  engine (post-build copy) and the scanner (filled-slot recording). */
export const SLOT_MIRROR: ReadonlyArray<readonly [string, string]> = [
  ["leadingIcon", "trailingIcon"],
];

// Per-component Nuxt UI v4 theme anatomy: each slot classified structural vs optional, with a
// one-line "what it controls". The foundation of the coverage guide — it lets the engine report
// which parts of a component a design still needs to cover. Keys mirror NUXT_SLOTS exactly
// (enforced by component-anatomy.test.ts). Curated from the Nuxt UI v4 component themes.

export type SlotClassification = "structural" | "optional";

export interface SlotAnatomy {
  /** structural = must design to match the base component; optional = adornment / variant / sub-feature. */
  classification: SlotClassification;
  /** Short (<=60 char) phrase naming the visual the slot governs (for the to-design list). */
  controls: string;
}

const s = (controls: string): SlotAnatomy => ({ classification: "structural", controls });
const o = (controls: string): SlotAnatomy => ({ classification: "optional", controls });

// nav — Nuxt UI v4 NavigationMenu. structural = base navbar (root/list/item/link); the rest are
// adornments (icons/avatars/badges), the submenu cluster, and grouping. (Classification locked
// 2026-06-16 with the user; see the design spec.)
const NAV: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["root", s("navbar container: layout (flex), gap, orientation")],
  ["list", s("items wrapper: layout / alignment of the entries")],
  ["item", s("each entry container: vertical spacing")],
  ["link", s("link: text, padding, bg, hover, active, ring, radius")],
  ["label", o("section heading text (grouped navs)")],
  ["linkLeadingIcon", o("leading icon size / colour on a link")],
  ["linkLeadingAvatar", o("leading avatar on a link")],
  ["linkLeadingAvatarSize", o("leading avatar size token")],
  ["linkLeadingChipSize", o("leading chip size token")],
  ["linkTrailing", o("trailing slot container (badge / icon)")],
  ["linkTrailingBadge", o("trailing badge on a link")],
  ["linkTrailingBadgeSize", o("trailing badge size token")],
  ["linkTrailingIcon", o("trailing / chevron icon (rotates on open)")],
  ["linkLabel", o("link text wrapper (truncate; inherits from link)")],
  ["linkLabelExternalIcon", o("external-link indicator icon")],
  ["childList", o("submenu list container")],
  ["childLabel", o("submenu section label")],
  ["childItem", o("submenu item container")],
  ["childLink", o("submenu link: text, padding, hover, active")],
  ["childLinkWrapper", o("submenu link content wrapper")],
  ["childLinkIcon", o("submenu link icon")],
  ["childLinkLabel", o("submenu link label text")],
  ["childLinkLabelExternalIcon", o("submenu external-link icon")],
  ["childLinkDescription", o("submenu link description text")],
  ["separator", o("divider between items / groups")],
  ["viewportWrapper", o("dropdown viewport positioning wrapper")],
  ["viewport", o("dropdown panel: bg, shadow, radius, ring")],
  ["content", o("dropdown content container + animation")],
  ["indicator", o("active-item indicator bar")],
  ["arrow", o("dropdown arrow / caret")],
]);

/** Per-component, per-slot anatomy. Keys mirror NUXT_SLOTS exactly (100% coverage required). */
export const COMPONENT_ANATOMY: ReadonlyMap<string, ReadonlyMap<string, SlotAnatomy>> = new Map([
  ["nav", NAV],
]);

/** The anatomy of a component, or undefined if not curated yet. */
export function anatomyFor(component: string): ReadonlyMap<string, SlotAnatomy> | undefined {
  return COMPONENT_ANATOMY.get(component);
}

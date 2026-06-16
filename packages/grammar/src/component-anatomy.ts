// Per-component Nuxt UI v4 theme anatomy: each slot classified structural vs optional, with a
// one-line "what it controls". The foundation of the coverage guide — it lets the engine report
// which parts of a component a design still needs to cover. Keys mirror NUXT_SLOTS exactly
// (enforced by component-anatomy.test.ts). Curated from the Nuxt UI v4 component themes.

export type SlotClassification = "structural" | "optional" | "inherited";

export interface SlotAnatomy {
  /** structural = must design to match the base component; optional = adornment / variant / sub-feature. */
  classification: SlotClassification;
  /** Short (<=60 char) phrase naming the visual the slot governs (for the to-design list). */
  controls: string;
  /** Parent slot this one inherits its styling from. Set iff classification === "inherited". */
  inheritsFrom?: string;
}

const s = (controls: string): SlotAnatomy => ({ classification: "structural", controls });
const o = (controls: string): SlotAnatomy => ({ classification: "optional", controls });
const i = (inheritsFrom: string, controls: string): SlotAnatomy =>
  ({ classification: "inherited", controls, inheritsFrom });

// nav — Nuxt UI v4 NavigationMenu. Under the Must-Design principle only `link` carries a
// designable surface (bg/text/hover/active/ring/radius); root=gap+layout, list=flex,
// item=py-spacing are layout/spacing Nuxt defaults already match. The rest are adornments,
// the submenu cluster, and grouping. (Classification locked 2026-06-16 with the user.)
const NAV: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["root", o("navbar container: layout (flex), gap, orientation")],
  ["list", o("items wrapper: layout / alignment of the entries")],
  ["item", o("each entry container: vertical spacing")],
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
  ["linkLabel", i("link", "link text wrapper (truncate; follows link)")],
  ["linkLabelExternalIcon", o("external-link indicator icon")],
  ["childList", o("submenu list container")],
  ["childLabel", o("submenu section label")],
  ["childItem", o("submenu item container")],
  ["childLink", o("submenu link: text, padding, hover, active")],
  ["childLinkWrapper", o("submenu link content wrapper")],
  ["childLinkIcon", o("submenu link icon")],
  ["childLinkLabel", i("childLink", "submenu link label text (follows childLink)")],
  ["childLinkLabelExternalIcon", o("submenu external-link icon")],
  ["childLinkDescription", o("submenu link description text")],
  ["separator", o("divider between items / groups")],
  ["viewportWrapper", o("dropdown viewport positioning wrapper")],
  ["viewport", o("dropdown panel: bg, shadow, radius, ring")],
  ["content", o("dropdown content container + animation")],
  ["indicator", o("active-item indicator bar")],
  ["arrow", o("dropdown arrow / caret")],
]);

// accordion — Nuxt UI v4 Accordion. structural = the panel border, the clickable trigger, and the
// body text/padding. root=w-full, header=flex, content=open/close animation → optional.
const ACCORDION: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["root", o("accordion container (full width)")],
  ["item", s("each panel: border / separator")],
  ["header", o("header row layout (wraps the trigger)")],
  ["trigger", s("clickable header: text, padding, focus ring, radius")],
  ["content", o("expandable region: open / close animation")],
  ["body", s("panel body: text, padding")],
  ["leadingIcon", o("leading icon size / colour")],
  ["trailingIcon", o("expand chevron (rotates on open)")],
  ["label", i("trigger", "trigger label text (follows trigger)")],
]);

// modal — Nuxt UI v4 Modal. structural = the dim overlay, the dialog box, the body padding, the
// title text. wrapper='' empty, header/footer=layout+default padding, close=position → optional.
const MODAL: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["overlay", s("backdrop / dim: bg colour, opacity")],
  ["content", s("dialog box: bg, radius, shadow, ring")],
  ["header", o("header region: layout + padding")],
  ["wrapper", o("content wrapper (no own styling)")],
  ["body", s("body region: padding")],
  ["footer", o("footer region: layout + padding")],
  ["title", s("dialog title text")],
  ["description", o("dialog description text (secondary)")],
  ["close", o("close button position")],
]);

// table — Nuxt UI v4 Table. structural = the header + data cells (padding + text). root/base/
// thead/tbody/tfoot/tr=layout + state, caption=sr-only, empty/loading=states → optional.
const TABLE: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["root", o("scroll container (overflow)")],
  ["base", o("table element (min-width)")],
  ["caption", o("caption (screen-reader only)")],
  ["thead", o("header row group (layout / sticky)")],
  ["tbody", o("body row group (row dividers)")],
  ["tfoot", o("footer row group (layout)")],
  ["tr", o("row (selected-state bg)")],
  ["th", s("header cell: padding, text")],
  ["td", s("data cell: padding, text")],
  ["separator", o("row separator line")],
  ["empty", o("empty-state message")],
  ["loading", o("loading-state row")],
]);

// dropdown — Nuxt UI v4 DropdownMenu. structural = the menu panel and the menu item. The rest are
// adornments (icon/avatar/kbds), layout, grouping, and empty states → optional.
const DROPDOWN: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["content", s("menu panel: bg, shadow, radius, ring")],
  ["input", o("search input (border)")],
  ["empty", o("empty-state message")],
  ["viewport", o("scroll viewport (layout)")],
  ["arrow", o("menu arrow / caret")],
  ["group", o("item group container")],
  ["label", o("group label text")],
  ["separator", o("divider between groups")],
  ["item", s("menu item: text, bg, hover, active, padding")],
  ["itemLeadingIcon", o("item leading icon")],
  ["itemLeadingAvatar", o("item leading avatar")],
  ["itemLeadingAvatarSize", o("item leading avatar size")],
  ["itemTrailing", o("item trailing container")],
  ["itemTrailingIcon", o("item trailing icon")],
  ["itemTrailingKbds", o("item trailing keyboard hints")],
  ["itemTrailingKbdsSize", o("item trailing kbd size")],
  ["itemWrapper", o("item content wrapper (layout)")],
  ["itemLabel", i("item", "item label text (follows item)")],
  ["itemDescription", o("item description text (secondary)")],
  ["itemLabelExternalIcon", o("item external-link icon")],
]);

/** Per-component, per-slot anatomy. Keys mirror NUXT_SLOTS exactly (100% coverage required). */
export const COMPONENT_ANATOMY: ReadonlyMap<string, ReadonlyMap<string, SlotAnatomy>> = new Map([
  ["nav", NAV],
  ["accordion", ACCORDION],
  ["modal", MODAL],
  ["table", TABLE],
  ["dropdown", DROPDOWN],
]);

/** The anatomy of a component, or undefined if not curated yet. */
export function anatomyFor(component: string): ReadonlyMap<string, SlotAnatomy> | undefined {
  return COMPONENT_ANATOMY.get(component);
}

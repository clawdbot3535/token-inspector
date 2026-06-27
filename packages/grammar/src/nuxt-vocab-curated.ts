// Hand-curated inputs to the Nuxt UI vocabulary codegen. Everything Nuxt UI
// itself cannot tell us lives here; the generated slots live in
// nuxt-slots.generated.ts. See
// docs/superpowers/specs/2026-06-27-component-vocab-codegen-design.md

/** Figma component names to generate vocabulary for — genuine form/display/overlay
 *  components. Excludes Pro/app-shell/content themes (dashboard-*, chat-*, prose, …).
 *  Extend this as the Figma kit grows. */
export const INCLUDE_LIST: readonly string[] = [
  "button", "badge", "input", "textarea", "card", "modal", "kbd", "chip",
  "checkbox", "radio", "switch", "nav", "dropdown", "table", "progress", "accordion",
  "toast", "alert", "tooltip", "popover", "tabs", "select", "breadcrumb", "drawer", "avatar",
];

/** Figma name → Nuxt UI theme filename (without `.ts`), for the few that differ.
 *  Components absent here map to `<name>.ts` directly. */
export const FIGMA_THEME_FILE: ReadonlyMap<string, string> = new Map([
  ["nav", "navigation-menu"],
  ["dropdown", "dropdown-menu"],
  ["radio", "radio-group"],
]);

/** Deliberate per-component slot-set overrides (win over the generated base).
 *  `chip` is intentionally minimal (routed via the custom path). Grown during
 *  reconciliation (Task 4) for any component whose generated set must deviate. */
export const SLOT_OVERLAY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["chip", new Set(["root", "base"])],
]);

/** Components forced into the allow-list beyond the generated set (none today). */
export const ALLOW_LIST_EXTRA: readonly string[] = [];

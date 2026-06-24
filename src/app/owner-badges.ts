import type { Owner } from "./resolve/owner-of.js";

export interface OwnerBadge {
  /** Tailwind classes for the muted pill (light + dark). */
  cls: string;
  /** Hover / screen-reader tooltip. */
  title: string;
  /** Visible glyph + label text. */
  label: string;
}

// Only three of the five (Y) owners have a static badge. `heuristic` uses the
// interactive "Resolve →" button and `data-quality` the interactive typo hint, so
// neither has an entry here. This map intentionally holds presentation (Tailwind +
// glyphs) — that is why it lives in the view layer, not in owner-of.ts.
export const OWNER_BADGES: Partial<Record<Owner, OwnerBadge>> = {
  "by-design": {
    cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    title: "Nuxt UI constraint — expected; no fix needed",
    label: "⊘ by-design",
  },
  "figma-fix": {
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    title: "Fix in the Figma token source — add or align the missing/inconsistent tokens",
    label: "🎨 fix in Figma",
  },
  "manual-dev": {
    cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    title:
      "Resolvable only by hand-coding in your Nuxt app (a custom recipe or a CSS override against Nuxt's default)",
    label: "🔧 hand-code",
  },
};

/** The static badge for an owner, or undefined (heuristic / data-quality / no owner). */
export function ownerBadge(owner: Owner | null): OwnerBadge | undefined {
  return owner ? OWNER_BADGES[owner] : undefined;
}

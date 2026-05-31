// Projects a recipe class string into a single interaction state for the live
// preview. The recipe engine encodes states as pseudo-class prefixes
// (`hover:bg-[#B]`, `disabled:opacity-…`); the preview can only render one
// static state per cell, so we promote the chosen state's prefixed classes to
// base classes and drop every other state.

/** The interaction states the preview can render. `default` = the base look. */
export const PREVIEW_STATES = [
  "default",
  "hover",
  "active",
  "disabled",
  "focus",
] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

// Pseudo-class prefixes the projection understands. `default` is implicit (no
// prefix), so it is intentionally absent here.
const STATE_PREFIXES: ReadonlySet<string> = new Set([
  "hover",
  "active",
  "disabled",
  "focus",
]);

/**
 * Project a class string to a single state's static view by promoting the
 * chosen state's pseudo-class-prefixed classes to base classes and dropping
 * every other state. `default` keeps the unprefixed base and drops all
 * state-prefixed entries.
 *
 * Example for state="hover":
 *   "bg-[#A] hover:bg-[#B] active:bg-[#C]"
 *   → "bg-[#A] bg-[#B]"  (hover promoted last so it wins; active dropped)
 *
 * Non-state prefixes (responsive, dark, …) are left untouched on the base.
 */
export function projectToState(classString: string, state: PreviewState): string {
  const baseClasses: string[] = [];
  const stateClasses: string[] = [];

  for (const cls of classString.split(/\s+/).filter(Boolean)) {
    const m = cls.match(/^([a-z-]+):(.+)$/);
    if (m === null) {
      // No state prefix — part of the base look, always included.
      baseClasses.push(cls);
      continue;
    }
    const prefix = m[1]!;
    const rest = m[2]!;
    if (!STATE_PREFIXES.has(prefix)) {
      // Some other prefix (responsive, dark, …) — leave untouched.
      baseClasses.push(cls);
      continue;
    }
    if (prefix === state) {
      stateClasses.push(rest);
    }
    // Other state prefix → dropped for this projection.
  }

  // Promoted state classes come last so they override base ones via both
  // Tailwind's last-wins rule AND extractArbitrary's later inline-style override.
  return [...baseClasses, ...stateClasses].join(" ");
}

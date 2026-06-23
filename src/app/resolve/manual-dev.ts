import { makeOwnerPredicate } from "./owners.js";

// These kind strings are emitted in src/scanner.ts (custom-without-parts :451,
// disabled-via-opacity :232, resting-shadowed-by-state :252). Keep this set aligned
// with those emit sites on any rename. (Shared rename-drift caveat: see
// makeOwnerPredicate in ./owners.ts.)
//
// `disabled-via-opacity` + `resting-shadowed-by-state` are also in
// CAPABILITY_DEVIATION_KINDS (kit-behaviors.ts) but are NOT by-design: unlike
// capability-gap (Nuxt has no such slot), these are overridable by hand-written CSS —
// i.e. the developer's domain.
export const MANUAL_DEV_KINDS: ReadonlySet<string> = new Set([
  "custom-without-parts",
  "disabled-via-opacity",
  "resting-shadowed-by-state",
]);

/**
 * True when an issue is resolvable only by hand-coding in the developer's Nuxt app —
 * a hand-written custom recipe, or a CSS override that fights Nuxt's default. Advisory:
 * there is no in-app override.
 */
export const isManualDev = makeOwnerPredicate(MANUAL_DEV_KINDS);

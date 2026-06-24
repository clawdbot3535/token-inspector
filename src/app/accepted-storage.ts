/**
 * localStorage persistence for the by-design "Accept" state (accepted issue ids).
 *
 * Mirrors App.vue's expandedPaths load/persist logic, extracted as a pure module so it
 * can be unit-tested without an App mount. Defensive: a missing key, malformed JSON, or
 * a non-array payload all degrade to an empty Set rather than throwing.
 */
export const ACCEPTED_STORAGE_KEY = "inspector.accepted";

/** Accepted by-design issue ids persisted from a previous session (empty if none,
 *  localStorage is unavailable, or the stored value is malformed). */
export function loadAcceptedIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACCEPTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((s): s is string => typeof s === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

/** Persist the accepted issue ids as a JSON array. No-op when localStorage is unavailable. */
export function saveAcceptedIds(set: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACCEPTED_STORAGE_KEY, JSON.stringify([...set]));
}

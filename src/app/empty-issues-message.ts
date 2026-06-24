import { OWNER_FILTERS, type OwnerFilter } from "./resolve/owner-of.js";

/**
 * The empty-state line for the Issues tab, reflecting both active filters:
 * "No [owner-label ][severity ]issues." Each qualifier is dropped when its filter is
 * "all". The owner label is read from OWNER_FILTERS (single source — no second
 * owner→text mapping).
 */
export function emptyIssuesMessage(severity: string, owner: OwnerFilter): string {
  const ownerLabel =
    owner === "all" ? "" : (OWNER_FILTERS.find((f) => f.value === owner)?.label ?? "");
  const severityWord = severity === "all" ? "" : severity;
  const qualifier = [ownerLabel, severityWord].filter(Boolean).join(" ");
  return qualifier ? `No ${qualifier} issues.` : "No issues.";
}

import type { ScanReport } from "@core/token-graph.js";
import { ownerOf } from "./owner-of.js";

/**
 * Issue ids the user has accepted as by-design (acknowledged, not a problem). Only
 * by-design issues can be accepted — a defensive guard, since only they expose the
 * Accept affordance. The single source of truth for "this deviation is accepted".
 */
export function acceptedByDesignIds(
  report: ScanReport,
  accepted: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const issue of report.issues) {
    if (ownerOf(issue) === "by-design" && accepted.has(issue.id)) out.add(issue.id);
  }
  return out;
}

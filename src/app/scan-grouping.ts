import type { ScanIssue } from "@core/token-graph.js";

export interface ComponentGroup {
  /** Component name, or "General" for issues without a componentName. */
  component: string;
  issues: ScanIssue[];
}

const GENERAL = "General";

/**
 * Group scan issues by `componentName`. Named components come first
 * (alphabetical); the `General` bucket (issues with no component) comes last.
 * Empty groups cannot occur (each group is created from at least one issue).
 */
export function groupIssuesByComponent(issues: readonly ScanIssue[]): ComponentGroup[] {
  const map = new Map<string, ScanIssue[]>();
  for (const i of issues) {
    const key = i.componentName ?? GENERAL;
    const arr = map.get(key) ?? [];
    arr.push(i);
    map.set(key, arr);
  }
  const named = [...map.keys()].filter((k) => k !== GENERAL).sort((a, b) => a.localeCompare(b));
  const order = map.has(GENERAL) ? [...named, GENERAL] : named;
  return order.map((component) => ({ component, issues: map.get(component)! }));
}

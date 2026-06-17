// Browser glue for the render-vs-tokens diff: resolve the recipe's base classes to expected
// computed values via a hidden probe, read the rendered element's actual computed values, and
// diff them. Both sides go through getComputedStyle so the comparison is a plain string match.
// Browser-only (getComputedStyle); jsdom returns empty computed values, so the real verdict is /browse.

import { extractArbitrary } from "../extract-arbitrary.js";
import { diffComputed, type RenderDelta } from "../render-diff.js";

export function computeRenderDiff(el: Element, baseClasses: string): RenderDelta[] {
  if (typeof document === "undefined") return [];
  const { style } = extractArbitrary(baseClasses);
  const keys = Object.keys(style);
  if (keys.length === 0) return [];

  const probe = document.createElement("div");
  Object.assign(probe.style, style); // camelCase CSSProperties → CSSStyleDeclaration
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const probeCs = getComputedStyle(probe) as unknown as Record<string, string>;
  const actualCs = getComputedStyle(el) as unknown as Record<string, string>;
  const expected: Record<string, string> = {};
  const actual: Record<string, string> = {};
  for (const k of keys) {
    expected[k] = String(probeCs[k] ?? "");
    actual[k] = String(actualCs[k] ?? "");
  }
  probe.remove();
  return diffComputed(expected, actual);
}

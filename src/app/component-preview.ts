// Builds a {`--token-id`: cssValue} record for live HTML previews of
// component-layer tokens. The record is meant to be passed as an inline
// `style` to a wrapper element so the preview consumes the same CSS
// custom property names that the generated tokens.css emits.

import { resolveCss, type Variant } from "./resolve.js";
import type { TokenGraph } from "@core/token-graph.js";

export type CssVarMap = Record<string, string>;

/**
 * Resolves every component-layer token whose id starts with `${prefix}-`
 * (or equals `prefix`) to its terminal CSS value for the given variant,
 * skipping any tokens that fail to resolve. Returns a record keyed by
 * `--<token-id>` ready to spread into a Vue `:style` binding.
 */
export function resolveComponentTokens(
  graph: TokenGraph,
  prefix: string,
  variant: Variant,
): CssVarMap {
  const out: CssVarMap = {};
  const pref = `${prefix}-`;
  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    if (node.id !== prefix && !node.id.startsWith(pref)) continue;
    const value = resolveCss(graph, node.id, variant);
    if (value !== undefined) out[`--${node.id}`] = value;
  }
  return out;
}

/**
 * Returns the subset of token ids in `available` that are mentioned by
 * the given variant's token group. Used to drive the sidebar highlight
 * when hovering a variant in the live preview.
 */
export function tokensForGroup(
  available: ReadonlySet<string>,
  group: readonly string[],
): Set<string> {
  const out = new Set<string>();
  for (const id of group) if (available.has(id)) out.add(id);
  return out;
}

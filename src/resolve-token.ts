// Pure alias resolver. Walks alias chains (via TokenNode.alias) and
// var(--target) references (via cssValue) to find the primitive value
// behind any token. Cycle-safe via visited-set guard.

import type { TokenGraph, TokenNode, Theme } from "./token-graph.js";

export type ResolveResult =
  | { value: string; path: string[] }
  | { error: "cycle" | "unresolved"; path: string[] };

export function resolveTokenToValue(
  tokenId: string,
  graph: TokenGraph,
  mode?: Theme,
): ResolveResult {
  const visited = new Set<string>();
  const path: string[] = [];
  let currentId: string | null = tokenId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      path.push(currentId);
      return { error: "cycle", path };
    }
    visited.add(currentId);
    path.push(currentId);

    const node: TokenNode | undefined = graph.nodes.get(currentId);
    if (!node) {
      // Starting id doesn't exist: return empty path.
      // Chain ended at a missing target: return path up to (not including) the missing id.
      if (path.length === 1) return { error: "unresolved", path: [] };
      return { error: "unresolved", path: path.slice(0, -1) };
    }

    // 1. Check the resolved alias field for the requested mode (or base).
    const aliasForMode =
      (mode !== undefined ? node.alias[mode] : undefined) ??
      node.alias.base ??
      node.alias.light ??
      node.alias.dark;
    if (aliasForMode !== undefined) {
      currentId = aliasForMode.to;
      continue;
    }

    // 2. Check cssValue for the requested mode.
    const cssValue =
      (mode !== undefined ? node.cssValue[mode] : undefined) ??
      node.cssValue.base ??
      node.cssValue.light ??
      node.cssValue.dark;
    if (cssValue === undefined) {
      return { error: "unresolved", path };
    }

    // 3. Detect var(--target) references and walk through them.
    // Only pure var() references are followed — composite values like
    // "1px solid var(--x)" are intentionally NOT followed.
    const varMatch = cssValue.match(/^var\(\s*--([a-z0-9_-]+)\s*(?:,[^)]*)?\)$/i);
    if (varMatch !== null && varMatch[1] !== undefined) {
      currentId = varMatch[1];
      continue;
    }

    // 4. Concrete value reached.
    return { value: cssValue, path };
  }

  return { error: "unresolved", path };
}

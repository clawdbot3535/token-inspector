// Alias-chain resolution helpers used by previews.
// Walks node.alias[variant] until a terminal cssValue is reached.
// Cycle-safe (returns undefined on cycle).

import type { Theme, TokenGraph, TokenId, TokenNode } from "@core/token-graph.js";

export type Variant = "base" | Theme;

function pickVariant(
  node: TokenNode,
  variant: Variant,
): { alias: TokenNode["alias"][Variant]; cssValue: string | undefined } {
  // Prefer the requested variant; fall back to base if missing on theme
  // variants (e.g. inspecting a primitive while theme=light is selected).
  const alias = node.alias[variant] ?? node.alias.base;
  const cssValue =
    node.cssValue[variant] ??
    node.cssValue.base ??
    node.cssValue.light ??
    node.cssValue.dark;
  return { alias, cssValue };
}

/** Walks the alias chain and returns the terminal CSS value that would actually paint. */
export function resolveCss(
  graph: TokenGraph,
  id: TokenId,
  variant: Variant,
): string | undefined {
  const seen = new Set<TokenId>();
  let current: TokenId | undefined = id;
  while (current) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const node = graph.nodes.get(current);
    if (!node) return undefined;
    const picked = pickVariant(node, variant);
    if (!picked.alias) return picked.cssValue;
    current = picked.alias.to;
  }
  return undefined;
}

/** Returns every node visited while resolving — for breadcrumb display. */
export function aliasChain(
  graph: TokenGraph,
  id: TokenId,
  variant: Variant,
): TokenNode[] {
  const seen = new Set<TokenId>();
  const chain: TokenNode[] = [];
  let current: TokenId | undefined = id;
  while (current) {
    if (seen.has(current)) return chain;
    seen.add(current);
    const node = graph.nodes.get(current);
    if (!node) return chain;
    chain.push(node);
    const picked = pickVariant(node, variant);
    if (!picked.alias) return chain;
    current = picked.alias.to;
  }
  return chain;
}

/** Convenience: nodes that alias to the given target id. */
export function usedBy(graph: TokenGraph, id: TokenId): TokenNode[] {
  const ids = graph.reverseAliases.get(id) ?? [];
  return ids
    .map((tid) => graph.nodes.get(tid))
    .filter((n): n is TokenNode => n !== undefined);
}

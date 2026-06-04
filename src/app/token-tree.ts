// Build a hierarchical tree from flat token nodes using each node's
// path (the original Figma slash-segmented path preserved on the graph).
//
// Example:
//   nodes: button-solid-bg, button-solid-bg-hover, button-outline-bg, badge-accent-bg
//   tree:
//     button/
//       solid/
//         bg
//         bg-hover
//       outline/
//         bg
//     badge/
//       accent/
//         bg
//
// Pure function — no DOM, no Vue. Consumed by ComponentTree.vue and
// covered by token-tree.test.ts.

import type { TokenNode, GraphLayer } from "@core/token-graph.js";

export interface TreeLeaf {
  kind: "leaf";
  /** Token id (same as TokenNode.id). */
  id: string;
  /** Display label — last path segment. */
  label: string;
  /** Underlying node for callers that need layer / type / classification. */
  node: TokenNode;
}

export interface TreeGroup {
  kind: "group";
  /** Display label — the path segment this group represents. */
  label: string;
  /** Fully-qualified path key, stable across rebuilds — used for collapse state. */
  path: string;
  /** Number of leaf descendants (for badges / collapsed-state hints). */
  count: number;
  children: TreeNode[];
}

export type TreeNode = TreeGroup | TreeLeaf;

export interface LayerSection {
  /** The graph layer this section represents. */
  layer: GraphLayer;
  /** Display label, e.g. "Components". */
  label: string;
  /** Path-tree for this layer's nodes (via buildTokenTree). */
  tree: TreeNode[];
  /** Leaf count in this section. */
  count: number;
}

/**
 * Build a tree from a sorted list of nodes. Leaves appear before
 * sibling groups so the visual order is "atoms first, namespaces below"
 * within each group.
 *
 * If a node's path is a single segment, it lives directly at the root
 * as a leaf (no enclosing group).
 */
export function buildTokenTree(nodes: readonly TokenNode[]): TreeNode[] {
  // Intermediate mutable shape so we can incrementally add children.
  interface MutableGroup {
    label: string;
    path: string;
    children: Map<string, MutableGroup>;
    leaves: TreeLeaf[];
  }

  const root: MutableGroup = {
    label: "",
    path: "",
    children: new Map(),
    leaves: [],
  };

  for (const node of nodes) {
    const segments = node.path.length > 0 ? node.path : [node.id];
    if (segments.length === 1) {
      root.leaves.push({
        kind: "leaf",
        id: node.id,
        label: segments[0]!,
        node,
      });
      continue;
    }

    // Walk / create the intermediate groups.
    let cursor: MutableGroup = root;
    for (let depth = 0; depth < segments.length - 1; depth++) {
      const seg = segments[depth]!;
      let next = cursor.children.get(seg);
      if (!next) {
        next = {
          label: seg,
          path: cursor.path === "" ? seg : `${cursor.path}/${seg}`,
          children: new Map(),
          leaves: [],
        };
        cursor.children.set(seg, next);
      }
      cursor = next;
    }

    cursor.leaves.push({
      kind: "leaf",
      id: node.id,
      label: segments[segments.length - 1]!,
      node,
    });
  }

  function freeze(group: MutableGroup): TreeNode[] {
    // Sort groups alphabetically by label; leaves come first inside a
    // group so atoms sit above the nested groups (less jumpy when
    // expanding/collapsing).
    const sortedLeaves = [...group.leaves].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const sortedChildren = [...group.children.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map<TreeNode>((child) => {
        const frozenChildren = freeze(child);
        return {
          kind: "group",
          label: child.label,
          path: child.path,
          count: countLeaves(frozenChildren),
          children: frozenChildren,
        };
      });
    return [...sortedLeaves, ...sortedChildren];
  }

  return freeze(root);
}

const LAYER_ORDER: ReadonlyArray<{ layer: GraphLayer; label: string }> = [
  { layer: "component", label: "Components" },
  { layer: "semantic", label: "Semantic" },
  { layer: "primitive", label: "Primitives" },
];

/**
 * Partition nodes by graph layer and build a path-tree per layer.
 * Sections come in fixed order [component, semantic, primitive];
 * a layer with no nodes is omitted.
 */
export function buildLayeredTree(nodes: readonly TokenNode[]): LayerSection[] {
  const sections: LayerSection[] = [];
  for (const { layer, label } of LAYER_ORDER) {
    const partition = nodes.filter((n) => n.layer === layer);
    if (partition.length === 0) continue;
    sections.push({ layer, label, tree: buildTokenTree(partition), count: partition.length });
  }
  return sections;
}

function countLeaves(nodes: readonly TreeNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.kind === "leaf") total += 1;
    else total += n.count;
  }
  return total;
}

/**
 * Walk the tree and return every leaf id. Used to (un)collapse-all
 * shortcuts and to compute "do any descendants match the active
 * selection" badge state.
 */
export function leafIds(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  function walk(list: readonly TreeNode[]): void {
    for (const n of list) {
      if (n.kind === "leaf") out.push(n.id);
      else walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

/**
 * Return the group paths that contain (transitively) the given leaf id.
 * Used to auto-expand groups when a node is selected externally.
 */
export function ancestorPaths(
  nodes: readonly TreeNode[],
  leafId: string,
): string[] {
  const out: string[] = [];
  function walk(list: readonly TreeNode[]): boolean {
    for (const n of list) {
      if (n.kind === "leaf") {
        if (n.id === leafId) return true;
        continue;
      }
      if (walk(n.children)) {
        out.push(n.path);
        return true;
      }
    }
    return false;
  }
  walk(nodes);
  return out;
}

import { describe, it, expect } from "vitest";
import { buildTokenTree, leafIds, ancestorPaths } from "./token-tree.js";
import type { TokenNode, GraphLayer, TokenType, SourceLayer } from "@core/token-graph.js";

function makeNode(opts: {
  id: string;
  path?: readonly string[];
  layer?: GraphLayer;
  type?: TokenType;
  source?: SourceLayer;
}): TokenNode {
  const path = opts.path ?? opts.id.split("-");
  return {
    id: opts.id,
    path,
    type: opts.type ?? "color",
    layer: opts.layer ?? "component",
    themes: [],
    cssValue: {},
    rawValue: {},
    alias: {},
    source: opts.source ?? "global",
  };
}

describe("buildTokenTree", () => {
  it("groups two-segment paths by their first segment", () => {
    const tree = buildTokenTree([
      makeNode({ id: "button-bg", path: ["button", "bg"] }),
      makeNode({ id: "button-text", path: ["button", "text"] }),
      makeNode({ id: "badge-bg", path: ["badge", "bg"] }),
    ]);
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ kind: "group", label: "badge", count: 1 });
    expect(tree[1]).toMatchObject({ kind: "group", label: "button", count: 2 });
  });

  it("builds three-level hierarchy for button-solid-bg etc.", () => {
    const tree = buildTokenTree([
      makeNode({ id: "button-solid-bg", path: ["button", "solid", "bg"] }),
      makeNode({ id: "button-solid-text", path: ["button", "solid", "text"] }),
      makeNode({ id: "button-outline-bg", path: ["button", "outline", "bg"] }),
    ]);
    expect(tree).toHaveLength(1);
    const buttonGroup = tree[0];
    expect(buttonGroup.kind).toBe("group");
    if (buttonGroup.kind !== "group") throw new Error("expected group");
    expect(buttonGroup.count).toBe(3);
    // children: outline (1 leaf) then solid (2 leaves) — alphabetical
    expect(buttonGroup.children).toHaveLength(2);
    expect(buttonGroup.children[0]).toMatchObject({ kind: "group", label: "outline", count: 1 });
    expect(buttonGroup.children[1]).toMatchObject({ kind: "group", label: "solid", count: 2 });
  });

  it("places leaves before sibling groups within a group", () => {
    const tree = buildTokenTree([
      // button-radius is a 2-seg leaf under "button"
      makeNode({ id: "button-radius", path: ["button", "radius"] }),
      // button-solid-bg is a 3-seg leaf, creates a "solid" subgroup
      makeNode({ id: "button-solid-bg", path: ["button", "solid", "bg"] }),
    ]);
    const buttonGroup = tree[0];
    if (buttonGroup.kind !== "group") throw new Error("expected group");
    expect(buttonGroup.children[0]).toMatchObject({ kind: "leaf", id: "button-radius" });
    expect(buttonGroup.children[1]).toMatchObject({ kind: "group", label: "solid" });
  });

  it("treats single-segment paths as root-level leaves", () => {
    const tree = buildTokenTree([
      makeNode({ id: "transparent", path: ["transparent"] }),
    ]);
    expect(tree[0]).toMatchObject({ kind: "leaf", id: "transparent" });
  });

  it("assigns stable path keys including ancestor chain", () => {
    const tree = buildTokenTree([
      makeNode({ id: "button-solid-bg", path: ["button", "solid", "bg"] }),
    ]);
    const button = tree[0];
    if (button.kind !== "group") throw new Error("expected group");
    expect(button.path).toBe("button");
    const solid = button.children[0];
    if (solid?.kind !== "group") throw new Error("expected group");
    expect(solid.path).toBe("button/solid");
  });
});

describe("leafIds", () => {
  it("walks the tree and collects every leaf id", () => {
    const tree = buildTokenTree([
      makeNode({ id: "button-solid-bg", path: ["button", "solid", "bg"] }),
      makeNode({ id: "button-outline-bg", path: ["button", "outline", "bg"] }),
      makeNode({ id: "badge-bg", path: ["badge", "bg"] }),
    ]);
    expect(leafIds(tree).sort()).toEqual(
      ["badge-bg", "button-outline-bg", "button-solid-bg"],
    );
  });
});

describe("ancestorPaths", () => {
  it("returns the chain of group paths above a leaf", () => {
    const tree = buildTokenTree([
      makeNode({ id: "button-solid-bg", path: ["button", "solid", "bg"] }),
    ]);
    expect(ancestorPaths(tree, "button-solid-bg")).toEqual([
      "button/solid",
      "button",
    ]);
  });

  it("returns an empty array when the leaf isn't in the tree", () => {
    const tree = buildTokenTree([
      makeNode({ id: "button-solid-bg", path: ["button", "solid", "bg"] }),
    ]);
    expect(ancestorPaths(tree, "doesn-t-exist")).toEqual([]);
  });
});

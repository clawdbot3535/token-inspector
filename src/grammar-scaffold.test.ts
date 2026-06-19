// Integration test: feed scaffold() output as a SourceFile to buildGraph,
// then assert every component-layer node maps via getSlotMapping.
// This is the truest cross-check: the real flatten+map pipeline is exercised.

import { describe, it, expect } from "vitest";
import { buildGraph } from "./build-graph.js";
import type { SourceFile } from "./token-graph.js";
import { scaffold, loadProfile, getSlotMapping, propDrivenStateFor } from "@tg/grammar";
import nuxtUi from "../packages/grammar/profiles/nuxt-ui.json";

const profile = loadProfile(nuxtUi);

describe("grammar-scaffold integration: buildGraph + getSlotMapping", () => {
  for (const component of Object.keys(profile.components)) {
    it(`${component}: all component-layer nodes map via getSlotMapping`, () => {
      const dtcgTree = scaffold(profile, component);

      // Wrap as a SourceFile in the "global" layer so buildGraph classifies
      // these tokens as component-layer (tokens whose first path segment is a
      // known component name get layer="component" by the scanner; buildGraph
      // itself assigns layer from source name — use "global" which the scanner
      // treats as component-layer for tokens starting with a component name).
      const sourceFile: SourceFile = {
        name: "global",
        data: dtcgTree as Record<string, unknown>,
      };

      const graph = buildGraph([sourceFile]);

      // Collect all nodes (any layer) — scaffold emits only component tokens
      const nodes = [...graph.nodes.values()];
      expect(nodes.length).toBeGreaterThan(0);

      // Prop-driven state tokens (e.g. nav active) are intentionally null-mapped —
      // the grammar drops them because Nuxt applies that state via a prop/variant, not :active.
      const unmapped = nodes.filter((node) => {
        if (getSlotMapping(node.id) !== null) return false;
        const segs = node.id.split("-");
        const comp = segs[0] ?? "";
        const state = segs[segs.length - 1] ?? "";
        return propDrivenStateFor(comp, state) === null; // only flag truly unmapped tokens
      });
      expect(
        unmapped.map((n) => n.id),
        `${component}: unmapped IDs in buildGraph output`,
      ).toEqual([]);
    });
  }
});

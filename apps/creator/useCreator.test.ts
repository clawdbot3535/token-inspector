// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useCreator } from "./useCreator.js";
import type { SourceFile } from "@core/token-graph.js";

// Minimal colour token source so previewGraph can resolve the alias
// "color.bg.muted" that scaffold emits for switch-bg under alias-semantic.
const colorSource: SourceFile = {
  name: "color",
  data: {
    color: {
      bg: {
        muted: { $type: "color", $value: "#F9FAFB" },
        disabled: { $type: "color", $value: "#E5E7EB" },
      },
      border: {
        default: { $type: "color", $value: "#D1D5DB" },
        focus: { $type: "color", $value: "#6366F1" },
      },
      text: {
        default: { $type: "color", $value: "#111827" },
      },
      action: {
        bg: { $type: "color", $value: "#6366F1" },
      },
    },
  },
};

describe("useCreator", () => {
  it("initialises with default selected component = button", () => {
    const { selected } = useCreator();
    expect(selected.component).toBe("button");
  });

  it("scaffoldTree has tokens for the selected component", () => {
    const { scaffoldTree } = useCreator();
    const keys = Object.keys(scaffoldTree.value);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("unmappedCount is 0 for default selection", () => {
    const { unmappedCount } = useCreator();
    expect(unmappedCount.value).toBe(0);
  });

  it("tokenCount is positive", () => {
    const { tokenCount } = useCreator();
    expect(tokenCount.value).toBeGreaterThan(0);
  });

  it("previewGraph is non-null even without loaded sources", () => {
    const { previewGraph } = useCreator();
    expect(previewGraph.value).not.toBeNull();
  });

  describe("with loaded sources + switch selection", () => {
    it("previewGraph contains a switch-bg node after switching to switch component", () => {
      const { loadedSources, selected, previewGraph } = useCreator();
      loadedSources.value = [colorSource];
      selected.component = "switch";

      const graph = previewGraph.value;
      expect(graph).not.toBeNull();
      const node = graph!.nodes.get("switch-bg");
      expect(node).toBeDefined();
    });

    it("unmappedCount remains 0 for switch with alias-semantic", () => {
      const { loadedSources, selected, unmappedCount } = useCreator();
      loadedSources.value = [colorSource];
      selected.component = "switch";
      selected.valueStrategy = "alias-semantic";

      expect(unmappedCount.value).toBe(0);
    });

    it("scaffoldTree switch-bg emits an alias value", () => {
      const { loadedSources, selected, scaffoldTree } = useCreator();
      loadedSources.value = [colorSource];
      selected.component = "switch";
      selected.valueStrategy = "alias-semantic";

      const json = JSON.stringify(scaffoldTree.value);
      expect(json).toContain("{color.bg.muted}");
    });
  });

  describe("download", () => {
    it("calls downloadBlob with <component>.tokens.json filename", () => {
      // Mock URL.createObjectURL + revokeObjectURL (jsdom doesn't implement them)
      URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
      URL.revokeObjectURL = vi.fn();
      // Spy on anchor click
      const clickSpy = vi.fn();
      vi.spyOn(document, "createElement").mockImplementationOnce((tag) => {
        const el = document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLAnchorElement;
        el.click = clickSpy;
        return el;
      });

      const { selected, download } = useCreator();
      selected.component = "switch";
      download();

      expect(clickSpy).toHaveBeenCalled();
    });
  });
});

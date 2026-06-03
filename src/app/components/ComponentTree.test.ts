// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ComponentTree from "./ComponentTree.vue";
import type { TreeNode } from "../token-tree.js";

// Two top-level component groups; `button` will be marked as preview-capable.
function groupNodes(): TreeNode[] {
  return [
    { kind: "group", label: "button", path: "button", count: 5, children: [] },
    { kind: "group", label: "card", path: "card", count: 3, children: [] },
  ];
}

const baseProps = {
  selectedId: null,
  highlightedIds: new Set<string>(),
  expandedPaths: new Set<string>(),
  kindOf: () => null,
};

describe("ComponentTree — Live preview pill", () => {
  it("renders a Live pill only for top-level components in previewComponents", () => {
    const wrapper = mount(ComponentTree, {
      props: { nodes: groupNodes(), previewComponents: new Set(["button"]), ...baseProps },
    });

    const pills = wrapper.findAll("span").filter((s) => s.text() === "Live");
    expect(pills).toHaveLength(1);

    const buttonRow = wrapper.findAll("button").find((b) => b.text().includes("button"));
    expect(buttonRow!.text()).toContain("Live");
    const cardRow = wrapper.findAll("button").find((b) => b.text().includes("card"));
    expect(cardRow!.text()).not.toContain("Live");
  });

  it("renders no pill when previewComponents is omitted", () => {
    const wrapper = mount(ComponentTree, {
      props: { nodes: groupNodes(), ...baseProps },
    });
    expect(wrapper.findAll("span").filter((s) => s.text() === "Live")).toHaveLength(0);
  });
});

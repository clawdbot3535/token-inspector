import { describe, it, expect } from "vitest";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";

const STANDARD = ["card", "kbd", "badge", "progress", "switch", "checkbox", "radio", "input", "textarea"];

describe("REAL_SLOTTED_REGISTRY", () => {
  it("covers exactly the 9 standard slotted components", () => {
    expect(Object.keys(REAL_SLOTTED_REGISTRY).sort()).toEqual([...STANDARD].sort());
  });

  // `tag` is documentation-only — rendering uses literal tags in LiveRealSlotted.vue.
  // This asserts the registry stays internally consistent with Nuxt UI naming, not render correctness.
  it("each entry has a U-prefixed tag and a props object", () => {
    for (const [name, entry] of Object.entries(REAL_SLOTTED_REGISTRY)) {
      expect(entry.tag, name).toMatch(/^U[A-Z]/);
      expect(typeof entry.props, name).toBe("object");
    }
  });

  it("excludes the custom components chip and sidebar", () => {
    expect(REAL_SLOTTED_REGISTRY).not.toHaveProperty("chip");
    expect(REAL_SLOTTED_REGISTRY).not.toHaveProperty("sidebar");
  });
});

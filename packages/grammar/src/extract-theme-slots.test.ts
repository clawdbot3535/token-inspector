import { describe, it, expect } from "vitest";
import { extractSlotKeys } from "./extract-theme-slots.js";

describe("extractSlotKeys", () => {
  it("extracts slot keys from a function-form theme (export default (o) => ({ slots }))", () => {
    const src = `
      export default (options) => ({
        slots: { root: 'a', title: 'b', description: 'c', progress: 'd' },
        variants: { color: { primary: { root: 'x', icon: 'y' } } },
        defaultVariants: { color: 'primary' },
      });`;
    expect(extractSlotKeys(src)).toEqual(["root", "title", "description", "progress"]);
  });

  it("extracts slot keys from an object-form theme (export default { slots })", () => {
    const src = `export default { slots: { root: 'a', image: 'b' }, variants: {} };`;
    expect(extractSlotKeys(src)).toEqual(["root", "image"]);
  });

  it("returns [] for a slotless theme (only a base string, no slots block)", () => {
    const src = `export default { base: 'inline-flex' };`;
    expect(extractSlotKeys(src)).toEqual([]);
  });

  it("does not pick up variant sub-objects that contain slot-named keys", () => {
    const src = `export default (o) => ({ slots: { root: 'a' }, variants: { color: { primary: { root: 'x', icon: 'y' } } } });`;
    expect(extractSlotKeys(src)).toEqual(["root"]);
  });
});

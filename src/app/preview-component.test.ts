import { describe, it, expect } from "vitest";
import { previewComponentForGroup, groupHasPreview } from "./preview-component.js";

const SET = new Set(["button", "card", "accordion", "nav", "modal"]);

describe("previewComponentForGroup", () => {
  it("returns a directly-supported label unchanged", () => {
    expect(previewComponentForGroup("button", SET)).toBe("button");
    expect(previewComponentForGroup("card", SET)).toBe("card");
  });
  it("strips a trailing -item when the base is preview-supported", () => {
    expect(previewComponentForGroup("accordion-item", SET)).toBe("accordion");
    expect(previewComponentForGroup("nav-item", SET)).toBe("nav");
  });
  it("leaves non-item / non-supported labels unchanged", () => {
    expect(previewComponentForGroup("button-overlay-dark", SET)).toBe("button-overlay-dark");
    expect(previewComponentForGroup("nav-item-overlay-dark", SET)).toBe("nav-item-overlay-dark");
    expect(previewComponentForGroup("container", SET)).toBe("container");
  });
});

describe("groupHasPreview", () => {
  it("is true for direct and -item-aliased preview components", () => {
    expect(groupHasPreview("button", SET)).toBe(true);
    expect(groupHasPreview("accordion-item", SET)).toBe(true);
    expect(groupHasPreview("nav-item", SET)).toBe(true);
  });
  it("is false for non-preview groups", () => {
    expect(groupHasPreview("container", SET)).toBe(false);
    expect(groupHasPreview("button-overlay-dark", SET)).toBe(false);
    expect(groupHasPreview("nav-item-overlay-dark", SET)).toBe(false);
  });
});

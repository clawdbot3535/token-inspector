import { describe, it, expect } from "vitest";
import { INCLUDE_LIST, FIGMA_THEME_FILE, SLOT_OVERLAY } from "./nuxt-vocab-curated.js";

describe("nuxt-vocab-curated", () => {
  it("the include-list covers today's 16 components and adds toast", () => {
    for (const c of ["button","badge","input","textarea","card","modal","kbd","chip","checkbox","radio","switch","nav","dropdown","table","progress","accordion","toast"]) {
      expect(INCLUDE_LIST, c).toContain(c);
    }
  });
  it("excludes Pro / app-shell / content themes", () => {
    for (const c of ["dashboard-sidebar","chat-message","blog-post","prose","auth-form","header","footer"]) {
      expect(INCLUDE_LIST).not.toContain(c);
    }
  });
  it("maps the renamed components to their Nuxt theme filenames", () => {
    expect(FIGMA_THEME_FILE.get("nav")).toBe("navigation-menu");
    expect(FIGMA_THEME_FILE.get("dropdown")).toBe("dropdown-menu");
    expect(FIGMA_THEME_FILE.get("radio")).toBe("radio-group");
    expect(FIGMA_THEME_FILE.get("button")).toBeUndefined(); // identity → no entry
  });
  it("keeps chip as a deliberate {root, base} overlay", () => {
    expect([...SLOT_OVERLAY.get("chip")!].sort()).toEqual(["base","root"]);
  });
});

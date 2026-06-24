import { describe, it, expect } from "vitest";
import { ownerBadge, OWNER_BADGES } from "./owner-badges.js";

describe("ownerBadge", () => {
  it("returns the badge for each of the three static-badge owners", () => {
    expect(ownerBadge("by-design")?.label).toBe("⊘ by-design");
    expect(ownerBadge("by-design")?.cls).toContain("bg-zinc-100");
    expect(ownerBadge("figma-fix")?.label).toBe("🎨 fix in Figma");
    expect(ownerBadge("figma-fix")?.cls).toContain("bg-violet-100");
    expect(ownerBadge("manual-dev")?.label).toBe("🔧 hand-code");
    expect(ownerBadge("manual-dev")?.cls).toContain("bg-teal-100");
  });

  it("returns undefined for owners without a static badge and for null", () => {
    expect(ownerBadge("heuristic")).toBeUndefined();
    expect(ownerBadge("data-quality")).toBeUndefined();
    expect(ownerBadge(null)).toBeUndefined();
  });

  it("every registry badge has a non-empty title", () => {
    for (const b of Object.values(OWNER_BADGES)) {
      expect(b.title.length).toBeGreaterThan(0);
    }
  });
});

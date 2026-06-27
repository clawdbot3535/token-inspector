import { describe, it, expect } from "vitest";
import { GENERATED_NUXT_SLOTS, GENERATED_COMPONENTS } from "./nuxt-slots.generated.js";
import { INCLUDE_LIST } from "./nuxt-vocab-curated.js";

describe("nuxt-slots.generated", () => {
  it("covers every include-list component", () => {
    for (const c of INCLUDE_LIST) expect(GENERATED_COMPONENTS, c).toContain(c);
  });

  it("toast has the expected Nuxt UI slots (re-run `npm run gen:vocab` if this drifts)", () => {
    expect([...GENERATED_NUXT_SLOTS.get("toast")!].sort()).toEqual(
      ["actions", "avatar", "avatarSize", "close", "description", "icon", "progress", "root", "title", "wrapper"].sort(),
    );
  });
});

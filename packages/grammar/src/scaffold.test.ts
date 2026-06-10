import { describe, expect, it } from "vitest";
import nuxtUi from "../profiles/nuxt-ui.json";
import { loadProfile } from "./profile.js";
import { scaffold } from "./scaffold.js";
import { flattenDtcg } from "./dtcg.js";
import { getSlotMapping } from "./slot-mapping.js";

const profile = loadProfile(nuxtUi);

describe("scaffold: nuxt-ui profile — 0 unmapped tokens per component", () => {
  for (const component of Object.keys(profile.components)) {
    it(`${component}: count > 0 and 0 unmapped`, () => {
      const tree = scaffold(profile, component);
      const ids = flattenDtcg(tree);
      expect(ids.length).toBeGreaterThan(0);
      const unmapped = ids.filter((id) => getSlotMapping(id) === null);
      expect(
        unmapped,
        `${component}: unmapped tokens: ${unmapped.join(", ")}`,
      ).toEqual([]);
    });
  }
});

describe("scaffold: output is a serializable DTCG file (no cycles / leaf-branch collisions)", () => {
  for (const component of Object.keys(profile.components)) {
    it(`${component}: JSON-serializes and round-trips to the same token IDs`, () => {
      const tree = scaffold(profile, component);
      const json = JSON.stringify(tree); // throws on a circular structure
      const ids = flattenDtcg(tree);
      const reparsedIds = flattenDtcg(JSON.parse(json));
      expect(reparsedIds.sort()).toEqual([...ids].sort());
    });
  }
});

describe("scaffold: loadProfile validates structure", () => {
  it("throws on missing name", () => {
    expect(() => loadProfile({ components: {} })).toThrow("name");
  });

  it("throws on non-object components", () => {
    expect(() => loadProfile({ name: "test", components: [] })).toThrow("components");
  });

  it("throws if utility spec has no utility field", () => {
    expect(() =>
      loadProfile({
        name: "test",
        components: { button: { parts: [], states: [], sizes: [], variants: [], utilities: [{}] } },
      }),
    ).toThrow("utility");
  });
});

describe("scaffold: unknown component throws", () => {
  it("throws for unknown component name", () => {
    expect(() => scaffold(profile, "nonexistent")).toThrow("nonexistent");
  });
});

describe("flattenDtcg: basic invariants", () => {
  it("flattens a simple tree to lowercase dash-joined IDs", () => {
    const tree = {
      button: {
        bg: { $type: "color" as const, $value: "#000000" },
      },
    };
    const ids = flattenDtcg(tree);
    expect(ids).toEqual(["button-bg"]);
  });

  it("handles nested sub-element tokens", () => {
    const tree = {
      switch: {
        thumb: {
          size: { $type: "number" as const, $value: 0 },
        },
        bg: { $type: "color" as const, $value: "#000000" },
      },
    };
    const ids = flattenDtcg(tree);
    expect(ids).toContain("switch-thumb-size");
    expect(ids).toContain("switch-bg");
  });

  it("applies name fixes (typo: font-weigth → font-weight)", () => {
    const tree = {
      "font-weigth": {
        base: { $type: "number" as const, $value: 0 },
      },
    };
    const ids = flattenDtcg(tree);
    expect(ids).toEqual(["font-weight-base"]);
  });
});

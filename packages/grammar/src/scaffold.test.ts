import { describe, expect, it } from "vitest";
import nuxtUi from "../profiles/nuxt-ui.json";
import { loadProfile } from "./profile.js";
import { scaffold } from "./scaffold.js";
import { flattenDtcg } from "./dtcg.js";
import { getSlotMapping } from "./slot-mapping.js";
import { propDrivenStateFor } from "./component-vocab.js";

const profile = loadProfile(nuxtUi);

describe("scaffold: nuxt-ui profile — 0 unmapped tokens per component", () => {
  for (const component of Object.keys(profile.components)) {
    it(`${component}: count > 0 and 0 unmapped`, () => {
      const tree = scaffold(profile, component);
      const ids = flattenDtcg(tree);
      expect(ids.length).toBeGreaterThan(0);
      // Prop-driven state tokens (e.g. nav active) are intentionally null-mapped —
      // the grammar drops them because Nuxt applies that state via a prop/variant, not :active.
      const unmapped = ids.filter((id) => {
        if (getSlotMapping(id) !== null) return false;
        const segs = id.split("-");
        const comp = segs[0] ?? "";
        const state = segs[segs.length - 1] ?? "";
        return propDrivenStateFor(comp, state) === null; // only flag truly unmapped tokens
      });
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

describe("scaffold: alias-semantic valueStrategy", () => {
  it("emits DTCG alias when resolver returns a name", () => {
    const tree = scaffold(profile, "button", {
      valueStrategy: "alias-semantic",
      aliasResolver: () => "color.bg.muted",
    });
    const json = JSON.parse(JSON.stringify(tree)) as Record<string, unknown>;
    const button = json["button"] as Record<string, { $value: unknown }>;
    // Every leaf $value should be an alias string
    for (const leaf of Object.values(button)) {
      expect(typeof leaf.$value).toBe("string");
      expect(leaf.$value).toMatch(/^\{.+\}$/);
    }
  });

  it("emits the exact alias string from the resolver", () => {
    const tree = scaffold(profile, "button", {
      valueStrategy: "alias-semantic",
      aliasResolver: (ctx) => (ctx.utility === "bg" ? "color.bg.muted" : null),
    });
    const json = JSON.parse(JSON.stringify(tree)) as Record<string, unknown>;
    const button = json["button"] as Record<string, { $value: unknown }>;
    // bg base token should be aliased
    expect(button["bg"]?.$value).toBe("{color.bg.muted}");
  });

  it("falls back to raw placeholder when resolver returns null", () => {
    const tree = scaffold(profile, "button", {
      valueStrategy: "alias-semantic",
      aliasResolver: () => null,
    });
    const json = JSON.parse(JSON.stringify(tree)) as Record<string, unknown>;
    const button = json["button"] as Record<string, { $value: unknown }>;
    // All placeholders — color utilities get #000000
    for (const leaf of Object.values(button)) {
      expect([0, "#000000"]).toContain(leaf.$value);
    }
  });

  it("falls back to raw placeholder when no resolver provided", () => {
    const tree = scaffold(profile, "button", {
      valueStrategy: "alias-semantic",
    });
    const json = JSON.parse(JSON.stringify(tree)) as Record<string, unknown>;
    const button = json["button"] as Record<string, { $value: unknown }>;
    for (const leaf of Object.values(button)) {
      expect([0, "#000000"]).toContain(leaf.$value);
    }
  });

  it("aliasResolver receives correct ctx fields", () => {
    const contexts: import("./scaffold.js").AliasCtx[] = [];
    scaffold(profile, "button", {
      valueStrategy: "alias-semantic",
      aliasResolver: (ctx) => { contexts.push(ctx); return null; },
    });
    expect(contexts.length).toBeGreaterThan(0);
    for (const ctx of contexts) {
      expect(ctx.component).toBe("button");
      expect(typeof ctx.utility).toBe("string");
      // state is string or null
      expect(ctx.state === null || typeof ctx.state === "string").toBe(true);
    }
  });

  it("default (no valueStrategy) path is byte-identical to placeholder", () => {
    const treeDefault = scaffold(profile, "button");
    const treePlaceholder = scaffold(profile, "button", { valueStrategy: "placeholder" });
    expect(JSON.stringify(treeDefault)).toBe(JSON.stringify(treePlaceholder));
  });

  it("alias-semantic output is JSON-serializable and 0 unmapped", () => {
    const tree = scaffold(profile, "button", {
      valueStrategy: "alias-semantic",
      aliasResolver: () => "color.bg.muted",
    });
    const json = JSON.stringify(tree);
    const ids = flattenDtcg(JSON.parse(json));
    const unmapped = ids.filter((id) => getSlotMapping(id) === null);
    expect(unmapped).toEqual([]);
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

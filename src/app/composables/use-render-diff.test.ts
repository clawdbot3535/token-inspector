// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeRenderDiff, computeSlotDiffs, buildSlotSentinels } from "./use-render-diff.js";
import { buildVariantCells, buildStateCells } from "./use-render-diff.js";
import type { ComponentRecipe } from "@core/recipe-engine.js";

describe("computeRenderDiff", () => {
  it("returns [] when the base classes carry no extractable arbitrary styles", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    expect(computeRenderDiff(el, "inline-flex items-center")).toEqual([]);
    el.remove();
  });

  it("returns one delta per extracted property (keys come from extractArbitrary)", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    // rounded-[8px] + bg-[#ffffff] extract to borderRadius + backgroundColor
    const deltas = computeRenderDiff(el, "rounded-[8px] bg-[#ffffff]");
    const props = deltas.map((d) => d.property).sort();
    expect(props).toContain("borderRadius");
    expect(props).toContain("backgroundColor");
    el.remove();
  });
});

describe("computeSlotDiffs", () => {
  it("returns a SlotDiff per spec; [] for a selector that matches nothing", () => {
    const host = document.createElement("div");
    const th = document.createElement("div");
    th.className = "ti-slot-th";
    host.appendChild(th);
    document.body.appendChild(host);

    const diffs = computeSlotDiffs(host, [
      { slot: "th", selector: ".ti-slot-th", classes: "rounded-[8px]" },
      { slot: "td", selector: ".ti-slot-td", classes: "p-[16px]" }, // not present
    ]);
    expect(diffs.map((d) => d.slot)).toEqual(["th", "td"]);
    expect(diffs.find((d) => d.slot === "th")!.deltas.length).toBeGreaterThan(0); // rounded → borderRadius
    expect(diffs.find((d) => d.slot === "td")!.deltas).toEqual([]); // selector miss
    host.remove();
  });
});

describe("buildSlotSentinels", () => {
  it("emits ui + specs for populated slots, skipping empty ones", () => {
    const { ui, specs } = buildSlotSentinels({ item: "rounded-[8px]", link: "", base: "p-[4px]" });
    expect(ui.item).toBe("rounded-[8px] ti-slot-item");
    expect(ui.base).toBe("p-[4px] ti-slot-base");
    expect(ui.link).toBeUndefined(); // empty slot skipped
    expect(specs).toEqual([
      { slot: "item", selector: ".ti-slot-item", classes: "rounded-[8px]" },
      { slot: "base", selector: ".ti-slot-base", classes: "p-[4px]" },
    ]);
  });
});

function recipeWith(variants: ComponentRecipe["variants"], slots: Record<string, string> = { base: "rounded-[4px]" }): ComponentRecipe {
  return { slots, variants } as unknown as ComponentRecipe;
}

describe("buildVariantCells", () => {
  it("emits one cell per variant+color key, composed base+variant classes, sentinel-stamped, with the Nuxt prop", () => {
    const recipe = recipeWith({
      variant: { solid: { base: "bg-[#A]" }, ghost: { base: "bg-transparent" } },
      color: { error: { base: "text-[#E]" } },
    });
    const cells = buildVariantCells(recipe);
    expect(cells.map((c) => `${c.axis}:${c.key}`)).toEqual(["variant:solid", "variant:ghost", "color:error"]);

    const solid = cells[0]!;
    expect(solid.props).toEqual({ variant: "solid" });
    expect(solid.ui.base).toContain("rounded-[4px]"); // base slot composed in
    expect(solid.ui.base).toContain("bg-[#A]"); // variant slot composed in
    expect(solid.ui.base).toContain("ti-slot-base"); // sentinel appended
    expect(solid.specs[0]!.classes).toBe("rounded-[4px] bg-[#A]"); // probe = composed classes, NO sentinel

    const error = cells[2]!;
    expect(error.props).toEqual({ color: "error" });
  });

  it("returns [] for a recipe with no variant/color axis", () => {
    expect(buildVariantCells(recipeWith({}))).toEqual([]);
    expect(buildVariantCells(recipeWith({ size: { md: { base: "p-2" } } }))).toEqual([]);
  });
});

describe("buildStateCells", () => {
  it("emits a disabled cell when the recipe has disabled: classes — ui keeps full classes, specs use the projected intent", () => {
    const recipe = recipeWith({}, { base: "text-[#000] disabled:text-[#999]" });
    const cells = buildStateCells(recipe);
    expect(cells.map((c) => c.state)).toEqual(["disabled"]);
    const d = cells[0]!;
    expect(d.props).toEqual({ disabled: true });
    expect(d.ui.base).toBe("text-[#000] disabled:text-[#999] ti-slot-base"); // full classes + sentinel
    expect(d.specs[0]!.classes).toBe("text-[#000] text-[#999]"); // projectToState(...,"disabled"): promoted, prefix dropped
  });

  it("returns [] when the recipe has no disabled: classes", () => {
    expect(buildStateCells(recipeWith({}, { base: "text-[#000] hover:text-[#111]" }))).toEqual([]);
  });

  it("emits a checked cell when the recipe has data-[state=checked]: classes — props default to modelValue:true", () => {
    const recipe = recipeWith({}, { base: "bg-[#000] data-[state=checked]:bg-[#fff]" });
    const cells = buildStateCells(recipe);
    expect(cells.map((c) => c.state)).toEqual(["checked"]);
    const c = cells[0]!;
    expect(c.props).toEqual({ modelValue: true });
    expect(c.ui.base).toBe("bg-[#000] data-[state=checked]:bg-[#fff] ti-slot-base"); // full classes + sentinel
    expect(c.specs[0]!.classes).toBe("bg-[#000] bg-[#fff]"); // projectToState(...,"checked"): promoted, prefix dropped
  });

  it("uses the radio checked override (modelValue is the item value, not true)", () => {
    const recipe = recipeWith({}, { base: "bg-[#000] data-[state=checked]:bg-[#fff]" });
    const cells = buildStateCells(recipe, "radio");
    expect(cells[0]!.props).toEqual({ modelValue: "a" });
  });

  it("emits both cells in SETTABLE_STATES order when the recipe carries disabled and checked", () => {
    const recipe = recipeWith({}, { base: "disabled:opacity-[0.5] data-[state=checked]:bg-[#fff]" });
    expect(buildStateCells(recipe).map((c) => c.state)).toEqual(["disabled", "checked"]);
  });

  it("emits an open cell when the recipe has data-[state=open]: classes — props default to {}", () => {
    const recipe = recipeWith({}, { base: "text-[#000] data-[state=open]:text-[#fff]" });
    const cells = buildStateCells(recipe);
    expect(cells.map((c) => c.state)).toEqual(["open"]);
    const c = cells[0]!;
    expect(c.props).toEqual({});
    expect(c.ui.base).toBe("text-[#000] data-[state=open]:text-[#fff] ti-slot-base"); // full classes + sentinel
    expect(c.specs[0]!.classes).toBe("text-[#000] text-[#fff]"); // projectToState(...,"open"): promoted, prefix dropped
  });

  it("uses the accordion open override (defaultValue is the item value)", () => {
    const recipe = recipeWith({}, { base: "text-[#000] data-[state=open]:text-[#fff]" });
    const cells = buildStateCells(recipe, "accordion");
    expect(cells[0]!.props).toEqual({ defaultValue: "a" });
  });

  it("emits disabled, checked, open in SETTABLE_STATES order when the recipe carries all three", () => {
    const recipe = recipeWith({}, { base: "disabled:opacity-[0.5] data-[state=checked]:bg-[#c] data-[state=open]:text-[#o]" });
    expect(buildStateCells(recipe).map((c) => c.state)).toEqual(["disabled", "checked", "open"]);
  });
});

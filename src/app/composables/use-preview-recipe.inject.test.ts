// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { defineComponent, ref, h, type ComputedRef } from "vue";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { usePreviewRecipe, useCustomPreviewRecipe } from "./use-preview-recipe.js";
import { RESOLVE_OVERRIDE_KEY } from "../resolve/override-key.js";

function mysteryGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { mystery: { radius: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("usePreviewRecipe inject wiring", () => {
  it("applies an injected slot-mapping override to the built recipe", () => {
    const g = mysteryGraph();
    let captured: ComputedRef<unknown> | null = null;

    const Probe = defineComponent({
      setup() {
        const { recipe } = usePreviewRecipe(() => g, () => "button");
        captured = recipe;
        return () => h("div");
      },
    });

    mount(Probe, {
      global: {
        provide: {
          [RESOLVE_OVERRIDE_KEY as symbol]: ref<SlotMappingOverride>({
            "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
          }),
        },
      },
    });

    // The overridden token emits rounded-lg into slots.base
    expect(JSON.stringify(captured!.value)).toContain("rounded");
  });

  it("falls back to empty override (no-op) when no provider is present", () => {
    const g = mysteryGraph();
    let captured: ComputedRef<unknown> | null = null;

    const Probe = defineComponent({
      setup() {
        const { recipe } = usePreviewRecipe(() => g, () => "button");
        captured = recipe;
        return () => h("div");
      },
    });

    // No provide — inject falls back to ref({})
    mount(Probe);

    // Without override the mystery token is unmapped — slots.base is undefined/missing "rounded"
    const baseClasses: string = (captured!.value as { slots?: { base?: string } })?.slots?.base ?? "";
    expect(baseClasses).not.toContain("rounded");
  });
});

describe("useCustomPreviewRecipe inject wiring", () => {
  function chipGraph() {
    const sources: SourceFile[] = [
      { name: "global", data: { chip: { close: { radius: { $value: 8, $type: "dimension" } } } } },
    ];
    return buildGraph(sources);
  }
  it("applies an injected override to the custom (chip) recipe", () => {
    const g = chipGraph();
    const parts = new Map<string, ReadonlyArray<string>>([["chip", ["close"]]]);
    let captured: ComputedRef<unknown> | null = null;

    const Probe = defineComponent({
      setup() {
        const { recipe } = useCustomPreviewRecipe(() => g, () => "chip", () => parts);
        captured = recipe;
        return () => h("div");
      },
    });

    mount(Probe, {
      global: {
        provide: {
          [RESOLVE_OVERRIDE_KEY as symbol]: ref<SlotMappingOverride>({
            "chip-close-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
          }),
        },
      },
    });

    // The override routes the chip token to slots.base; the AUTO mapping (no
    // override) places chip-close-* in the `close` slot instead — so asserting
    // on slots.base specifically distinguishes the injected override.
    const baseClasses: string = (captured!.value as { slots?: { base?: string } })?.slots?.base ?? "";
    expect(baseClasses).toContain("rounded");
  });
});

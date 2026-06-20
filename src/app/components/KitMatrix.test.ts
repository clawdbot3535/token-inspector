// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { h } from "vue";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import KitMatrix from "./KitMatrix.vue";
import { RADIO_ITEM_VALUE } from "./real-slotted-registry.js";

const variantCells = [
  { axis: "variant", key: "solid", ui: { base: "" }, specs: [], props: { variant: "solid" } },
  { axis: "variant", key: "outline", ui: { base: "" }, specs: [], props: { variant: "outline" } },
  { axis: "color", key: "primary", ui: { base: "" }, specs: [], props: { color: "primary" } },
];
const stateCells = [{ state: "disabled", ui: { base: "" }, specs: [], props: { disabled: true } }];

const slotTpl = { cell: '<button data-testid="cell-btn">x</button>' };

function inputDisabledGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { input: { bg: { disabled: { $value: "#F4F4F5", $type: "color" } } } } },
  ];
  return buildGraph(sources);
}

describe("KitMatrix", () => {
  it("renders Variants / Colors / States rows", () => {
    const w = mount(KitMatrix, {
      props: { componentName: "button", variantCells, stateCells, graph: null },
      slots: slotTpl,
    });
    expect(w.find('[data-testid="kit-row-variants"]').exists()).toBe(true);
    expect(w.find('[data-testid="kit-row-colors"]').exists()).toBe(true);
    expect(w.find('[data-testid="kit-row-states"]').exists()).toBe(true);
  });

  it("renders a catalog note on outline but not on solid", () => {
    const w = mount(KitMatrix, {
      props: { componentName: "button", variantCells, stateCells: [], graph: null },
      slots: slotTpl,
    });
    const cells = w.findAll('[data-testid="real-variant-cell"]');
    const solid = cells.find((c) => c.text().startsWith("solid"))!;
    const outline = cells.find((c) => c.text().startsWith("outline"))!;
    expect(solid.find('[data-testid="rvc-note"]').exists()).toBe(false);
    expect(outline.find('[data-testid="rvc-note"]').exists()).toBe(true);
  });

  it("renders switch colour cells checked (modelValue) so the colour shows; leaves non-checkable comps alone", () => {
    const colorCell = [{ axis: "color", key: "error", ui: { base: "" }, specs: [], props: { color: "error" } }];
    const scopedSlot = {
      cell: (params: { cell: { props: Record<string, unknown> } }) =>
        h("button", { class: "cb", "data-props": JSON.stringify(params.cell.props) }, "x"),
    };

    // switch: color cell should have modelValue: true merged in
    const sw = mount(KitMatrix, {
      props: { componentName: "switch", variantCells: colorCell, stateCells: [], graph: null },
      slots: scopedSlot,
    });
    expect(
      JSON.parse(sw.find('[data-testid="kit-row-colors"] .cb').attributes("data-props")!),
    ).toMatchObject({ color: "error", modelValue: true });

    // checkbox: color cell should have modelValue: true merged in
    const cb = mount(KitMatrix, {
      props: { componentName: "checkbox", variantCells: colorCell, stateCells: [], graph: null },
      slots: scopedSlot,
    });
    expect(
      JSON.parse(cb.find('[data-testid="kit-row-colors"] .cb').attributes("data-props")!),
    ).toMatchObject({ color: "error", modelValue: true });

    // radio: color cell should have modelValue: RADIO_ITEM_VALUE merged in
    const radio = mount(KitMatrix, {
      props: { componentName: "radio", variantCells: colorCell, stateCells: [], graph: null },
      slots: scopedSlot,
    });
    expect(
      JSON.parse(radio.find('[data-testid="kit-row-colors"] .cb').attributes("data-props")!),
    ).toMatchObject({ color: "error", modelValue: RADIO_ITEM_VALUE });

    // button: non-checkable — props unchanged, no modelValue
    const btn = mount(KitMatrix, {
      props: { componentName: "button", variantCells: colorCell, stateCells: [], graph: null },
      slots: scopedSlot,
    });
    expect(
      JSON.parse(btn.find('[data-testid="kit-row-colors"] .cb').attributes("data-props")!),
    ).not.toHaveProperty("modelValue");
  });

  it("renders a scanner note on the disabled state cell (disabled-via-opacity)", () => {
    const w = mount(KitMatrix, {
      props: { componentName: "input", variantCells: [], stateCells, graph: inputDisabledGraph() },
      slots: slotTpl,
    });
    const stateCell = w.find('[data-testid="kit-row-states"] [data-testid="real-variant-cell"]');
    expect(stateCell.find('[data-testid="rvc-note"]').exists()).toBe(true);
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RealVariantCell from "./RealVariantCell.vue";

describe("RealVariantCell", () => {
  it("renders the label and the slotted anatomy inside its host", () => {
    const w = mount(RealVariantCell, {
      props: { label: "variant: solid", specs: [] },
      slots: { default: '<span data-testid="anatomy" class="ti-slot-base">X</span>' },
    });
    expect(w.text()).toContain("variant: solid");
    expect(w.find('[data-testid="anatomy"]').exists()).toBe(true);
  });
});

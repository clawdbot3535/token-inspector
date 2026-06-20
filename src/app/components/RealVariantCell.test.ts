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

const SPECS = [{ slot: "base", selector: ".ti-slot-base", classes: "bg-[#ffffff]" }];

describe("RealVariantCell — diagnostics gating", () => {
  it("hides the delta section by default", () => {
    const w = mount(RealVariantCell, {
      props: { label: "solid", specs: SPECS },
      slots: { default: "<button>x</button>" },
    });
    expect(w.find('[data-testid="rvc-diagnostics"]').exists()).toBe(false);
  });

  it("shows the delta section when showDiagnostics is true", () => {
    const w = mount(RealVariantCell, {
      props: { label: "solid", specs: SPECS, showDiagnostics: true },
      slots: { default: "<button>x</button>" },
    });
    expect(w.find('[data-testid="rvc-diagnostics"]').exists()).toBe(true);
  });
});

describe("RealVariantCell — notes", () => {
  it("renders an inline note when notes are present", () => {
    const w = mount(RealVariantCell, {
      props: { label: "outline", specs: [], notes: [{ text: "Nuxt adds an inset ring", kind: "expected" }] },
      slots: { default: "<button>x</button>" },
    });
    const note = w.find('[data-testid="rvc-note"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("inset ring");
  });
  it("renders no note element when notes is empty/absent", () => {
    const w = mount(RealVariantCell, { props: { label: "solid", specs: [] }, slots: { default: "<button>x</button>" } });
    expect(w.find('[data-testid="rvc-note"]').exists()).toBe(false);
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResolvePanel from "./ResolvePanel.vue";
import type { ResolvableDeviation } from "../resolve/heuristic-extendable.js";

const deviation: ResolvableDeviation = {
  tokenId: "button-mystery-bg",
  component: "button",
  kind: "unsupported-part",
  candidateSlots: ["base", "label"],
  guess: { slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: null },
};
const stubs = {
  UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' },
  USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="i in items" :key="i" :value="i">{{ i }}</option></select>' },
};

describe("ResolvePanel", () => {
  it("pre-fills from the guess and emits apply with the entry on click", async () => {
    const wrapper = mount(ResolvePanel, { props: { deviation }, global: { stubs } });
    await wrapper.get("[data-testid=resolve-apply]").trigger("click");
    const ev = wrapper.emitted("apply");
    expect(ev).toBeTruthy();
    const [tokenId, entry] = ev![0] as [string, any];
    expect(tokenId).toBe("button-mystery-bg");
    expect(entry.slot).toBe("base");
    expect(entry.utilityType).toBe("bg-color");
  });
});

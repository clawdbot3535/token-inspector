// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseSlotMappingFile } from "@core/slot-mapping-loader.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { buildSlotMappingFile, slotMappingBundleEntry } from "./export-slot-mapping.js";

const override: SlotMappingOverride = {
  "button-mystery-bg": { slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: null },
};

describe("buildSlotMappingFile", () => {
  it("serialises an override that round-trips through parseSlotMappingFile", () => {
    const json = buildSlotMappingFile(override);
    expect(json).toContain('"overrides"');
    const loaded = parseSlotMappingFile(json);
    expect(loaded.overrides).toEqual(override);
  });
});

describe("slotMappingBundleEntry", () => {
  it("emits a slot-mapping.json bundle entry for a non-empty override", () => {
    const entry = slotMappingBundleEntry(override);
    expect(entry).toHaveLength(1);
    expect(entry[0]!.name).toBe("slot-mapping.json");
    expect(parseSlotMappingFile(entry[0]!.data).overrides).toEqual(override);
  });

  it("emits nothing for an empty override (no resolves to carry)", () => {
    expect(slotMappingBundleEntry({})).toEqual([]);
  });
});

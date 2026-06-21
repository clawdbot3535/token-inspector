// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseSlotMappingFile } from "@core/slot-mapping-loader.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { buildSlotMappingFile } from "./export-slot-mapping.js";

describe("buildSlotMappingFile", () => {
  it("serialises an override that round-trips through parseSlotMappingFile", () => {
    const override: SlotMappingOverride = {
      "button-mystery-bg": { slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: null },
    };
    const json = buildSlotMappingFile(override);
    expect(json).toContain('"overrides"');
    const loaded = parseSlotMappingFile(json);
    expect(loaded.overrides).toEqual(override);
  });
});

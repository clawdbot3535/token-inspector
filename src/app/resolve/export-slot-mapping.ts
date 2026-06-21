import type { SlotMappingOverride } from "@tg/grammar";
import type { SlotMappingFile } from "@core/slot-mapping-loader.js";

/** Serialise the session override into the slot-mapping.json shape the
 *  CLI/build consumes (parseSlotMappingFile round-trips it). */
export function buildSlotMappingFile(override: SlotMappingOverride): string {
  const file: SlotMappingFile = { overrides: override };
  return JSON.stringify(file, null, 2) + "\n";
}

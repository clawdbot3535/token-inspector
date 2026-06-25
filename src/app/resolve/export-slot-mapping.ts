import type { SlotMappingOverride } from "@tg/grammar";
import type { SlotMappingFile } from "@core/slot-mapping-loader.js";

/** Serialise the session override into the slot-mapping.json shape the
 *  CLI/build consumes (parseSlotMappingFile round-trips it). */
export function buildSlotMappingFile(override: SlotMappingOverride): string {
  const file: SlotMappingFile = { overrides: override };
  return JSON.stringify(file, null, 2) + "\n";
}

/** One file entry of the export bundle: a name and its text content. */
export interface BundleEntry {
  name: string;
  data: string;
}

/** The slot-mapping.json entries to fold into the export bundle. Returns a
 *  single entry carrying the session resolves, or none when there are no
 *  resolves to carry (no point shipping an empty `{ overrides: {} }`). Spread
 *  into the bundle's entry list so the override travels with the export. */
export function slotMappingBundleEntry(override: SlotMappingOverride): BundleEntry[] {
  if (Object.keys(override).length === 0) return [];
  return [{ name: "slot-mapping.json", data: buildSlotMappingFile(override) }];
}

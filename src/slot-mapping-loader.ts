// Loads optional slot-mapping.json from project root. Splits the file
// shape into the two structures the engine consumes: a SlotMappingOverride
// keyed by token id, and a defaultSizeByComponent record.

import { readFileSync, existsSync } from "node:fs";
import type { SlotMappingOverride } from "./slot-mapping.js";

export interface SlotMappingFile {
  components?: Record<string, { defaultSize?: string }>;
  overrides?: SlotMappingOverride;
}

export interface LoadedSlotMapping {
  overrides: SlotMappingOverride | undefined;
  defaultSizeByComponent: Record<string, string> | undefined;
}

export function loadSlotMappingFile(path: string): LoadedSlotMapping {
  if (!existsSync(path)) {
    return { overrides: undefined, defaultSizeByComponent: undefined };
  }

  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as SlotMappingFile;

  const defaultSizeByComponent: Record<string, string> = {};
  for (const [name, config] of Object.entries(parsed.components ?? {})) {
    if (config.defaultSize !== undefined) {
      defaultSizeByComponent[name] = config.defaultSize;
    }
  }

  return {
    overrides: parsed.overrides,
    defaultSizeByComponent:
      Object.keys(defaultSizeByComponent).length > 0
        ? defaultSizeByComponent
        : undefined,
  };
}

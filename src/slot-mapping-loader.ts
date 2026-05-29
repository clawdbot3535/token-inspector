// Parses optional slot-mapping.json content into the two structures the
// recipe engine consumes: a SlotMappingOverride keyed by token id, and a
// defaultSizeByComponent record. Pure logic — no filesystem access here;
// the CLI reads the file and passes the JSON string in. Keeps this module
// importable from browser-side code (Inspector UI in PR 4b) without
// requiring node types under tsconfig.app.json.

import type { SlotMappingOverride } from "./slot-mapping.js";

export interface SlotMappingFile {
  components?: Record<string, { defaultSize?: string }>;
  overrides?: SlotMappingOverride;
}

export interface LoadedSlotMapping {
  overrides: SlotMappingOverride | undefined;
  defaultSizeByComponent: Record<string, string> | undefined;
}

const EMPTY: LoadedSlotMapping = {
  overrides: undefined,
  defaultSizeByComponent: undefined,
};

/**
 * Parse a slot-mapping.json string. Returns the empty shape when given
 * an empty/null/undefined input so callers can do
 * `parseSlotMappingFile(existsSync(p) ? readFileSync(p, "utf8") : "")`.
 */
export function parseSlotMappingFile(
  json: string | null | undefined,
): LoadedSlotMapping {
  if (!json) return EMPTY;

  let parsed: SlotMappingFile;
  try {
    parsed = JSON.parse(json) as SlotMappingFile;
  } catch (cause) {
    // Fail loud but actionable: a malformed optional config should report
    // itself, not surface as an opaque SyntaxError stack from deep in the CLI.
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Invalid slot-mapping.json: ${msg}`);
  }

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

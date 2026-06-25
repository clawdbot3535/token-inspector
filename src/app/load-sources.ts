// File loader: takes a list of File objects (drag-drop or picker), reads
// JSON contents, and produces SourceFile[] for buildGraph. Recognizes
// Figma's standard filenames so users can drop the export folder/zip
// without manual mapping. Also extracts an optional figma-mapping.json
// from the same drop so users can bring their own component mapping.

import type { SourceFile, SourceLayer } from "@core/token-graph.js";
import type { FigmaMappingFile } from "./figma-mapping.js";
import { parseSlotMappingFile, type LoadedSlotMapping } from "@core/slot-mapping-loader.js";
import { unzipToFiles } from "./unzip.js";

const FILENAME_TO_LAYER: Record<string, SourceLayer> = {
  "color.tokens.json": "color",
  "dimension.tokens.json": "dimension",
  "typography.tokens.json": "typography",
  "light.tokens.json": "light",
  "dark.tokens.json": "dark",
  "global.tokens.json": "global",
};

const FIGMA_MAPPING_FILENAMES = new Set(["figma-mapping.json", "figma.json"]);
const SLOT_MAPPING_FILENAMES = new Set(["slot-mapping.json"]);

function detectLayer(filename: string): SourceLayer | null {
  const base = filename.toLowerCase().split("/").pop() ?? filename.toLowerCase();
  return FILENAME_TO_LAYER[base] ?? null;
}

function isFigmaMappingFile(filename: string): boolean {
  const base = filename.toLowerCase().split("/").pop() ?? filename.toLowerCase();
  return FIGMA_MAPPING_FILENAMES.has(base);
}

function isSlotMappingFile(filename: string): boolean {
  const base = filename.toLowerCase().split("/").pop() ?? filename.toLowerCase();
  return SLOT_MAPPING_FILENAMES.has(base);
}

function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}

async function expandZips(
  files: readonly File[],
  warnings: string[],
): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    if (!isZip(file)) {
      out.push(file);
      continue;
    }
    try {
      const inner = await unzipToFiles(file);
      if (inner.length === 0) {
        warnings.push(`Empty zip (skipped): ${file.name}`);
        continue;
      }
      out.push(...inner);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      warnings.push(`Failed to read zip ${file.name}: ${msg}`);
    }
  }
  return out;
}

async function readJson(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to parse ${file.name}: ${msg}`);
  }
}

export interface LoadResult {
  sources: SourceFile[];
  figmaMapping: FigmaMappingFile | null;
  slotMapping: LoadedSlotMapping | null;
  warnings: string[];
}

export async function loadSources(files: readonly File[]): Promise<LoadResult> {
  const sources: SourceFile[] = [];
  const warnings: string[] = [];
  const seen = new Set<SourceLayer>();
  let figmaMapping: FigmaMappingFile | null = null;
  let slotMapping: LoadedSlotMapping | null = null;

  const expanded = await expandZips(files, warnings);

  for (const file of expanded) {
    // Optional resolve-override side-car (mirrors figma-mapping.json): parse it
    // so App.vue can restore the session's slot-mapping overrides on reimport.
    if (isSlotMappingFile(file.name)) {
      try {
        slotMapping = parseSlotMappingFile(await file.text());
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        warnings.push(`Invalid slot-mapping.json (skipped): ${msg}`);
      }
      continue;
    }
    if (isFigmaMappingFile(file.name)) {
      const data = await readJson(file);
      const components = (data as FigmaMappingFile | null)?.components;
      if (
        data &&
        typeof data === "object" &&
        Array.isArray(components) &&
        components.every((c) => c !== null && typeof c === "object")
      ) {
        figmaMapping = data as FigmaMappingFile;
      } else {
        warnings.push(`Invalid figma-mapping.json (skipped)`);
      }
      continue;
    }
    const layer = detectLayer(file.name);
    if (!layer) {
      warnings.push(`Unknown file (skipped): ${file.name}`);
      continue;
    }
    if (seen.has(layer)) {
      warnings.push(`Duplicate ${layer} file (using first): ${file.name}`);
      continue;
    }
    const data = await readJson(file);
    // DTCG sources must be a JSON object; an array root (or scalar) would
    // otherwise walk into numeric-keyed garbage nodes (e.g. "0-color-blue").
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      warnings.push(`Not a token object (skipped): ${file.name}`);
      continue;
    }
    sources.push({ name: layer, data: data as Record<string, unknown> });
    seen.add(layer);
  }

  return { sources, figmaMapping, slotMapping, warnings };
}

// File loader: takes a list of File objects (drag-drop or picker), reads
// JSON contents, and produces SourceFile[] for buildGraph. Recognizes
// Figma's standard filenames so users can drop the export folder/zip
// without manual mapping. Also extracts an optional figma-mapping.json
// from the same drop so users can bring their own component mapping.

import type { SourceFile, SourceLayer } from "@core/token-graph.js";
import type { FigmaMappingFile } from "./figma-mapping.js";

const FILENAME_TO_LAYER: Record<string, SourceLayer> = {
  "color.tokens.json": "color",
  "dimension.tokens.json": "dimension",
  "typography.tokens.json": "typography",
  "light.tokens.json": "light",
  "dark.tokens.json": "dark",
  "global.tokens.json": "global",
};

const FIGMA_MAPPING_FILENAMES = new Set(["figma-mapping.json", "figma.json"]);

function detectLayer(filename: string): SourceLayer | null {
  const base = filename.toLowerCase().split("/").pop() ?? filename.toLowerCase();
  return FILENAME_TO_LAYER[base] ?? null;
}

function isFigmaMappingFile(filename: string): boolean {
  const base = filename.toLowerCase().split("/").pop() ?? filename.toLowerCase();
  return FIGMA_MAPPING_FILENAMES.has(base);
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
  warnings: string[];
}

export async function loadSources(files: readonly File[]): Promise<LoadResult> {
  const sources: SourceFile[] = [];
  const warnings: string[] = [];
  const seen = new Set<SourceLayer>();
  let figmaMapping: FigmaMappingFile | null = null;

  for (const file of files) {
    if (isFigmaMappingFile(file.name)) {
      const data = await readJson(file);
      if (data && typeof data === "object" && Array.isArray((data as FigmaMappingFile).components)) {
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
    if (!data || typeof data !== "object") {
      warnings.push(`Not an object in ${file.name}`);
      continue;
    }
    sources.push({ name: layer, data: data as Record<string, unknown> });
    seen.add(layer);
  }

  return { sources, figmaMapping, warnings };
}

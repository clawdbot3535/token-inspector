import type { TokenGraph } from "../../token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { tokensCssRenderer } from "../tokens-css.js";
import { buildKitTheme } from "./kit-theme.js";
import { buildKitGallery } from "./kit-gallery.js";
import {
  KIT_PACKAGE_JSON,
  KIT_VITE_CONFIG,
  KIT_INDEX_HTML,
  KIT_MAIN_TS,
  KIT_MAIN_CSS,
  KIT_README,
} from "./kit-templates.js";

/**
 * A single file to be emitted as part of the kit export.
 * Mirrors the shape of ExportFile in src/app/git-export.ts without creating
 * a cross-layer dependency (renderers must not import from app/).
 */
export interface ExportFile {
  readonly path: string;
  readonly content: string;
}

/** Builds a self-contained runnable Vite + @nuxt/ui kit project as ExportFiles under `kit/`.
 *  `slotMappingOverride` (the session resolves) threads into the recipe-based theme + gallery
 *  so the runnable kit matches the rest of the export. */
export function buildKitFiles(graph: TokenGraph, slotMappingOverride?: SlotMappingOverride): ExportFile[] {
  const theme = buildKitTheme(graph, slotMappingOverride);
  return [
    { path: "kit/package.json", content: KIT_PACKAGE_JSON },
    { path: "kit/vite.config.ts", content: KIT_VITE_CONFIG },
    { path: "kit/index.html", content: KIT_INDEX_HTML },
    { path: "kit/tokens.css", content: tokensCssRenderer.render(graph).text },
    { path: "kit/theme.ts", content: `export const theme = ${JSON.stringify(theme, null, 2)} as const;\n` },
    { path: "kit/src/main.ts", content: KIT_MAIN_TS },
    { path: "kit/src/main.css", content: KIT_MAIN_CSS },
    { path: "kit/src/App.vue", content: buildKitGallery(graph, slotMappingOverride) },
    { path: "kit/README.md", content: KIT_README },
  ];
}

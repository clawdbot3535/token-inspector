import type { TokenGraph, ScanReport } from "./token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { tokensCssRenderer } from "./renderers/tokens-css.js";
import { appConfigRenderer, customComponentsRenderer } from "./renderers/index.js";
import { buildKitFiles } from "./renderers/kit/kit-emitter.js";
import { buildShadcnTheme } from "./renderers/shadcn/shadcn-theme.js";
import { buildGenericCss, buildGenericJson } from "./renderers/generic/generic-tokens.js";
import { customPartsByComponent } from "./scanner.js";

// An output TARGET — a component system the design tokens are emitted FOR. Each
// target bundles all its files and pulls whatever scan context it needs out of
// the shared context. Adding a target is a single registry entry here; the CLI
// and the web download both iterate TARGETS, so neither call site is touched.
//
// Cross-cutting artifacts (REPORT.md diagnostic, slot-mapping.json resolve state)
// are NOT targets — they stay emitted separately by their call sites.

export interface TargetContext {
  readonly graph: TokenGraph;
  readonly scanReport: ScanReport;
  readonly slotMappingOverride?: SlotMappingOverride;
  readonly defaultSizeByComponent?: Readonly<Record<string, string>>;
}

export interface TargetFile {
  readonly path: string;
  readonly content: string;
}

export interface Target {
  readonly id: string;
  emit(ctx: TargetContext): readonly TargetFile[];
}

/**
 * Nuxt UI — the recipe-based target: the Tailwind theme (css/tokens.css), the
 * `app.config.ts` ui recipes, hand-built recipes for flagged-custom components
 * (only when non-empty), and the runnable kit/ project. Derives customParts +
 * completeness from the scan once (previously duplicated across the CLI + web).
 */
const nuxtTarget: Target = {
  id: "nuxt",
  emit({ graph, scanReport, slotMappingOverride, defaultSizeByComponent }) {
    const customParts = customPartsByComponent(scanReport);
    const files: TargetFile[] = [
      { path: "css/tokens.css", content: tokensCssRenderer.render(graph).text },
      {
        path: "nuxt/app.config.ts",
        content: appConfigRenderer.render(graph, {
          slotMappingOverride,
          defaultSizeByComponent,
          completeness: scanReport.completeness,
          customComponents: new Set(customParts.keys()),
        }).text,
      },
    ];

    const custom = customComponentsRenderer.render(graph, {
      customParts,
      slotMappingOverride,
      defaultSizeByComponent,
    }).text;
    if (custom.trim().length > 0) {
      files.push({ path: "nuxt/custom-components.ts", content: custom });
    }

    for (const f of buildKitFiles(graph, slotMappingOverride, defaultSizeByComponent)) {
      files.push({ path: f.path, content: f.content });
    }
    return files;
  },
};

/** shadcn/ui — the CSS-variable theme target (globals.css). */
const shadcnTarget: Target = {
  id: "shadcn",
  emit({ graph }) {
    return [{ path: "shadcn/globals.css", content: buildShadcnTheme(graph) }];
  },
};

/** Framework-agnostic — the design tokens under their own names, as plain CSS
 *  custom properties + a flat JSON, for any non-Tailwind consumer. */
const genericTarget: Target = {
  id: "generic",
  emit({ graph }) {
    return [
      { path: "tokens/variables.css", content: buildGenericCss(graph) },
      { path: "tokens/tokens.json", content: buildGenericJson(graph) },
    ];
  },
};

export const TARGETS: readonly Target[] = [nuxtTarget, shadcnTarget, genericTarget];

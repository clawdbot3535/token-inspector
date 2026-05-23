#!/usr/bin/env node
// Typed CLI for the Tailwind-utility-first pipeline.
// Reads components/*.tokens.json, builds the graph, classifies every
// token, and writes the new tokens.css + app.config.ts to output/css/
// and output/nuxt/. The legacy build-tokens.mjs remains untouched and
// continues to write output/* in parallel during the transition window.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../src/build-graph.ts";
import { tokensCssRenderer } from "../src/renderers/tokens-css.ts";
import { appConfigRenderer } from "../src/renderers/app-config.ts";
import { parseSlotMappingFile } from "../src/slot-mapping-loader.ts";
import { scanGraph } from "../src/scanner.ts";
import type {
  ScanIssue,
  ScanSeverity,
  SourceFile,
  SourceLayer,
} from "../src/token-graph.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const inDir = resolve(repoRoot, "components");
const outRoot = resolve(repoRoot, "output");

const slotMappingPath = resolve(repoRoot, "slot-mapping.json");
const slotMappingJson = existsSync(slotMappingPath)
  ? readFileSync(slotMappingPath, "utf8")
  : "";
const slotMapping = parseSlotMappingFile(slotMappingJson);
if (slotMapping.overrides || slotMapping.defaultSizeByComponent) {
  console.log("loaded slot-mapping.json overrides + default sizes");
}

const SOURCE_FILES: ReadonlyArray<{ name: SourceLayer; file: string }> = [
  { name: "color", file: "color.tokens.json" },
  { name: "dimension", file: "dimension.tokens.json" },
  { name: "typography", file: "typography.tokens.json" },
  { name: "light", file: "light.tokens.json" },
  { name: "dark", file: "dark.tokens.json" },
  { name: "global", file: "global.tokens.json" },
];

function load(name: SourceLayer, file: string): SourceFile {
  const path = resolve(inDir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  return { name, data };
}

function writeOut(relativePath: string, content: string): void {
  const full = resolve(outRoot, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log("wrote", relativePath, content.length, "bytes");
}

const sources = SOURCE_FILES.map((s) => load(s.name, s.file));
const graph = buildGraph(sources);

const scanReport = scanGraph(graph, { components: ["button"] });

const cssRendered = tokensCssRenderer.render(graph);
const appConfigRendered = appConfigRenderer.render(graph, {
  slotMappingOverride: slotMapping.overrides,
  defaultSizeByComponent: slotMapping.defaultSizeByComponent,
  completeness: scanReport.completeness,
});

writeOut("css/tokens.css", cssRendered.text);
writeOut("nuxt/app.config.ts", appConfigRendered.text);

// ─── Scan report summary ──────────────────────────────────────────────────
// Group by severity for a stable CI-friendly digest. Errors block the
// process exit; warnings + hints print but pass.
printScanReport(scanReport.issues);

function printScanReport(issues: readonly ScanIssue[]): void {
  if (issues.length === 0) {
    console.log("\nscan: clean — no issues found");
    return;
  }

  const bySeverity = new Map<ScanSeverity, ScanIssue[]>();
  for (const i of issues) {
    const arr = bySeverity.get(i.severity) ?? [];
    arr.push(i);
    bySeverity.set(i.severity, arr);
  }

  const errors = bySeverity.get("error") ?? [];
  const warnings = bySeverity.get("warning") ?? [];
  const hints = bySeverity.get("hint") ?? [];

  console.log(
    `\nscan: ${errors.length} error(s), ${warnings.length} warning(s), ${hints.length} hint(s)`,
  );

  if (errors.length > 0) {
    console.log(`\nerrors:`);
    for (const i of errors) console.log(`  [${i.kind}] ${i.message}`);
  }

  if (warnings.length > 0) {
    console.log(`\nwarnings:`);
    for (const i of warnings) console.log(`  [${i.kind}] ${i.message}`);
  }

  const HINT_CAP = 10;
  if (hints.length > 0) {
    console.log(`\nhints (first ${Math.min(HINT_CAP, hints.length)}):`);
    for (const i of hints.slice(0, HINT_CAP)) console.log(`  [${i.kind}] ${i.message}`);
    if (hints.length > HINT_CAP) {
      console.log(`  … (${hints.length - HINT_CAP} more — open Inspector for full list)`);
    }
  }

  if (errors.length > 0) {
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
}

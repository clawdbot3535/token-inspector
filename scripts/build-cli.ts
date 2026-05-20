#!/usr/bin/env node
// Typed CLI for the Tailwind-utility-first pipeline.
// Reads components/*.tokens.json, builds the graph, classifies every
// token, and writes the new tokens.css + app.config.ts to output/css/
// and output/nuxt/. The legacy build-tokens.mjs remains untouched and
// continues to write output/* in parallel during the transition window.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../src/build-graph.ts";
import { tokensCssRenderer } from "../src/renderers/tokens-css.ts";
import { appConfigRenderer } from "../src/renderers/app-config.ts";
import type { SourceFile, SourceLayer } from "../src/token-graph.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const inDir = resolve(repoRoot, "components");
const outRoot = resolve(repoRoot, "output");

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

if (graph.issues.length > 0) {
  console.warn(`built with ${graph.issues.length} issue(s):`);
  for (const issue of graph.issues.slice(0, 10)) {
    console.warn(" ", issue.kind, issue.message);
  }
}

const cssRendered = tokensCssRenderer.render(graph);
const appConfigRendered = appConfigRenderer.render(graph);

writeOut("css/tokens.css", cssRendered.text);
writeOut("nuxt/app.config.ts", appConfigRendered.text);

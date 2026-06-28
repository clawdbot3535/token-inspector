// @vitest-environment node
//
// Output golden-master regression gate. Assembles the FULL generated output from
// the canonical components/*.tokens.json — exactly what the CLI writes — and
// snapshots every file. Because the output files deterministically DETERMINE the
// kit render, this file-level golden master is the flake-free proxy for a live
// render diff: any code change that silently alters the generated output (a
// renderer tweak, a recipe regression, a report change) fails here. Runs in the
// normal suite, so pre-commit + CI are the gate. Intentional change → `vitest -u`,
// and the PR diff shows exactly which generated file changed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "./build-graph.js";
import { scanGraph } from "./scanner.js";
import { TARGETS } from "./targets.js";
import { COMPONENT_ALLOW_LIST } from "./renderers/app-config.js";
import { buildHealthReport } from "./app/report/health-report.js";
import type { SourceLayer } from "./token-graph.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAYERS: readonly SourceLayer[] = ["color", "dimension", "typography", "light", "dark", "global"];

function canonicalOutput(): Record<string, string> {
  const sources = LAYERS.map((name) => ({
    name,
    data: JSON.parse(readFileSync(resolve(root, `components/${name}.tokens.json`), "utf8")),
  }));
  const graph = buildGraph(sources);
  const scanReport = scanGraph(graph, { components: [...COMPONENT_ALLOW_LIST] });
  const out: Record<string, string> = {};
  for (const target of TARGETS) {
    for (const file of target.emit({ graph, scanReport })) out[file.path] = file.content;
  }
  out["REPORT.md"] = buildHealthReport(graph, scanReport);
  return out;
}

describe("output golden master (canonical components/ tokens)", () => {
  const out = canonicalOutput();

  it("emits the expected set of files (none added/removed silently)", () => {
    expect(Object.keys(out).sort()).toMatchSnapshot();
  });

  for (const path of Object.keys(canonicalOutput()).sort()) {
    it(`stable: ${path}`, () => {
      expect(out[path]).toMatchSnapshot();
    });
  }
});

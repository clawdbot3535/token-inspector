// Probe: run buildGraph over an unzipped export dir and classify every
// `unresolved-alias` issue. Usage: tsx scripts/probe-unresolved-alias.ts <dir>
import { readFileSync, readdirSync } from "node:fs";
import { buildGraph } from "../src/build-graph.ts";
import type { SourceFile, SourceLayer } from "../src/token-graph.ts";

const dir = process.argv[2];
if (!dir) throw new Error("usage: tsx probe-unresolved-alias.ts <unzipped-dir>");

const files = readdirSync(dir).filter((f) => f.endsWith(".tokens.json"));
const sources: SourceFile[] = files.map((f) => ({
  name: f.replace(/\.tokens\.json$/, "") as SourceLayer,
  data: JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Record<string, unknown>,
}));

const graph = buildGraph(sources);
const ua = graph.issues.filter((i) => i.kind === "unresolved-alias");
const idxKeys = [...graph.aliasIndex.keys()];

console.log("sources:", sources.map((s) => s.name).join(", "));
console.log("nodes:", graph.nodes.size, "| index keys:", idxKeys.length, "| total issues:", graph.issues.length, "| unresolved-alias:", ua.length);

let exactButUnresolved = 0;
const byLastSeg: Record<string, { count: number; defined: string[] }> = {};
for (const i of ua) {
  const raw = (i.message ?? "").replace("unresolved alias: ", "").trim();
  const lc = raw.toLowerCase();
  if (idxKeys.includes(lc)) exactButUnresolved += 1; // would mean a resolution bug
  const last = lc.split("/").pop() ?? lc;
  const definedWithSameLast = idxKeys.filter((k) => k === lc || k.endsWith("/" + last));
  byLastSeg[raw] = { count: (byLastSeg[raw]?.count ?? 0) + 1, defined: definedWithSameLast.slice(0, 4) };
}

console.log("\nexact-key-match-but-unresolved (=resolution bug):", exactButUnresolved);
console.log("\n=== unique unresolved targets (rawTarget → defined keys sharing last segment) ===");
const uniq = Object.entries(byLastSeg).sort((a, b) => b[1].count - a[1].count);
for (const [raw, info] of uniq) {
  console.log(`× ${raw}  [x${info.count}]  defined-with-same-leaf: ${info.defined.length ? info.defined.join(" | ") : "(NONE → target absent from sources)"}`);
}
console.log(`\nunique unresolved targets: ${uniq.length}`);

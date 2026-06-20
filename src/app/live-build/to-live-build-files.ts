import type { TokenGraph } from "@core/token-graph.js";
import { buildKitFiles } from "@core/renderers/kit/kit-emitter.js";

const KIT_PREFIX = "kit/";

/** Converts the canonical kit ExportFiles (paths under `kit/`) into the flat
 *  `Record<path, contents>` shape the StackBlitz SDK expects (project root = kit
 *  root), and augments `package.json` with the StackBlitz run-config so the
 *  embed runs `npm install` + the vite dev server. The canonical kit files are
 *  not mutated — this augmentation is embed-only. */
export function toLiveBuildFiles(graph: TokenGraph): Record<string, string> {
  const files: Record<string, string> = {};
  for (const f of buildKitFiles(graph)) {
    const path = f.path.startsWith(KIT_PREFIX) ? f.path.slice(KIT_PREFIX.length) : f.path;
    files[path] = f.content;
  }
  const pkgRaw = files["package.json"];
  if (pkgRaw) {
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    pkg.stackblitz = { installDependencies: true, startCommand: "npm run dev" };
    files["package.json"] = JSON.stringify(pkg, null, 2) + "\n";
  }
  return files;
}

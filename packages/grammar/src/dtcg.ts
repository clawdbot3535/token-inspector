// DTCG (Design Token Community Group) format types + flatten utility.
// flattenDtcg replicates buildGraph's ID derivation: lowercase, "-"-joined path segments,
// with applyNameFixes applied (typo fixes for font-weight/line-height).

/** A DTCG leaf token node. */
export interface DtcgNode {
  $value: string | number;
  $type: "color" | "number";
}

/** A nested DTCG token tree. Keys are path segments; leaves satisfy isDtcgNode. */
export type DtcgTree = { [key: string]: DtcgTree | DtcgNode };

function isDtcgNode(v: DtcgTree | DtcgNode): v is DtcgNode {
  return typeof (v as DtcgNode).$value !== "undefined";
}

// Mirrors NAME_FIXES in src/build-graph.ts — keep in sync.
const NAME_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^font-weigth/, "font-weight"],
  [/^line-heigth/, "line-height"],
  [/font-weigth\//g, "font-weight/"],
  [/line-heigth\//g, "line-height/"],
];

function applyNameFixes(s: string): string {
  let out = s;
  for (const [from, to] of NAME_FIXES) out = out.replace(from, to);
  return out;
}

/**
 * Flatten a DTCG tree into the token IDs that buildGraph would derive:
 * path segments joined with "/", lowercased, name-fixed, then slashes
 * replaced with "-" and non-alphanumeric runs collapsed.
 *
 * This matches buildGraph's `slug()` function exactly so integration tests
 * can cross-check the two derivations.
 */
export function flattenDtcg(tree: DtcgTree, _prefix: string[] = []): string[] {
  const ids: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = [..._prefix, key];
    if (isDtcgNode(value)) {
      // Replicate slug(path): applyNameFixes(path.join("/").toLowerCase())
      //   .replace non-alnum runs with "-"
      //   .replace "/" with "-"
      //   .collapse "-+"
      //   .trim leading/trailing "-"
      const raw = applyNameFixes(path.join("/").toLowerCase());
      const id = raw
        .replace(/[^a-z0-9/_-]+/gi, "-")
        .replace(/\//g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      ids.push(id);
    } else {
      ids.push(...flattenDtcg(value as DtcgTree, path));
    }
  }
  return ids;
}

// Pure builder: SourceFile[] → TokenGraph.
// Ports the logic from build-tokens.mjs into a typed, immutable graph.
// Never throws; surfaces problems as GraphIssue entries instead.

import type {
  BuildGraph,
  GraphIssue,
  GraphLayer,
  RawToken,
  ResolvedAlias,
  SourceFile,
  SourceLayer,
  Theme,
  ThemedValue,
  TokenGraph,
  TokenId,
  TokenNode,
} from "./token-graph.js";

const BUILDER_VERSION = "0.1.0";

const NUMBER_UNIT_MAP: ReadonlyArray<{ match: RegExp; unit: string }> = [
  { match: /^(spacing|rounded|border|shadow)-/, unit: "px" },
  { match: /^font-size-/, unit: "px" },
  { match: /^line-height-/, unit: "px" },
  { match: /^letter-spacing-/, unit: "px" },
  {
    match: /-(padding|gap|radius|height|width|size|offset|spacing|border)(-|$)/,
    unit: "px",
  },
];

const NO_UNIT: ReadonlyArray<RegExp> = [
  /^font-weight-/,
  /-font-weight$/,
  /-opacity$/,
  /^opacity-/,
  /-line-height$/,
];

const NAME_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^font-weigth/, "font-weight"],
  [/^line-heigth/, "line-height"],
  [/font-weigth\//g, "font-weight/"],
  [/line-heigth\//g, "line-height/"],
];

const SEMANTIC_SOURCES: ReadonlySet<SourceLayer> = new Set(["light", "dark"]);
const PRIMITIVE_SOURCES: ReadonlySet<SourceLayer> = new Set([
  "color",
  "dimension",
  "typography",
]);

// ---------- Pure helpers ----------

function applyNameFixes(s: string): string {
  let out = s;
  for (const [from, to] of NAME_FIXES) out = out.replace(from, to);
  return out;
}

function slug(parts: readonly string[]): string {
  const raw = applyNameFixes(parts.join("/").toLowerCase());
  return raw
    .replace(/[^a-z0-9/_-]+/gi, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferUnit(slugged: string): string {
  for (const re of NO_UNIT) if (re.test(slugged)) return "";
  for (const { match, unit } of NUMBER_UNIT_MAP) {
    if (match.test(slugged)) return unit;
  }
  return "";
}

function round(n: number, p = 3): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

interface FigmaColorValue {
  components: readonly number[];
  alpha?: number;
  hex: string;
}

function colorToCss(val: FigmaColorValue): string {
  if (val.alpha !== undefined && val.alpha < 1) {
    const [r, g, b] = val.components.map((c) => Math.round(c * 255));
    return `rgba(${r}, ${g}, ${b}, ${round(val.alpha, 4)})`;
  }
  return val.hex;
}

function balanceParens(s: string): string {
  const open = (s.match(/\(/g) || []).length;
  const close = (s.match(/\)/g) || []).length;
  return open > close ? s + ")".repeat(open - close) : s;
}

const isCssValueString = (slugged: string): boolean =>
  /^shadow-|-shadow$|-shadow-/.test(slugged);

function formatValue(
  token: RawToken,
  slugged: string,
): { value: string; issue?: GraphIssue["kind"] } {
  const t = token.$type;
  const v = token.$value;
  switch (t) {
    case "color":
      if (
        v &&
        typeof v === "object" &&
        "components" in (v as object) &&
        "hex" in (v as object)
      ) {
        return { value: colorToCss(v as FigmaColorValue) };
      }
      return { value: String(v), issue: "malformed-value" };
    case "number":
    case "dimension": {
      if (typeof v !== "number") return { value: String(v), issue: "malformed-value" };
      const unit = inferUnit(slugged);
      return { value: unit ? `${v}${unit}` : String(v) };
    }
    case "string":
    case "fontFamily":
    case "fontWeight":
    case "duration": {
      const s = String(v);
      if (isCssValueString(slugged)) return { value: balanceParens(s) };
      return { value: /\s/.test(s) ? `"${s}"` : s };
    }
    case "shadow":
      return { value: balanceParens(String(v)) };
    default:
      return { value: String(v), issue: "unknown-type" };
  }
}

// ---------- Walker ----------

interface WalkEntry {
  path: readonly string[];
  token: RawToken;
}

function* walk(
  node: Record<string, unknown>,
  path: readonly string[] = [],
): Generator<WalkEntry> {
  for (const [k, v] of Object.entries(node)) {
    if (k === "$extensions") continue;
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if ("$value" in obj) {
        yield { path: [...path, k], token: obj as unknown as RawToken };
      } else {
        yield* walk(obj, [...path, k]);
      }
    }
  }
}

// ---------- Layer & theme classification ----------

function layerFor(source: SourceLayer): GraphLayer {
  if (PRIMITIVE_SOURCES.has(source)) return "primitive";
  if (SEMANTIC_SOURCES.has(source)) return "semantic";
  return "component"; // global
}

function themeFor(source: SourceLayer): Theme | null {
  if (source === "light") return "light";
  if (source === "dark") return "dark";
  return null;
}

// ---------- Alias index ----------

function buildForwardAliasIndex(
  files: readonly SourceFile[],
): Map<string, TokenId> {
  const idx = new Map<string, TokenId>();
  for (const file of files) {
    for (const { path } of walk(file.data)) {
      const id = slug(path);
      const key = applyNameFixes(path.join("/").toLowerCase());
      if (!idx.has(key)) idx.set(key, id);
    }
  }
  return idx;
}

/**
 * Detects Figma's older string-form aliases like `{button.height-md}`.
 * Returns the rawTarget (with dots) and the lookup key (with slashes,
 * lowercased, name-fixed) so the caller can resolve via the alias index.
 */
function parseCurlyAlias(
  value: unknown,
): { rawTarget: string; key: string } | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m = trimmed.match(/^\{([^{}]+)\}$/);
  if (!m || !m[1]) return null;
  const rawTarget = m[1];
  const key = applyNameFixes(rawTarget.toLowerCase().replace(/\./g, "/"));
  return { rawTarget, key };
}

interface AliasAttempt {
  /** Resolved alias if a target was found in the index. */
  resolved: ResolvedAlias | null;
  /**
   * Original target string (from aliasData or curly-brace $value), or
   * null if no alias resolution was attempted at all.
   */
  rawTarget: string | null;
}

function resolveAliasFor(
  token: RawToken,
  aliasIndex: ReadonlyMap<string, TokenId>,
): AliasAttempt {
  const ext = token.$extensions?.["com.figma.aliasData"];
  if (ext?.targetVariableName) {
    const rawTarget = ext.targetVariableName;
    const key = applyNameFixes(rawTarget.toLowerCase());
    const to = aliasIndex.get(key);
    return { resolved: to ? { to, rawTarget } : null, rawTarget };
  }
  const curly = parseCurlyAlias(token.$value);
  if (curly) {
    const to = aliasIndex.get(curly.key);
    return {
      resolved: to ? { to, rawTarget: curly.rawTarget } : null,
      rawTarget: curly.rawTarget,
    };
  }
  return { resolved: null, rawTarget: null };
}

// ---------- Node assembly ----------

interface DraftNode {
  id: TokenId;
  path: readonly string[];
  type: RawToken["$type"];
  layer: GraphLayer;
  source: SourceLayer;
  description?: string;
  collection?: string;
  cssValue: ThemedValue;
  rawValue: { base?: unknown; light?: unknown; dark?: unknown };
  alias: {
    base?: ResolvedAlias;
    light?: ResolvedAlias;
    dark?: ResolvedAlias;
  };
  themes: Set<Theme>;
}

function assembleNodes(
  files: readonly SourceFile[],
  aliasIndex: ReadonlyMap<string, TokenId>,
  issues: GraphIssue[],
): Map<TokenId, TokenNode> {
  const drafts = new Map<TokenId, DraftNode>();

  for (const file of files) {
    const theme = themeFor(file.name);
    const layer = layerFor(file.name);

    for (const { path, token } of walk(file.data)) {
      const id = slug(path);
      const slugged = id;
      const formatted = formatValue(token, slugged);
      const aliasAttempt = resolveAliasFor(token, aliasIndex);
      const alias = aliasAttempt.resolved;
      // Only emit malformed-value when no resolved alias shadows the
      // literal cssValue — otherwise the literal is unused in the output.
      if (formatted.issue && !alias) {
        issues.push({
          kind: formatted.issue,
          nodeId: id,
          path,
          message: `${formatted.issue} for ${id} (type=${token.$type})`,
        });
      }
      if (!alias && aliasAttempt.rawTarget) {
        issues.push({
          kind: "unresolved-alias",
          nodeId: id,
          path,
          message: `unresolved alias: ${aliasAttempt.rawTarget}`,
          target: aliasAttempt.rawTarget,
        });
      }

      const existing = drafts.get(id);
      if (existing) {
        // Same id from another source — should only happen for semantic
        // light + dark variants. Anything else is a duplicate.
        if (theme && existing.layer === "semantic") {
          existing.cssValue[theme] = formatted.value;
          existing.rawValue[theme] = token.$value;
          if (alias) existing.alias[theme] = alias;
          existing.themes.add(theme);
        } else {
          issues.push({
            kind: "duplicate-id",
            nodeId: id,
            path,
            message: `duplicate id ${id} from source ${file.name}`,
          });
        }
        continue;
      }

      const draft: DraftNode = {
        id,
        path,
        type: token.$type,
        layer,
        source: file.name,
        description: token.$description,
        collection: token.$extensions?.["com.figma.collectionName"],
        cssValue: {},
        rawValue: {},
        alias: {},
        themes: new Set<Theme>(),
      };
      if (theme) {
        draft.cssValue[theme] = formatted.value;
        draft.rawValue[theme] = token.$value;
        if (alias) draft.alias[theme] = alias;
        draft.themes.add(theme);
      } else {
        draft.cssValue.base = formatted.value;
        draft.rawValue.base = token.$value;
        if (alias) draft.alias.base = alias;
      }
      drafts.set(id, draft);
    }
  }

  // Freeze drafts into TokenNodes.
  const nodes = new Map<TokenId, TokenNode>();
  for (const [id, d] of drafts) {
    nodes.set(id, {
      id: d.id,
      path: d.path,
      type: d.type,
      layer: d.layer,
      themes: Object.freeze([...d.themes]),
      cssValue: Object.freeze({ ...d.cssValue }),
      rawValue: Object.freeze({ ...d.rawValue }),
      alias: Object.freeze({ ...d.alias }),
      source: d.source,
      description: d.description,
      collection: d.collection,
    });
  }
  return nodes;
}

// ---------- Reverse alias index ----------

function buildReverseAliasIndex(
  nodes: ReadonlyMap<TokenId, TokenNode>,
): Map<TokenId, TokenId[]> {
  const reverse = new Map<TokenId, TokenId[]>();
  const push = (target: TokenId, from: TokenId) => {
    const list = reverse.get(target);
    if (list) {
      if (!list.includes(from)) list.push(from);
    } else {
      reverse.set(target, [from]);
    }
  };
  for (const node of nodes.values()) {
    for (const variant of [node.alias.base, node.alias.light, node.alias.dark]) {
      if (variant) push(variant.to, node.id);
    }
  }
  return reverse;
}

// ---------- Public entry ----------

export const buildGraph: BuildGraph = (sources) => {
  const issues: GraphIssue[] = [];
  const aliasIndex = buildForwardAliasIndex(sources);
  const nodes = assembleNodes(sources, aliasIndex, issues);
  const reverseAliases = buildReverseAliasIndex(nodes);

  const graph: TokenGraph = {
    nodes,
    aliasIndex,
    reverseAliases,
    issues: Object.freeze([...issues]),
    sources: Object.freeze(sources.map((s) => s.name)),
    meta: Object.freeze({
      builtAt: new Date().toISOString(),
      builderVersion: BUILDER_VERSION,
    }),
  };
  return graph;
};

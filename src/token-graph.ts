// Token-Graph-Contract — single internal data structure for the
// Figma → Nuxt UI v4 adapter tool.
//
// Both the adapter output (tokens.css, app.config.ts) and the inspector/
// preview UI render over this graph. Build it once from the dropped Figma
// W3C JSON files; never mutate it — produce a new graph for new input.

// ---------- Source layer (raw Figma W3C DTCG input) ----------

export type TokenType =
  | "color"
  | "number"
  | "string"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "duration"
  | "shadow";

export interface FigmaAliasData {
  /** Figma's slash-path reference, e.g. "color/blue/600". */
  targetVariableName?: string;
  /** Other Figma-specific metadata we pass through but don't rely on. */
  [k: string]: unknown;
}

export interface RawToken {
  $type: TokenType;
  $value: unknown;
  $description?: string;
  $extensions?: {
    "com.figma.aliasData"?: FigmaAliasData;
    "com.figma.collectionName"?: string;
    [k: string]: unknown;
  };
}

/** A loaded Figma export file, e.g. color.tokens.json. */
export interface SourceFile {
  /** Logical layer name: color | dimension | typography | light | dark | global. */
  name: SourceLayer;
  /** Parsed JSON contents, nested as exported by Figma. */
  data: Record<string, unknown>;
}

export type SourceLayer =
  | "color"
  | "dimension"
  | "typography"
  | "light"
  | "dark"
  | "global";

// ---------- Graph layer (normalized, addressable, immutable) ----------

/** Graph layer corresponds to the role in the cascade, not the source file. */
export type GraphLayer = "primitive" | "semantic" | "component";

/** A semantic theme variant. Empty array = layer-agnostic (primitives). */
export type Theme = "light" | "dark";

/** Stable identifier — kebab-case slug, identical to the CSS var without `--`. */
export type TokenId = string;

/** Reference to another node in the graph (resolved alias). */
export interface ResolvedAlias {
  /** Target node id within this graph. */
  to: TokenId;
  /** Original Figma path for traceability in the inspector. */
  rawTarget: string;
}

/**
 * Theme-aware value pair. Used for Semantic-layer nodes where the same
 * id resolves to different values under light vs dark. For
 * Primitive/Component layers (no theme variance), only `base` is set.
 */
export interface ThemedValue {
  /** Value when no theme variant applies (or the only variant). */
  base?: string;
  /** Value under the light theme — set only for Semantic-layer nodes. */
  light?: string;
  /** Value under the dark theme — set only for Semantic-layer nodes. */
  dark?: string;
}

/** A single normalized node. Immutable — clone the graph to change anything. */
export interface TokenNode {
  /** Stable kebab-case id (also the CSS var name without `--`). */
  id: TokenId;
  /** Original slash-separated Figma path, preserved for inspector display. */
  path: readonly string[];
  /** W3C type from the source. */
  type: TokenType;
  /** Which cascade layer this belongs to. */
  layer: GraphLayer;
  /** Which themes this node participates in. `[]` = no theme variant. */
  themes: readonly Theme[];
  /**
   * Resolved CSS-ready values, keyed by theme. The UI selects `light` /
   * `dark` for theme-switching without rebuilding the graph; renderers
   * read whichever variants are present and emit accordingly.
   */
  cssValue: ThemedValue;
  /** Raw $value(s) from source. Theme-aware in the same way as cssValue. */
  rawValue: { base?: unknown; light?: unknown; dark?: unknown };
  /**
   * Resolved alias target(s), if this node references another. Theme-aware
   * because semantic light/dark may alias to different primitives.
   */
  alias: { base?: ResolvedAlias; light?: ResolvedAlias; dark?: ResolvedAlias };
  /** Source layer this node was read from (color/light/global/...). */
  source: SourceLayer;
  /** Optional human description from $description. */
  description?: string;
  /** Figma collection this token was authored in (e.g. "components/custom"), if present. */
  collection?: string;
}

/** Reverse-lookup index: which nodes alias *to* a given target id. */
export type ReverseAliasIndex = ReadonlyMap<TokenId, readonly TokenId[]>;

/** Issues surfaced during build — shown in the inspector, never thrown. */
export interface GraphIssue {
  kind:
    | "unresolved-alias"
    | "duplicate-id"
    | "unknown-type"
    | "malformed-value";
  /** Node id this issue is attached to (if any). */
  nodeId?: TokenId;
  message: string;
  /** Original path for tracing back to the Figma export. */
  path?: readonly string[];
  /** For unresolved-alias: the raw alias target (slash path) that could not be resolved. */
  target?: string;
}

/** The complete, immutable graph — single source of truth for all renderers. */
export interface TokenGraph {
  /** All nodes keyed by their id, insertion-ordered by build pass. */
  readonly nodes: ReadonlyMap<TokenId, TokenNode>;
  /** Forward alias index: target raw-path/lowercase-key → node id. */
  readonly aliasIndex: ReadonlyMap<string, TokenId>;
  /** Reverse alias index for inspector "used by" view. */
  readonly reverseAliases: ReverseAliasIndex;
  /** Build-time issues. Empty array = clean build. */
  readonly issues: readonly GraphIssue[];
  /** Source files this graph was built from. */
  readonly sources: readonly SourceFile["name"][];
  /** Build metadata (timestamp, version) for cache busting in the UI. */
  readonly meta: {
    readonly builtAt: string;
    readonly builderVersion: string;
  };
}

// ---------- Scanner report types (PR 4) ----------

export type ScanSeverity = "error" | "warning" | "hint";

export type ScanCategory =
  | "data-quality"
  | "classification-hint"
  | "build-time";

export interface ScanIssue {
  /** Stable id for UI keying and click-to-highlight. */
  id: string;
  category: ScanCategory;
  severity: ScanSeverity;
  /** Sub-kind within category. Used for grouping in the UI. */
  kind: string;
  /** Human-readable message. */
  message: string;
  /** Token ids affected by this issue. */
  tokenIds: readonly string[];
  /** Component name when the issue is component-scoped. */
  componentName?: string;
  /** For component-looks-custom: the foreign part-segments (sub-element slots). */
  customParts?: readonly string[];
  /** Variant key (e.g. "sm") when the issue is variant-scoped. */
  variantKey?: string;
  /** For possible-typo: the typo'd path segment and its suggested correction. */
  typoFrom?: string;
  typoTo?: string;
  /** For asymmetric-variant-coverage: the exact token names to add in Figma. */
  figmaFixTokens?: readonly string[];
  /** For snap-to-tailwind: the suggested Tailwind-aligned value to snap to (e.g. "14px"). */
  snapTo?: string;
}

export interface CompletenessScore {
  component: string;
  axis: "size" | "color";
  variantKey: string;
  defined: number;
  total: number;
  missingUtilities: readonly string[];
}

export interface OutputForecast {
  tokensCss: {
    estimatedBytes: number;
    tailwindMatches: number;
    themeExtensions: number;
    modeVariantEntries: number;
  };
  components: ReadonlyArray<{
    name: string;
    inAllowList: boolean;
    variants: readonly CompletenessScore[];
  }>;
  unmappedComponentPrefixes: readonly string[];
  nonComponentPrefixes: readonly string[];
}

export interface ScanReport {
  issues: readonly ScanIssue[];
  completeness: readonly CompletenessScore[];
  forecast: OutputForecast;
  /** When the scan was produced (epoch ms). Used for cache busting in UI. */
  generatedAt: number;
}

// ---------- Builder & renderer contracts ----------

/**
 * Pure builder: SourceFile[] → TokenGraph.
 * Must not throw on malformed input — emit GraphIssue instead so the
 * inspector can show partial results.
 */
export type BuildGraph = (sources: readonly SourceFile[]) => TokenGraph;

/**
 * Maps a TokenId to the line number(s) where that token appears in a
 * rendered text artifact. Lines are 1-based to match editor conventions.
 * A token may appear on multiple lines (e.g. light + dark sections in
 * tokens.css), hence the readonly array.
 */
export type LineMap = ReadonlyMap<TokenId, readonly number[]>;

/** A rendered text artifact plus the line map for cross-highlighting. */
export interface RenderedText {
  readonly text: string;
  readonly lines: LineMap;
}

/**
 * A renderer takes the immutable graph and produces an output artifact.
 * Adapter outputs (tokens.css, app.config.ts) and inspector views are
 * both renderers — they never mutate the graph.
 */
export interface Renderer<T> {
  readonly id: string;
  render(graph: TokenGraph): T;
}

/**
 * Text renderers (CSS, TS, app.config.ts) are the common case. They
 * return both the rendered string and a LineMap so the inspector can
 * scroll to and highlight the line(s) for the currently-selected token.
 */
export type TextRenderer = Renderer<RenderedText>;

// Figma component mapping — links token-prefix (e.g. "button") to a
// Figma node so the inspector can embed/screenshot it next to the
// selected token's detail. Populated at dev-time via the Figma MCP
// sync script (see scripts/sync-figma.md) and shipped as a static
// JSON file under /public/figma-mapping.json.

export interface FigmaComponentVariant {
  /** Display name (e.g. "State=default, Style=solid"). */
  name: string;
  /** Figma node id (`10:1077`). */
  nodeId: string;
  /** Optional pre-baked screenshot path (under /public). */
  screenshot?: string;
  /** Token ids consumed by this variant — slug-matched against the graph. */
  tokensUsed: readonly string[];
}

export interface FigmaComponentMapping {
  /** Token-prefix this Figma node represents (e.g. "button", "input"). */
  prefix: string;
  /** Human-readable label for the inspector header. */
  label: string;
  /** Full Figma node URL (figma.com/design/<fileKey>/...?node-id=...). */
  url: string;
  /** Optional pre-baked screenshot path (under /public). */
  screenshot?: string;
  /** Optional variant list — populated by the MCP sync runbook. */
  variants?: readonly FigmaComponentVariant[];
}

export interface FigmaMappingFile {
  /** Source Figma file URL — informational only. */
  source?: string;
  /** Last sync timestamp — informational only. */
  syncedAt?: string;
  /**
   * Optional fallback URL used when no per-component mapping matches the
   * selected token. Lets users see the source file's main canvas even
   * without a pre-baked sync.
   */
  fileFallbackUrl?: string;
  /** The actual component-prefix mappings. */
  components: readonly FigmaComponentMapping[];
}

const EMPTY: FigmaMappingFile = { components: [] };

/**
 * Loads the static mapping file. Resolves to an empty mapping when the
 * file is missing or invalid — figma previews are an optional feature,
 * the inspector must work without them.
 */
export async function loadFigmaMapping(): Promise<FigmaMappingFile> {
  try {
    const res = await fetch("/figma-mapping.json");
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<FigmaMappingFile>;
    if (!Array.isArray(data.components)) return EMPTY;
    return {
      source: data.source,
      syncedAt: data.syncedAt,
      components: data.components,
    };
  } catch {
    return EMPTY;
  }
}

/** Convert a figma.com node URL into the iframe embed src. */
export function toEmbedSrc(figmaUrl: string): string {
  const encoded = encodeURIComponent(figmaUrl);
  return `https://www.figma.com/embed?embed_host=token-inspector&url=${encoded}`;
}

/**
 * Parses a pasted Figma file URL and returns a normalized base URL.
 * Returns null for malformed input.
 */
export function parseFigmaFileUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!u.hostname.endsWith("figma.com")) return null;
    if (!/^\/(design|file|board|make)\//.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}


/** Find the mapping that best matches a token id by prefix-longest-match. */
export function matchMapping(
  mapping: FigmaMappingFile,
  tokenId: string,
): FigmaComponentMapping | null {
  let best: FigmaComponentMapping | null = null;
  for (const c of mapping.components) {
    const pref = `${c.prefix}-`;
    if (tokenId === c.prefix || tokenId.startsWith(pref)) {
      if (!best || c.prefix.length > best.prefix.length) best = c;
    }
  }
  return best;
}

/** Reverse index: token id → variants that consume it (across all components). */
export type TokenToVariants = ReadonlyMap<
  string,
  ReadonlyArray<{ component: FigmaComponentMapping; variant: FigmaComponentVariant }>
>;

export function buildTokenToVariants(mapping: FigmaMappingFile): TokenToVariants {
  const out = new Map<
    string,
    Array<{ component: FigmaComponentMapping; variant: FigmaComponentVariant }>
  >();
  for (const c of mapping.components) {
    if (!c.variants) continue;
    for (const v of c.variants) {
      for (const id of v.tokensUsed) {
        const list = out.get(id);
        const entry = { component: c, variant: v };
        if (list) list.push(entry);
        else out.set(id, [entry]);
      }
    }
  }
  return out;
}

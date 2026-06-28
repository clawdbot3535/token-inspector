import type { SourceFile, SourceLayer } from "./token-graph.js";

/**
 * Validate + parse one Figma token export's contents into a SourceFile. Pure — the
 * caller does the IO and passes `content` (or `null` when the file is missing). Fails
 * fast with a clear, file-named message for a missing file, malformed JSON, or a
 * non-object payload, rather than a bare ENOENT / SyntaxError.
 */
export function parseSourceFile(name: SourceLayer, file: string, content: string | null): SourceFile {
  if (content === null) {
    throw new Error(
      `Cannot read token file "${file}": not found. ` +
        `Run the Figma token-export plugin and place the *.tokens.json files in components/.`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    throw new Error(`Token file "${file}" is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      `Token file "${file}" must be a JSON object of tokens, got ${Array.isArray(data) ? "an array" : typeof data}.`,
    );
  }
  return { name, data: data as Record<string, unknown> };
}

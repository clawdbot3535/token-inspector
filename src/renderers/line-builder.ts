// Small helper for renderers that accumulate text line-by-line and
// record which TokenId(s) appear on which 1-based line number.

import type { LineMap, RenderedText, TokenId } from "../token-graph.js";

export class LineBuilder {
  private readonly lines: string[] = [];
  private readonly map = new Map<TokenId, number[]>();

  /** Append a line of text without associating it with any token. */
  push(line: string): void {
    this.lines.push(line);
  }

  /** Append a line and record that it represents the given token id. */
  pushWithToken(line: string, id: TokenId): void {
    this.lines.push(line);
    const lineNo = this.lines.length;
    const list = this.map.get(id);
    if (list) list.push(lineNo);
    else this.map.set(id, [lineNo]);
  }

  /** Append a blank line. */
  blank(): void {
    this.lines.push("");
  }

  build(): RenderedText {
    const frozenMap: LineMap = new Map(
      [...this.map].map(([k, v]) => [k, Object.freeze([...v])]),
    );
    return {
      text: this.lines.join("\n"),
      lines: frozenMap,
    };
  }
}

import { describe, it, expect } from "vitest";
import {
  buildTokenToVariants,
  matchMapping,
  parseFigmaFileUrl,
  toEmbedSrc,
  type FigmaMappingFile,
} from "./figma-mapping.js";

const sample: FigmaMappingFile = {
  components: [
    { prefix: "button", label: "Button", url: "https://www.figma.com/design/abc/Library?node-id=1-2" },
    { prefix: "button-solid", label: "Button (Solid)", url: "https://www.figma.com/design/abc/Library?node-id=1-3" },
    { prefix: "input", label: "Input", url: "https://www.figma.com/design/abc/Library?node-id=1-4" },
  ],
};

describe("matchMapping", () => {
  it("matches the longest prefix when several apply", () => {
    expect(matchMapping(sample, "button-solid-bg")?.prefix).toBe("button-solid");
  });

  it("falls back to the shorter prefix when the longer one does not apply", () => {
    expect(matchMapping(sample, "button-radius")?.prefix).toBe("button");
  });

  it("returns null when no prefix matches", () => {
    expect(matchMapping(sample, "color-blue-600")).toBeNull();
  });

  it("matches the exact prefix-only token id", () => {
    expect(matchMapping(sample, "button")?.prefix).toBe("button");
  });
});

describe("buildTokenToVariants", () => {
  const withVariants: FigmaMappingFile = {
    components: [
      {
        prefix: "button",
        label: "Button",
        url: "https://www.figma.com/design/abc/Library?node-id=1-2",
        variants: [
          {
            name: "Solid / default",
            nodeId: "9:69",
            tokensUsed: ["button-solid-bg", "button-radius"],
          },
          {
            name: "Outline / default",
            nodeId: "9:70",
            tokensUsed: ["button-outline-border", "button-radius"],
          },
        ],
      },
    ],
  };

  it("indexes variants by token id", () => {
    const idx = buildTokenToVariants(withVariants);
    expect(idx.get("button-solid-bg")?.length).toBe(1);
    expect(idx.get("button-radius")?.length).toBe(2);
    expect(idx.get("button-outline-border")?.length).toBe(1);
  });

  it("returns no entry for tokens not consumed", () => {
    const idx = buildTokenToVariants(withVariants);
    expect(idx.get("color-blue-600")).toBeUndefined();
  });

  it("preserves component+variant link in entries", () => {
    const idx = buildTokenToVariants(withVariants);
    const entries = idx.get("button-radius") ?? [];
    expect(entries.map((e) => e.variant.name)).toEqual([
      "Solid / default",
      "Outline / default",
    ]);
    expect(entries.every((e) => e.component.prefix === "button")).toBe(true);
  });
});

describe("parseFigmaFileUrl", () => {
  it("accepts standard /design/ URLs", () => {
    const u = parseFigmaFileUrl(
      "https://www.figma.com/design/h5QnKt8fjvkm1awcXRJNDy/MM?node-id=0-1",
    );
    expect(u).toContain("figma.com/design/h5QnKt8fjvkm1awcXRJNDy");
  });

  it("accepts /file/ URLs", () => {
    expect(parseFigmaFileUrl("https://www.figma.com/file/abc/Lib")).not.toBeNull();
  });

  it("rejects non-figma URLs", () => {
    expect(parseFigmaFileUrl("https://example.com/design/abc")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseFigmaFileUrl("not a url")).toBeNull();
    expect(parseFigmaFileUrl("")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseFigmaFileUrl("  https://www.figma.com/design/abc/Lib  ")).not.toBeNull();
  });
});

describe("toEmbedSrc", () => {
  it("wraps a figma URL in the embed scheme", () => {
    const src = toEmbedSrc("https://www.figma.com/design/abc/Library?node-id=1-2");
    expect(src).toMatch(/^https:\/\/www\.figma\.com\/embed\?embed_host=token-inspector&url=/);
    expect(decodeURIComponent(src)).toContain("https://www.figma.com/design/abc/Library?node-id=1-2");
  });
});

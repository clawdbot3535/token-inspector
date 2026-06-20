import { describe, it, expect } from "vitest";
import { buildGraph } from "../../build-graph.js";
import type { SourceFile } from "../../token-graph.js";
import { buildKitGallery } from "./kit-gallery.js";

function multiCompGraph() {
  const sources: SourceFile[] = [
    {
      name: "global",
      data: {
        button: { radius: { $value: 8, $type: "dimension" } },
        badge: { radius: { $value: 4, $type: "dimension" } },
      },
    },
  ];
  return buildGraph(sources);
}

describe("buildKitGallery", () => {
  it("produces a Vue SFC wrapping the gallery in <UApp> and a section per present component", () => {
    const sfc = buildKitGallery(multiCompGraph());
    expect(sfc).toContain("<UApp>");
    expect(sfc).toContain("<UButton");
    expect(sfc).toContain("<UBadge");
    expect(sfc).toContain('data-component="button"'); // section marker
  });
  it("omits a section for a component absent from the export", () => {
    const sfc = buildKitGallery(multiCompGraph());
    expect(sfc).not.toContain('data-component="accordion"');
  });
});

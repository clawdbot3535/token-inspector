// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildUsageGuide } from "./usage.js";

describe("buildUsageGuide", () => {
  const md = buildUsageGuide();

  it("has a titled section per target with its key usage hint", () => {
    expect(md).toContain("# Using this export");
    // Nuxt UI
    expect(md).toContain("Nuxt UI");
    expect(md).toContain("app.config.ts");
    expect(md).toContain("npm run dev"); // kit preview
    // shadcn
    expect(md).toContain("shadcn/ui");
    expect(md).toContain("globals.css");
    // generic trio
    expect(md).toContain("tokens/variables.css");
    expect(md).toContain("tokens/tokens.json");
    expect(md).toContain('import { tokens }'); // tokens.ts hint
    // cross-reference to the diagnostic report
    expect(md).toContain("REPORT.md");
  });
});

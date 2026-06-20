// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The "Live Build" StackBlitz embed runs a WebContainer, which only boots when
// the host page is `crossOriginIsolated`. That requires COOP `same-origin` +
// COEP (`credentialless`, so the cross-origin stackblitz.com embed iframe loads
// without CORP). vercel.json carries these for production; vite.config.ts mirrors
// them for the dev/preview servers. This guards the production header config from
// a silent regression that would break the embed.
describe("vercel.json cross-origin isolation headers", () => {
  const cfg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../vercel.json", import.meta.url)), "utf8"),
  ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };

  it("sets COOP same-origin + COEP credentialless on all routes", () => {
    const rule = cfg.headers.find((h) => h.source === "/(.*)");
    expect(rule, "expected a catch-all /(.*) header rule").toBeDefined();
    const map = Object.fromEntries(rule!.headers.map((h) => [h.key, h.value]));
    expect(map["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(map["Cross-Origin-Embedder-Policy"]).toBe("credentialless");
  });
});

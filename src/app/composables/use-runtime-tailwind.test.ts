// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ensureRuntimeTailwind } from "./use-runtime-tailwind.js";

describe("ensureRuntimeTailwind", () => {
  beforeEach(() => {
    document.querySelectorAll('style[type="text/tailwindcss"]').forEach((el) => el.remove());
  });

  it("injects the tailwind activation import", async () => {
    await ensureRuntimeTailwind();
    const el = document.querySelector('style[type="text/tailwindcss"]');
    expect(el?.textContent).toContain('@import "tailwindcss"');
  });

  it("is idempotent: a second call does not add a second activation block", async () => {
    await ensureRuntimeTailwind();
    await ensureRuntimeTailwind();
    expect(document.querySelectorAll('style[type="text/tailwindcss"]').length).toBe(1);
  });
});

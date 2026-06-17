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

  it("declares class-based dark mode so the runtime compiler matches the app's .dark toggle", async () => {
    // Without this, the bare @import defaults to prefers-color-scheme dark, so the runtime
    // compiler regenerates the app chrome's `dark:` utilities as @media rules that fire under a
    // dark OS — flipping SKIP tags / code preview to dark even with the app's light toggle on.
    await ensureRuntimeTailwind();
    const el = document.querySelector('style[type="text/tailwindcss"]');
    expect(el?.textContent).toContain("@custom-variant dark (&:where(.dark, .dark *))");
  });

  it("is idempotent: a second call does not add a second activation block", async () => {
    await ensureRuntimeTailwind();
    await ensureRuntimeTailwind();
    expect(document.querySelectorAll('style[type="text/tailwindcss"]').length).toBe(1);
  });
});

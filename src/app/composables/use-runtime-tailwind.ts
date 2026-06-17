// Lazily boots the Tailwind v4 *runtime* compiler (@tailwindcss/browser) so the
// generated recipe's arbitrary classes (e.g. `bg-[var(--button-bg)]`, `rounded-[8px]`)
// — produced at runtime from dropped tokens and therefore never seen by the build-time
// compiler — get real CSS. The token `var(--…)` values come from the existing
// useInjectedTokensCss (@theme→:root). Browser-only; a no-op without a document
// (jsdom/SSR guard) except for the activation block the unit test asserts.

const ACTIVATION_ID = "inspector-tailwind-runtime-activation";
let booted: Promise<void> | null = null;

/** Ensure the runtime compiler is loaded and its activation block is present. Idempotent. */
export function ensureRuntimeTailwind(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!document.getElementById(ACTIVATION_ID)) {
    const style = document.createElement("style");
    style.id = ACTIVATION_ID;
    style.setAttribute("type", "text/tailwindcss");
    style.textContent = '@import "tailwindcss";';
    document.head.appendChild(style);
  }
  if (booted === null) {
    // Dynamic import keeps the compiler out of the main bundle and out of jsdom.
    // Importing @tailwindcss/browser installs a DOM observer that compiles utility
    // classes (incl. arbitrary values) found in the document against the activation block.
    booted = import("@tailwindcss/browser").then(() => undefined).catch(() => undefined);
  }
  return booted;
}

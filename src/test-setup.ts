// Vitest setup: restore `localStorage` in the jsdom test environment.
//
// Node 22+ exposes a native `localStorage` global that returns `undefined`
// unless the process is started with `--localstorage-file`. Under Node 26 this
// native, non-configurable global shadows jsdom's own `localStorage` inside
// Vitest's jsdom environment (while `sessionStorage` — with no active native
// Node counterpart here — comes through normally). Component tests that touch
// `localStorage` then hit `undefined`.
//
// This setup runs before every test file. It only acts in a DOM-like
// environment (`window` present) where `localStorage` is missing, installing a
// minimal in-memory Storage. Node-environment engine tests have no `window`
// and are left untouched.

if (typeof window !== "undefined" && typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };

  const descriptor: PropertyDescriptor = {
    value: memoryStorage,
    configurable: true,
    writable: true,
  };
  Object.defineProperty(globalThis, "localStorage", descriptor);
  Object.defineProperty(window, "localStorage", descriptor);
}

// ---------------------------------------------------------------------------
// @tailwindcss/browser (booted by the real-component Kit mount tests) injects
// compiled CSS that jsdom's lenient parser rejects asynchronously with
// "Could not parse CSS stylesheet". The error is harmless (the tests assert on
// recipe output, not computed styles) but escapes as an unhandled rejection,
// which makes Vitest exit non-zero even when every test passes. Swallow ONLY
// this known-benign error; re-surface everything else as an uncaught exception
// so real unhandled rejections still fail the run.
// ---------------------------------------------------------------------------
export function isBenignCssParseError(reason: unknown): boolean {
  return reason instanceof Error && reason.message.includes("Could not parse CSS stylesheet");
}

const REJECTION_GUARD = "__benignCssRejectionHandlerInstalled__";
if (!(globalThis as Record<string, unknown>)[REJECTION_GUARD]) {
  (globalThis as Record<string, unknown>)[REJECTION_GUARD] = true;
  const proc = (globalThis as Record<string, unknown>)["process"] as
    | { on: (event: string, handler: (reason: unknown) => void) => void }
    | undefined;
  proc?.on("unhandledRejection", (reason: unknown) => {
    if (isBenignCssParseError(reason)) return;
    throw reason;
  });
}

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

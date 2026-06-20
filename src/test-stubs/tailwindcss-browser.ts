// Test stub for `@tailwindcss/browser`, aliased in vitest.config.ts.
//
// The real module installs a DOM observer that compiles Tailwind utilities at
// runtime by injecting a <style> element. jsdom then chokes parsing that
// Tailwind v4 CSS ("Could not parse CSS stylesheet"), and the failure surfaces
// as an unhandled promise rejection — which makes Vitest exit non-zero even
// when every test passes (the count is timing-dependent, so it fails the
// pre-commit hook intermittently). The real-component Kit mount tests assert on
// recipe output and DOM structure, NOT computed styles, so replacing the runtime
// compiler with a no-op in tests changes nothing they check while removing the
// error at its source. `use-runtime-tailwind.ts` imports this only for its
// side effect (`import("@tailwindcss/browser").then(() => undefined)`).
export {};

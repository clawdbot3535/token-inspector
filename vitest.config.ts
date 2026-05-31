import { defineConfig, type Plugin } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  // The Vue plugin compiles .vue SFCs so component tests can mount them.
  // Engine tests stay in the default "node" environment; component test files
  // opt into jsdom per-file via a `// @vitest-environment jsdom` docblock.
  //
  // Cast: vitest 2.x bundles vite 5 internally while the project uses vite 6,
  // so `vue()` (typed against vite 6) is nominally — not structurally —
  // incompatible with the vite-5 PluginOption that vitest/config's defineConfig
  // expects. The instance is identical at runtime. Drop the cast once vitest is
  // on vite 6 (vitest >= 3).
  plugins: [vue() as unknown as Plugin],
  resolve: {
    alias: {
      "@": new URL("./src/app", import.meta.url).pathname,
      "@core": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

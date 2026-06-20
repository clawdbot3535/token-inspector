export const KIT_PACKAGE_JSON =
  JSON.stringify(
    {
      name: "design-kit",
      private: true,
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: {
        vue: "^3.5.0",
        "vue-router": "4.6.4",
        "@nuxt/ui": "^4.0.0",
      },
      devDependencies: {
        "@tailwindcss/vite": "^4.0.0",
        tailwindcss: "^4.0.0",
        "@vitejs/plugin-vue": "^5.2.0",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  ) + "\n";

export const KIT_VITE_CONFIG = `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import ui from "@nuxt/ui/vite";
import { theme } from "./theme";

export default defineConfig({
  plugins: [vue(), tailwindcss(), ui({ ui: theme })],
});
`;

export const KIT_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design Kit</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

export const KIT_MAIN_TS = `import { createApp } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./main.css";

const app = createApp(App);
app.use(createRouter({ history: createMemoryHistory(), routes: [] }));
app.use(ui);
app.mount("#app");
`;

export const KIT_MAIN_CSS = `@import "tailwindcss";
@import "../tokens.css";
@import "@nuxt/ui";

@source "./**/*.{vue,ts}";
`;

const FENCE = "```";
export const KIT_README = `# Design Kit

A runnable Vite + Vue 3 + @nuxt/ui project generated from your token export. The components
are themed by your tokens via the real build-time Tailwind compiler — this is the literal product.

## Run

${FENCE}bash
npm install
npm run dev
${FENCE}

\`theme.ts\` holds your generated \`ui\` theme (colours + component overrides), applied globally via the
\`@nuxt/ui\` Vite plugin in \`vite.config.ts\`. \`tokens.css\` holds your design tokens (compiled at build time).
`;

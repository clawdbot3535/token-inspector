import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import ui from "@nuxt/ui/vite";
import pkg from "./package.json" with { type: "json" };

// 100% client-side SPA: no SSR, no API routes. Static-deployable to any
// host (GitHub Pages, Vercel static, S3+CloudFront).
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    tailwindcss(),
    ui({
      ui: {
        colors: {
          primary: "blue",
          neutral: "zinc",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": new URL("./src/app", import.meta.url).pathname,
      "@core": new URL("./src", import.meta.url).pathname,
    },
  },
});

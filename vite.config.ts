import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import ui from "@nuxt/ui/vite";

// 100% client-side SPA: no SSR, no API routes. Static-deployable to any
// host (GitHub Pages, Vercel static, S3+CloudFront).
export default defineConfig({
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

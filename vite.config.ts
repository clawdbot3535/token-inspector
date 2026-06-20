import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import ui from "@nuxt/ui/vite";
import pkg from "./package.json" with { type: "json" };
import { execSync } from "node:child_process";

function countUnpushedCommits(): number {
  try {
    return (
      parseInt(
        execSync("git rev-list --count origin/main..HEAD", {
          stdio: ["ignore", "pipe", "ignore"],
        })
          .toString()
          .trim(),
        10,
      ) || 0
    );
  } catch {
    return 0;
  }
}

// 100% client-side SPA: no SSR, no API routes. Static-deployable to any
// host (GitHub Pages, Vercel static, S3+CloudFront).
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_UNPUSHED__: JSON.stringify(countUnpushedCommits()),
  },
  // Cross-origin isolation: the "Live Build" StackBlitz embed runs a
  // WebContainer, which only boots when the host page is `crossOriginIsolated`.
  // Use COEP `credentialless` (not `require-corp`) so the cross-origin
  // stackblitz.com embed iframe loads without needing CORP headers. The
  // inspector loads no cross-origin subresources, so isolation is safe here.
  // Vercel mirrors these headers via vercel.json for production.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
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
  build: {
    rollupOptions: {
      input: {
        inspector: new URL("./index.html", import.meta.url).pathname,
        creator: new URL("./apps/creator/index.html", import.meta.url).pathname,
      },
    },
  },
});

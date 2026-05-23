// Reactively injects the rendered tokens.css into <head> so live previews
// (LiveButton, color swatches, per-token classifications) can resolve the
// `var(--<token-id>)` references emitted by the recipe-engine.
//
// Without this, generated classes like `bg-[var(--color-action-bg)]` paint
// nothing in the Inspector because the CSS variables would never be defined
// in the Vite dev document. The consuming Nuxt project gets its CSS via
// the file write at output/css/tokens.css; the Inspector eats its own
// dog food by mounting the same rendered text directly.

import { watch, onBeforeUnmount } from "vue";
import { tokensCssRenderer } from "@core/renderers/index.js";
import type { TokenGraph } from "@core/token-graph.js";
import type { Ref } from "vue";

const STYLE_ELEMENT_ID = "inspector-injected-tokens-css";

export function useInjectedTokensCss(graph: Ref<TokenGraph | null>): void {
  // SSR safety — bail out when there's no document (tests, SSR pre-render).
  if (typeof document === "undefined") return;

  let styleEl: HTMLStyleElement | null = null;

  const ensureStyleEl = (): HTMLStyleElement => {
    if (styleEl !== null) return styleEl;
    // Re-use any element a hot-reload left behind so we don't stack copies.
    const existing = document.getElementById(STYLE_ELEMENT_ID);
    if (existing instanceof HTMLStyleElement) {
      styleEl = existing;
    } else {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }
    return styleEl;
  };

  watch(
    graph,
    (g) => {
      if (g === null) {
        if (styleEl !== null) styleEl.textContent = "";
        return;
      }
      const rendered = tokensCssRenderer.render(g);
      // The renderer wraps primitives in `@theme { … }` for build-time
      // Tailwind v4 consumption. Browsers don't recognise `@theme` as a
      // runtime rule, so all custom properties inside it stay undefined.
      // Substitute `:root` for the injected copy so live previews can
      // resolve `var(--<token-id>)`. The file written to output/css
      // is untouched.
      const browserCss = rendered.text.replace(/^@theme\s*\{/m, ":root {");
      ensureStyleEl().textContent = browserCss;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (styleEl !== null && styleEl.parentNode !== null) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
  });
}

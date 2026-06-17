# Real-Render Fidelity — Spec 1: compiler-enabled real render — Design

**Date:** 2026-06-17
**Status:** Approved
**Type:** Feature — foundation slice of the render-vs-tokens fidelity check
**Parent:** office-hours direction `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260617-040911.md` (APPROVED, incl. the `:ui`-prop spike + the `@tailwindcss/browser` decision).

## Context

The Coverage Guide answers **breadth** (is a slot designed). The open question it doesn't answer is
**depth**: does my generated `app.config.ts` + `tokens.css` actually render like my design? The
office-hours pass chose a **render-vs-tokens** check — render the real Nuxt UI v4 component with the
generated recipe, read computed styles, diff against the source token values. A spike proved the
foundation and its one hard constraint:

- **Real Nuxt UI v4 components render with readable computed styles** in the inspector (the real
  header `<UButton>` reports `getComputedStyle().borderRadius = 6px`).
- **But arbitrary Tailwind classes injected at runtime don't compile** (`rounded-[7px]` → `0px`).
  The generated recipe is *only* arbitrary classes generated at runtime, so they can never be in the
  build. (This is the JIT pitfall that forced the `Live*` previews into inline-style approximation.)

**Decision:** adopt `@tailwindcss/browser` (the v4 runtime compiler) so the generated classes get CSS
at runtime, and a real `<UButton :ui=generatedRecipe>` renders truthfully.

This spec is **Spec 1 = the foundation only**: the compiler + the real render for **button**, behind
a new "Real" tab. The `getComputedStyle`→token **diff** (the actual verdict) is **Spec 2**.

## Architecture

### 1. Dependency

Add `@tailwindcss/browser` (`^4.0.0`). It is the official browser build of Tailwind v4: loaded in a
page, it scans the live DOM for class names (including arbitrary values like `bg-[var(--button-bg)]`)
and injects the generated CSS. Loaded **lazily** (dynamic `import()`, browser-only) so it never runs
in tests/SSR and doesn't bloat the main bundle.

### 2. `src/app/composables/use-runtime-tailwind.ts` (new)

A composable that, when the Real tab is active, lazy-loads `@tailwindcss/browser` once and lets it
compile the DOM's classes. Mirrors the `use-injected-tokens-css` lifecycle (SSR/jsdom guard:
`if (typeof document === "undefined") return;`). The existing `useInjectedTokensCss` already defines
the `var(--<token-id>)` values (via the `@theme`→`:root` rewrite), so the compiled arbitrary classes
resolve against real token values. No Tailwind config needed for arbitrary values (they compile to
`property: <arbitrary>` directly); default-config utilities are rare in the generated recipes.

### 3. `src/app/components/LiveRealButton.vue` (new)

Renders a **real** `<UButton :ui="{ base, label, leadingIcon }" :variant :size>` where the slot class
strings come from the generated `button` recipe (built via the existing recipe builders that App.vue
already calls). v1 shows the resting/default state for one variant + size (chosen the same way the
existing `LiveButton` picks a representative size). Props: `graph`, `componentName`. Distinct from the
inline-style `LiveButton` — this one is the *real* Nuxt UI component, themed by the generated recipe.

### 4. App.vue wiring

- `paneTab` (line 169) widens from `"preview" | "coverage"` to `"preview" | "coverage" | "real"`.
- A third tab **"Real"** is added to the component-pane tab bar (after Coverage), gated to **button**
  for this slice (a `realRenderSupported` check, initially `selectedComponent === "button"`), with
  `role="tab"`/`aria-selected`/`data-testid="real-tab"` matching the existing tabs.
- When `paneTab === "real"`, mount `<LiveRealButton>` and activate `useRuntimeTailwind`.
- The `watch(selectedComponent)` reset keeps `paneTab` defaulting to `"preview"` on component change.

### 5. Data flow

```
generated button recipe (slot class strings)
   ▶ <UButton :ui="{base,label,…}" variant size>  mounted in the Real tab
   ▶ @tailwindcss/browser compiles the arbitrary classes → CSS
   ▶ tokens.css (:root vars, already injected) resolves var(--…)
   ▶ the real Nuxt UI button paints with the generated tokens
```

## Testing

The feature is intrinsically browser-dependent: **jsdom can't compile Tailwind or resolve `var()`**,
so unit tests cover the **plumbing**, and a **`/browse` smoke check** covers the **fidelity**.

- **Unit (Vitest/jsdom):**
  - `use-runtime-tailwind.test.ts` — the composable is SSR/jsdom-safe (no throw when `document`
    absent), and lazy-loads only when activated (assert the dynamic import is gated, e.g. via a mock).
  - `LiveRealButton.test.ts` — mounts a real `UButton` (stubbed or real) and passes the generated
    recipe's slot classes via the `:ui` prop for the right variant/size (assert the prop shape, not
    computed styles).
  - App tab wiring — selecting `button` shows the **Real** tab; clicking it mounts `LiveRealButton`;
    a non-button component does not show the Real tab; `aria-selected` flips.
- **`/browse` smoke (real browser, manual/scripted):** load a token export, open button → Real tab,
  assert `getComputedStyle` of the rendered `<UButton>` reflects an injected token value
  (e.g. `borderRadius` matches `button-radius`). This is the actual fidelity proof; it lives in
  `/browse`, not jsdom — and Spec 2's diff assertions will live there too.

## Out of scope (Spec 2+)

The `getComputedStyle`→token **diff** + attributed deltas (the verdict); the multi-element
**composites** (the generic seam makes them the immediate follow-on); the full **variant matrix**;
and the **Figma-frame diff** (office-hours Approach B).

## Success criteria

- `@tailwindcss/browser` lazy-loads only in the Real tab.
- Selecting `button` → a **Real** tab renders a real `<UButton>` themed by the generated recipe; a
  `/browse` check shows its computed style reflects the injected tokens (the spike's question,
  answered green).
- Unit suites green; the browser-only fidelity proof documented via `/browse`.

## Release

Minor — a new user-facing "Real" render tab (button). README "Inspector UI" + roadmap note;
test-count bump.

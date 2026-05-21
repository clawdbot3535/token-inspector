# Tailwind-Utility-First Token Output

**Status:** Design — Awaiting Review
**Date:** 2026-05-20
**Project:** token-inspector

## Context

Token Inspector currently emits one CSS Custom Property per Figma design token, regardless of token type or layer. This produces verbose output like:

```css
padding: var(--badge-padding-y-sm, 4px) var(--badge-padding-x-sm, 4px);
```

Three problems:

1. **Runtime cost** — CSS variables resolve at cascade time, not compile time. For static values (padding, radius), this is wasted indirection.
2. **Opacity** — `--badge-padding-y-sm` obscures intent. `py-1` (Tailwind utility) reads better.
3. **Misalignment with Tailwind v4** — Tailwind v4's `@theme` already provides build-time token-to-utility mapping. Emitting custom vars for everything duplicates that layer.

## Goal

Map a Figma design system into a Nuxt environment with minimal friction. Design changes in Figma propagate to the Nuxt app via a single re-run of the build, producing files that drop in cleanly without manual stitching.

## Core Principle

**A token becomes a CSS Custom Property only if its resolved value differs between light and dark mode.** Everything else either matches a Tailwind default (no output) or extends Tailwind's `@theme` as a static value.

| Case | Output |
|---|---|
| Mode-variant (light ≠ dark): semantic colors, shadows | CSS Custom Property in `@theme` + `.dark` override |
| Mode-invariant matching Tailwind default: e.g. `spacing-1 = 4px` | No output — use Tailwind utility directly |
| Mode-invariant not matching Tailwind default: brand colors, custom spacing | `@theme` extension (static value) |
| Component-layer (`badge-padding-y-sm`, `button-bg-default`, …) | Not emitted; resolved at design-system-author time, used by Inspector only |

## Architecture

### Current pipeline (v0.2.0)

```
components/*.tokens.json
       ↓
   build-graph.ts → Token Graph
       ↓
   renderers/css.ts        → output/tokens.css    (every token as CSS var)
   renderers/ts.ts         → output/tokens.ts     (TS export)
   renderers/app-config.ts → output/nuxt-ui.app.config.ts
```

### Target pipeline

```
components/*.tokens.json
       ↓
   build-graph.ts               (unchanged)
       ↓
   classify-token.ts            (NEW: pure classification)
       ↓ Classification[]
       ├─→ renderers/tokens-css.ts → output/css/tokens.css
       ├─→ renderers/app-config.ts → output/nuxt/app.config.ts (minimal)
       └─→ Inspector UI            (live render + LiveButton preview)
```

### New modules

- `src/classify-token.ts` — pure function: token → classification record
- `src/tailwind-defaults.generated.ts` — committed lookup tables for Tailwind v4 defaults (spacing, radius, font-size, font-weight, tracking, leading, border-width), produced by `npm run extract-tailwind-defaults`
- `src/resolve-token.ts` — resolves a token through alias chains to a primitive value for a given mode (light/dark)
- `src/renderers/tokens-css.ts` — replaces `css.ts`; emits `@theme` + `.dark` blocks structured by classification

### Removed modules

- `src/renderers/css.ts` — replaced by `tokens-css.ts`
- `src/renderers/ts.ts` — TS export no longer needed
- `output/tokens.ts` from build output

### Retained modules

- `build-tokens.mjs` (refactored to use the new pipeline)
- `src/build-graph.ts` (unchanged — classification is downstream of the graph)
- `src/renderers/app-config.ts` (drastically reduced to minimal Nuxt UI color-role mapping)

## Classification Engine

### Function Signature

```ts
type Classification =
  | { kind: 'skip', reason: 'component-layer' }
  | { kind: 'tailwind-default'
    , utility: string                 // 'p-1', 'rounded-md'
    , resolvedValue: string           // '0.25rem'
    }
  | { kind: 'theme-static'
    , cssName: string                 // '--color-blue-500'
    , value: string                   // '#3b82f6'
    , modeInvariantHint: boolean      // true → emit "/* mode-invariant */" comment in output
    }
  | { kind: 'theme-mode-variant'
    , cssName: string                 // '--color-action-primary'
    , lightValue: string
    , darkValue: string
    };

function classifyToken(token: TokenNode, graph: TokenGraph): Classification
```

### Decision Tree

```
1. Layer check (from filename via layerForSource()):
   ├─ component → { kind: 'skip', reason: 'component-layer' }
   └─ primitive | semantic → step 2

2. Mode-variance check (resolve in light + dark, compare):
   ├─ lightValue ≠ darkValue → { kind: 'theme-mode-variant', cssName, lightValue, darkValue }
   └─ equal → step 3

3. Token type check:
   ├─ color | shadow | gradient → { kind: 'theme-static', cssName, value, modeInvariantHint }
   └─ numeric (spacing, radius, font-size, font-weight, tracking, leading, border-width)
                              → step 4

4. Tailwind-default match:
   ├─ match in tailwind-defaults.generated.ts
     → { kind: 'tailwind-default', utility, resolvedValue }
   └─ no match
     → { kind: 'theme-static', cssName, value, modeInvariantHint }
```

### Helpers

- `normalizeToRem(value, base?)` — converts `'4px'` → `'0.25rem'`. Default base 16px, **configurable per build** to support design systems with non-standard root font sizes.
- `resolveInMode(token, graph, mode)` — walks alias chain to primitive value for the given mode. Throws on cycle or broken reference.
- `slugForCssVar(tokenPath, type)` — converts `['action', 'primary', 'bg']` → `'color-action-primary-bg'`.

### Layer Detection

Salvaged from PR #1's `layerForSource()`:

- `color.tokens.json`, `dimension.tokens.json`, `typography.tokens.json` → **primitive**
- `light.tokens.json`, `dark.tokens.json` → **semantic**
- Anything else (`global.tokens.json`, component-specific files) → **component**

### Edge Cases

- **Component token aliasing a mode-variant semantic** (e.g. `button-border-color → action-primary-border` with mode-switch): `skip` (component-layer rule wins). Inspector displays the resolved CSS var name in the Vue Template Usage hint, not a Tailwind utility, since the underlying value is mode-variant.
- **Numeric value close to but not matching Tailwind default**: `theme-static`. Inspector shows hint *"≈ `p-1` (4px) or `p-1.5` (6px) — consider snapping"*. Threshold for "close": within 50% of the distance to the nearest adjacent Tailwind step.
- **Mode-invariant semantic** (same value in `light.tokens.json` and `dark.tokens.json`): `theme-static` with `modeInvariantHint: true`. Renders `/* mode-invariant: same in light + dark */` comment in CSS output and a "mode-invariant" badge in Inspector.
- **Composite tokens** (shadow with RGB + spread + inset, gradient stops): mode-variance is deep-equal across all components, not just top-level string.

## Output Format

### File Layout

```
output/
├── css/
│   └── tokens.css        # @theme + .dark overrides
└── nuxt/
    └── app.config.ts     # Nuxt UI color role mapping (always emitted, marked "suggestion")
```

### tokens.css

```css
/* Generated by build-tokens.mjs from components/*.tokens.json */
/* DO NOT EDIT — re-run the build to regenerate */

@theme {
  /* — Primitive Colors — */
  --color-blue-500: #3b82f6;

  /* — Mode-invariant Brand Colors — */
  /* mode-invariant: same in light + dark */
  --color-brand-accent: #ff6a00;

  /* — Non-default Spacing — */
  --spacing-card-gutter: 18px;

  /* — Non-default Radius — */
  --radius-card: 14px;

  /* — Mode-variant Semantics (light defaults) — */
  --color-action-primary:   #2563eb;
  --color-surface-default:  #ffffff;

  /* — Mode-variant Shadows — */
  --shadow-card: 0 1px 3px rgb(0 0 0 / 0.1);
}

.dark {
  --color-action-primary:   #60a5fa;
  --color-surface-default:  #0a0a0a;
  --shadow-card: 0 1px 3px rgb(0 0 0 / 0.4);
}
```

**Structural rules:**

- Sections in fixed order: Primitive Colors → Mode-invariant Brand Colors → Non-default Spacing → Non-default Radius → Mode-variant Semantics → Mode-variant Shadows. Alphabetical within each section.
- Section headers as single-line comments. No per-token comments by default.
- Opt-in flag `--with-source-comments` emits `/* Figma: action/primary/bg → VariableID:2:189 */` per token for debug builds.
- Dark-mode selector is `.dark` (Tailwind v4 + `@nuxt/color-mode` convention).

### app.config.ts

Two emission phases:

**PR 1 — minimal color-role mapping** (already shipped):

```ts
// Generated by build-cli — Nuxt UI v4 color role mapping
// Suggested defaults; adjust to your taste in the consuming Nuxt project.

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'neutral',
      secondary: 'sky',
      success: 'emerald',
      info: 'sky',
      warning: 'amber',
      error: 'rose',
    },
  },
});
```

Role mapping heuristic (PR 2 polish): scan Figma semantic palette names, match against Nuxt UI roles (`primary`, `secondary`, `success`, `error`, `warning`, `info`, `neutral`) by name similarity + hue proximity. Conservative fallback to standard Tailwind palette names when no clear match.

**PR 2 — component recipes** (Nuxt UI v4 slots + variants):

```ts
// Generated by build-cli — Nuxt UI v4 component recipes + color role mapping
// Generated from Figma component-layer tokens. Adjust to taste; re-running
// the build regenerates this file.

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'accent',
      neutral: 'neutral',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue',
      secondary: 'blue',
    },
    button: {
      slots: {
        base: 'rounded-md font-medium inline-flex items-center disabled:cursor-not-allowed disabled:opacity-75 transition-colors',
      },
      variants: {
        size: {
          sm: { base: 'px-2 py-1 text-sm gap-1.5', leadingIcon: 'size-4', trailingIcon: 'size-4' },
          md: { base: 'px-3 py-1.5 text-base gap-1.5', leadingIcon: 'size-5', trailingIcon: 'size-5' },
          lg: { base: 'px-4 py-2 text-lg gap-2', leadingIcon: 'size-5', trailingIcon: 'size-5' },
        },
      },
    },
  },
});
```

**Scope: `button` only in PR 2.** Other Nuxt UI components (`badge`, `card`, `input`, …) can be added in follow-up PRs once the slot-mapping pattern is validated.

### Integration in a Nuxt project

```css
/* assets/css/main.css */
@import "tailwindcss";
@import "./tokens.css";
@import "@nuxt/ui";
```

The consuming project imports Tailwind itself; `tokens.css` is portable and contains only the `@theme` block plus `.dark` overrides.

## Component Recipes (PR 2)

The PR 2 `app-config-renderer` walks component-layer tokens (currently filtered as `skip` by the classifier), groups them by component name, and emits Nuxt UI v4 `slots` + `variants` recipes. Three new modules drive this:

### `src/resolve-token.ts`

Pure helper. Given a token id and graph, walks the alias chain until it reaches a node with a concrete value, then returns that value plus the resolution path. Handles `var(--target)` references in `cssValue` strings by looking up the target node in the graph. Throws on cycles. Used by the recipe engine and by the Inspector's `OutputSection` for `skip` tokens.

Signature:

```ts
function resolveTokenToValue(tokenId: string, graph: TokenGraph, mode?: Theme):
  { value: string; path: string[] } | { error: 'cycle' | 'unresolved'; path: string[] }
```

### `src/recipe-engine.ts`

Walks component-layer tokens. For each component prefix in the allow-list (PR 2 ships with `['button']`), discovers the relevant tokens, resolves each via `resolveTokenToValue`, classifies the resolved value via `classifyToken`, and assembles Tailwind utility class strings into Nuxt UI v4 `{ slots, variants }` shape.

Component-discovery convention: token id starts with `<component-name>-` → belongs to that component. Variant-axis detection from id suffix:

- `-sm`, `-md`, `-lg`, `-xl` → `variants.size.<axis>`
- `-default`, `-hover`, `-active`, `-disabled` → `variants.color.<axis>` (state, not color in Nuxt UI's sense — but state colors live under the color variant)
- Otherwise → `slots.base`

### `src/slot-mapping.ts` + optional `slot-mapping.json` override

Heuristic mapping from token-name segment to Nuxt UI slot key:

```
button-padding-x-*        → slots.base (padding-x utility)
button-padding-y-*        → slots.base (padding-y utility)
button-radius             → slots.base (rounded utility)
button-font-weight        → slots.base (font-weight utility)
button-text-size-*        → slots.base (text-* utility)
button-icon-size-*        → slots.leadingIcon + slots.trailingIcon (size utility)
button-gap                → slots.base (gap utility)
```

If `slot-mapping.json` exists at the project root, it overrides specific entries. Example override:

```json
{
  "button": {
    "button-shadow": "slots.base"
  }
}
```

Heuristic + override gives out-of-box behavior for systems that follow conventions, and a clean escape hatch for systems that don't.

## Inspector UI

### Token Detail Panel — new "Output" section

Below the existing detail block (name, type, alias chain, used-by), render an Output section keyed by classification kind:

- **`tailwind-default`** → Large display of the utility (`p-1`); label *"Tailwind has this — no custom property emitted"*; copy button.
- **`theme-static`** → CSS var name + Tailwind utility name(s) + value. If `modeInvariantHint: true`, badge *"mode-invariant"*. If a numeric value is close-but-not-exact to a Tailwind default, subline *"≈ `p-1` (4px) or `p-1.5` (6px) — consider snapping"*.
- **`theme-mode-variant`** → CSS var name + Tailwind utility name(s) + Light value + Dark value. Copy buttons.
- **`skip`** (component-layer) → No Output section. Instead, a **"Vue Template Usage"** section with the resolved Tailwind class list (e.g. `py-1 px-2 text-xs rounded-md font-medium bg-surface-subtle`), copy button.

### Token List — classification badges

Each list item gets a text badge: `tailwind`, `theme`, `mode-var`, `skip`.

Filter chip row above the list: **All · Tailwind · Theme · Dark-var · Component**. Default view: **All**.

### Summary Panel

Compact status strip at the top of the Inspector:

```
217 tokens · 142 Tailwind matches · 38 theme-static · 24 mode-variant · 13 skipped
```

Each segment clickable as a quick-filter.

### LiveButton Preview — Strategy B

Renders real `<button>` elements with computed Tailwind classes. Implementation:

1. After each classification run, inject `<style id="inspector-utilities">` into `<head>` containing:
   - All `@theme` variables in `:root`
   - All `.dark` overrides
   - Only the utility classes the LiveButton actually needs, generated from the loaded token set (e.g. `.bg-action-primary { background-color: var(--color-action-primary); }`)
2. LiveButton renders `<button class="px-4 py-2 rounded-md bg-action-primary text-on-action-primary hover:bg-action-primary-hover">…</button>`.
3. Adjacent code block shows the exact class string for copy-paste into the developer's Vue file.

`@tailwindcss/browser` (runtime Tailwind compiler) is a documented future upgrade path if utility coverage needs to expand beyond what manual generation supports.

### Code Preview Tab

Two panels: `tokens.css` and `app.config.ts`. Each with target-path hint:

```
tokens.css       → assets/css/tokens.css                    [Copy]
app.config.ts    → app.config.ts (or merge with existing)   [Copy]

[Download as zip]
```

### Issues View — new categories

Existing categories retained (broken aliases, unresolved references, type mismatches). New:

- **"Custom spacing value detected"** — lists `theme-static` numeric tokens close to (but not matching) Tailwind defaults. Suggests snapping.
- **"Mode-invariant token in semantic layer"** — identical light + dark values; suggests moving to primitive layer.
- **"Component token references mode-variant semantic"** — informational; explains the resolved-as-var fallback in Inspector display.

## Testing Strategy

| Layer | Test type | Verifies |
|---|---|---|
| `classify-token.ts` | Unit, table-driven | One fixture per classification kind. Property test: deterministic across repeated calls. |
| `tailwind-defaults.generated.ts` | Extraction-verify | Generated table vs. hand-curated spot checks (`'0.25rem' → '1'`, `'1rem' → '4'`). |
| `resolve-token.ts` | Unit | 3-stage alias chains. Cycles throw, broken refs throw. |
| `renderers/tokens-css.ts` | Snapshot (Vitest) | Curated fixture set → expected `tokens.css` string. |
| `renderers/app-config.ts` | Snapshot | Same approach for Nuxt UI mapping. |
| `build-tokens.mjs` | Integration | End-to-end with `components/*.tokens.json` → expected files in `output/css/` + `output/nuxt/`. |
| Inspector UI | Component (Vitest + Vue Test Utils) | Token detail panel renders per classification kind. LiveButton injects `<style id="inspector-utilities">`. |

### Smoke baseline migration

- **`smoke.legacy.test.ts`** — existing 514-declaration baseline retained during transition. Deleted in PR 2 with `renderers/css.ts`.
- **`smoke.classification.test.ts`** — new regression test. Snapshots the *classification map* (not the CSS string) for the reference token set. Robust against cosmetic format changes, sharp on classification drift.

## Migration

### PR Plan — bundled into two PRs

**PR 1 — Foundation + UI**

- Phase A: `classify-token.ts`, `tailwind-defaults.generated.ts`, `resolve-token.ts` + tests (no behavioral change yet)
- Phase B: New renderers + dual-emit (legacy `output/` + new `output/css/` + `output/nuxt/` side-by-side, gated by flag)
- Phase C: Inspector UI changes — classification badges, summary panel, filter chips, token detail Output sections, code preview shows both output sets

**PR 1 status:** Merged to main on 2026-05-20. Foundation classifier, new renderers (CSS + minimal app-config), dual-emit CLI, Inspector UI (badges, filter chips, summary panel, output section, new code-preview tab) are live. Legacy `output/*` untouched.

**PR 2 — Resolve + Recipes + Activation + Release**

- Phase F: `src/resolve-token.ts` — pure alias resolver (walks chains, returns concrete value or error). Used by recipe engine + Inspector's OutputSection.
- Phase G: `src/slot-mapping.ts` (heuristic) + optional `slot-mapping.json` override loader. Bidirectional mapping between Figma token segments and Nuxt UI v4 slot/variant keys.
- Phase H: `src/recipe-engine.ts` — walks component-layer tokens, applies slot-mapping, assembles Nuxt UI v4 `{ slots, variants }` recipe shape. Allow-list: `['button']`.
- Phase I: Updated `src/renderers/app-config.ts` consuming the recipe engine. Emits the full `defineAppConfig` body (colors + button recipes).
- Phase J: Inspector OutputSection for `skip` tokens — render the resolved Tailwind class list using `resolve-token.ts` + `classifyToken`. Replaces the PR 1 "available in PR 2" placeholder.
- Phase K: LiveButton Strategy B — refactor LiveButton to render plain `<button>` with Tailwind classes computed from the recipe engine. Inject `<style id="inspector-utilities">` for utility-class generation. Adjacent code-block shows the exact class string.
- Phase M: Resizable inspector sidebars. Custom `useResizablePane` composable (no new runtime dependencies), `ResizeHandle` component, localStorage persistence per pane.
- Phase L: Remove `renderers/css.ts` + `renderers/ts.ts` + legacy `output/tokens.ts` + legacy `build-tokens.mjs`. Delete `smoke.legacy.test.ts` + `diff.test.ts`. Update README. Add CHANGELOG. Bump to **v0.3.0**, push annotated tag.

Both PRs independently green-tested and mergeable. Visual smoke after PR 2 done locally via `gstack /browse` — no Playwright in CI yet.

### Tailwind-defaults extraction

- Script: `npm run extract-tailwind-defaults`
- Output: `src/tailwind-defaults.generated.ts`, **committed** to git (deterministic, no build-time filesystem access)
- Re-run on Tailwind version bumps
- CI sanity check ensures the committed file matches re-extracted output

### PR #1 (phtngyn)

Close with a comment summarizing the new architecture and acknowledging `layerForSource()` as inspiration for component-layer detection.

### Backward compatibility

- Input format (`components/*.tokens.json`) unchanged — existing Figma exports continue to work.
- Legacy `output/tokens.css`, `output/tokens.ts`, `output/nuxt-ui.app.config.ts` remain available through PR 1; removed in PR 2.
- `v0.2.0` tag unchanged.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tailwind v4 changes internal `@theme` defaults structure → extraction breaks | Medium | Pin Tailwind to concrete minor version in `package.json`; CI step re-runs extraction as sanity check |
| Mode-variance detection wrong for composite tokens (shadow with RGB + spread + inset) | Low-Medium | Composite comparison as deep-equal on all components, not top-level string |
| Manual utility generation insufficient when designer expects complex compose-classes (`hover:bg-action-primary/80`) | Low | Phase K documents supported subset; `@tailwindcss/browser` is a ~1-day upgrade path |
| PR 2 release breaks unknown consumers of legacy output | Very low (single-user project) | Migration notes in README; legacy output remained through PR 1 transition window |
| Slot-mapping heuristic mis-classifies tokens for systems that don't follow convention (PR 2) | Medium | `slot-mapping.json` override file; the Issues view surfaces unmapped component-layer tokens so the user can decide |
| Recipe engine emits invalid Nuxt UI v4 `{ slots, variants }` shape (e.g. flat string instead of slot-keyed object) | Low | Snapshot tests against a known-good fixture; cross-check with Nuxt UI's documented theme shape |
| `resolve-token.ts` introduces cycles or stack overflow on malformed graphs | Low | Visited-set guard; emit `{ error: 'cycle', path }` instead of throwing — Inspector surfaces in Issues |

## Out of Scope

- Generating Vue component templates (full `.vue` files). The tool emits Nuxt UI v4 recipes in `app.config.ts` — the consuming project still uses Nuxt UI's `<UButton>`, `<UBadge>`, etc. Templates remain in the developer's hands.
- Generating a `tailwind.config.ts` JS file. Tailwind v4 is CSS-native; no JS config emitted.
- Special-case CSS variables for mode-variant non-color, non-shadow tokens (e.g. mode-variant padding). Exotic case; classification falls through to `theme-mode-variant` and the Inspector renders accordingly — no extra handling.
- Hot-reload of token files in the Inspector during a single session. Drag-and-drop replaces the loaded set; no incremental update.
- Component recipes for components beyond `button` in PR 2. `badge`, `card`, `input`, etc. follow in subsequent PRs once the slot-mapping pattern is validated.
- Cross-component composite recipes (e.g. "a card with a button inside inherits these tokens"). Each component recipe is self-contained.
- Hue-proximity matching for color role mapping. PR 2 may attempt name-similarity matching but falls back to defaults; sophisticated color-space matching is deferred.
- Figma REST API import via Personal Access Token. Currently the tool accepts drag-and-drop W3C DTCG `*.tokens.json` files only. Direct fetch from `GET /v1/files/:key/variables/local` plus a Figma-Variables → DTCG converter is planned as **PR 3** (post v0.3.0); needs its own brainstorming round given the security model (browser-side PAT handling) and format-conversion scope.
- Smart recipe-engine handling of incomplete or inconsistent Figma data. The v0.3.0 engine groups component tokens by suffix: `button.padding-x` (no suffix) → `slots.base`, `button.padding-x-md` → `variants.size.md`. Figma systems in flight often have asymmetric coverage (e.g., `padding-x` defined for all sizes but `padding-y` only without suffix; `gap-xs` + `gap-sm` but no `gap-md`/`gap-lg`). This produces recipes where one size variant looks "complete" while others look partial and visually under-differentiate in the LiveButton preview. Planned as **PR 4** (post v0.3.0): Approach C from the post-v0.3.0 review — smart heuristic (non-suffix tokens that compete with size-suffixed siblings get reassigned to a configurable default size, typically `md`) PLUS per-variant completeness warnings (Inspector Issues view, app.config.ts comment, LiveButton "partial X/Y" badge). Engine must remain non-dogmatic: Figma conventions are not always consistently applied, so the heuristic emits warnings rather than silent corrections.

## Open Items

None on the design contract itself. Implementation will surface micro-decisions (variable naming conventions for edge-case token shapes, exact UI copy, color-role mapping heuristic tuning) to be resolved during execution.

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

Always emitted (per Section 3 decision) with a clear "suggestion" header:

```ts
// Generated by build-tokens.mjs — Nuxt UI v4 color role mapping
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

Role mapping heuristic: scan Figma semantic palette names, match against Nuxt UI roles (`primary`, `secondary`, `success`, `error`, `warning`, `info`, `neutral`) by name similarity + hue proximity. Conservative fallback to standard Tailwind palette names when no clear match.

### Integration in a Nuxt project

```css
/* assets/css/main.css */
@import "tailwindcss";
@import "./tokens.css";
@import "@nuxt/ui";
```

The consuming project imports Tailwind itself; `tokens.css` is portable and contains only the `@theme` block plus `.dark` overrides.

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

**PR 2 — Activation + Release**

- Phase D: LiveButton Strategy B (runtime utility injection); class-string display
- Phase E: Remove `renderers/css.ts` + `renderers/ts.ts` + legacy `output/tokens.ts`, delete `smoke.legacy.test.ts`, update README, add CHANGELOG, bump to **v0.3.0**, push annotated tag

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
| Manual utility generation insufficient when designer expects complex compose-classes (`hover:bg-action-primary/80`) | Low | Phase D documents supported subset; `@tailwindcss/browser` is a ~1-day upgrade path |
| PR 2 release breaks unknown consumers of legacy output | Very low (single-user project) | Migration notes in README; legacy output remains through PR 1 transition window |

## Out of Scope

- Generating Vue component templates (Option C from brainstorming). Component styling stays in the developer's hands.
- Generating a `tailwind.config.ts` JS file. Tailwind v4 is CSS-native; no JS config emitted.
- Special-case CSS variables for mode-variant non-color, non-shadow tokens (e.g. mode-variant padding). Exotic case; classification falls through to `theme-mode-variant` and the Inspector renders accordingly — no extra handling.
- Hot-reload of token files in the Inspector during a single session. Drag-and-drop replaces the loaded set; no incremental update.

## Open Items

None on the design contract itself. Implementation will surface micro-decisions (variable naming conventions for edge-case token shapes, exact UI copy, color-role mapping heuristic tuning) to be resolved during execution.

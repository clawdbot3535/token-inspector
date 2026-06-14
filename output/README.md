# Figma Tokens → Nuxt UI v4

Generiert von `npm run build:tokens` (`scripts/build-cli.ts`) aus
`components/*.tokens.json` (Figma W3C DTCG Export). Dieselbe Ausgabe erzeugt der
In-Browser-Inspector über „Commit to Git".

## Was du bekommst

| Datei | Inhalt | Ziel |
|---|---|---|
| `css/tokens.css` | Tailwind v4 `@theme`-Block + `.dark`-Overrides: Primitives, Mode-variant Semantics, Typografie-Type-Scale (`--text-<role>`) und Layout-Primitives (`--container-*` / `--spacing-*` / `--radius-*`) | `assets/css/tokens.css` |
| `nuxt/app.config.ts` | Nuxt UI v4 `app.config.ts`: Color-Role-Mapping + `ui.<component>`-Recipes für die 16 Standard-Komponenten | merge mit deinem `app.config.ts` |
| `nuxt/custom-components.ts` | `export const <name>Recipe = { slots, variants }` für Komponenten ohne Nuxt-UI-Pendant (`chip`, `sidebar`) — bewusst außerhalb `ui.*` | eigener Import, wo du die Komponente baust |

> `tokens.css` ist ein generiertes Artefakt (gitignored). `custom-components.ts`
> wird nur geschrieben, wenn das Projekt Custom-Komponenten-Tokens enthält.

## Drop-in in dein bestehendes Nuxt-Projekt

### 1. CSS einbinden

Kopiere `css/tokens.css` nach `assets/css/tokens.css` und importiere es in deinem
Tailwind-Stylesheet (Reihenfolge zählt — Tokens nach `tailwindcss`):

```css
/* assets/css/main.css */
@import "tailwindcss";
@import "./tokens.css";
@import "@nuxt/ui";
```

`tokens.css` definiert CSS-Variablen in Schichten:

- `:root` → Primitives (`--color-neutral-500`, `--spacing-card-gutter`, `--font-size-text-2xs` …)
- `:root` / `.dark` → Mode-variant Semantics (light default, dark override)
- `@theme` → Typografie-Type-Scale als komposite Utilities
  (`--text-heading-1` + `--text-heading-1--line-height` / `--letter-spacing` /
  `--font-weight`) und Layout-Primitives (`--container-narrow`, `--spacing-stack-md`,
  `--radius-section-card`, `--grid-columns` …). Tailwind erzeugt daraus echte
  Utilities (`text-heading-1`, `max-w-narrow`, `gap-stack-md`, `rounded-section-card`).

Werte, die einem Tailwind-Default entsprechen, werden bewusst **nicht** ausgegeben —
nutze direkt die Tailwind-Utility.

### 2. Nuxt UI Recipes

Merge `nuxt/app.config.ts` mit deinem `app.config.ts`. Es enthält das
Color-Role-Mapping plus `ui.<component>`-Recipes (Slots, `size` / Color-Role /
visuelle Varianten mit Pseudo-Class-State-Prefixen). Color-Utilities verweisen auf
`var(--<semantic-id>)`, damit Dark-Mode-Overrides automatisch durchschlagen.

### 3. Custom-Komponenten

Komponenten, deren Figma-Semantik von Nuxt UI abweicht (`chip` ≠ Nuxt `UChip`;
`sidebar` ohne Pendant), landen in `nuxt/custom-components.ts` als
`<name>Recipe`-Export. Importiere sie dort, wo du die Komponente selbst baust —
sie sind kein gültiges `ui.*`-Config.

## Komponenten-Set (Recipes)

`button`, `badge`, `input`, `textarea`, `card`, `modal`, `kbd`, `chip`,
`checkbox`, `radio`, `switch`, `nav`, `dropdown`, `table`, `progress`,
`accordion`. Sub-Element-Routing bildet jede Komponente auf ihre echten
Nuxt-UI-v4-Slots ab (`card → root`, `dropdown`/`modal → content` + `item`/`overlay`,
`progress → base`/`indicator`). Ein paar odd-shaped Tokens bleiben per Design
unmapped und stehen im Scan-View.

## Re-build

Neuer Figma-Export? Ersetze die Dateien in `components/` und führe aus:

```bash
npm run build:tokens
```

## Bekannte Quirks

- Figma exportiert teils `font-weigth` / `line-heigth` (Typo) — werden im Output zu
  `font-weight` / `line-height` normalisiert; der Scanner meldet den Quell-Typo
  weiterhin als `possible-typo`.
- Abgeschnittene `shadow`-Werte (am `)` gekappt) werden automatisch balanciert.
- `--color-*-alpha-*` werden als `rgba()` ausgegeben (nicht hex+alpha).

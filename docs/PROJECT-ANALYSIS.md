# Token Inspector — Projektanalyse (v0.4.0)

> Erstellt 2026-05-29 durch eine mehrstufige Multi-Agent-Analyse (7 parallele
> Reader → adversariale Verifikation → Synthese). 46 Befunde gesammelt, 12
> verifiziert (11 bestätigt, 1 widerlegt).

## Status (Stand 2026-05-29)

Im Anschluss an die Analyse wurden folgende Befunde **behoben** (Commit-Reihe
nach `e6e78db`):

| Befund | Datei | Status |
|---|---|---|
| `h-[…]` / Scale-Klassen rendern nicht (JIT) | `extract-arbitrary.ts` | ✅ gefixt (`e6e78db`) |
| `font-[Inter]` → `fontWeight` statt `fontFamily` | `extract-arbitrary.ts` | ✅ gefixt + Test |
| font-weight Scale-Klassen (`font-light` …) rendern nicht | `extract-arbitrary.ts` | ✅ gefixt + Test |
| Inspector-Output ≠ CLI (completeness fehlt) | `App.vue`, `state.ts` | ✅ gefixt (Preview 0 → 4 Kommentare) |
| CLI scannt nur `['button']` | `build-cli.ts` | ✅ gefixt (alle 15) |
| Orphaned-size-key false positive | `scanner.ts` | ✅ gefixt + 2 Tests |
| Array-Root-JSON / figma-mapping-Shape ungeprüft | `load-sources.ts` | ✅ gefixt + Tests |
| Unbewachter `JSON.parse` (slot-mapping) | `slot-mapping-loader.ts` | ✅ gefixt + Test |

Offen (niedrig priorisiert): Dark-only-Semantic-Issue, `DimensionRuler` rem→px,
`LiveButton:183` Immutabilität, `scanGraph`-Refactor, Stub-Funktionen,
Test-Infra (jsdom + `@vue/test-utils`), Golden-Snapshot, Tailwind-Tabellen-Pin,
CI-Workflow, Patch-Tag.

---

## 1. Überblick

Token Inspector (npm: `figma-tokens-nuxt-ui-adapter`, v0.4.0) ist ein 100 %
clientseitiges Vue-3-+-Vite-Browser-Tool. Es nimmt W3C-DTCG-Tokens (Export aus
einem hauseigenen Figma-Plugin) entgegen, baut einen unveränderlichen
Token-Graphen, klassifiziert jeden Token und erzeugt daraus eine schlanke
Tailwind-v4-`tokens.css` plus eine Nuxt-UI-v4-`app.config.ts`. Ein Inspector
visualisiert Graph/Klassifikation/Output; Live-Vorschau (nur Button) und
Scan-Ansicht runden es ab.

Zielgruppe: Designer/DS-Engineers mit Figma-Variablensatz auf
Nuxt-UI-v4-+-Tailwind-v4-Stack. Kernwert ist der Figma→Nuxt-Adapter; Previews
sind sekundär. Leitphilosophie „Tailwind-utility-first": ein Token wird nur
dann CSS-Custom-Property, wenn Light ≠ Dark; mode-invariante Tokens matchen
entweder einen Tailwind-Default (kein Output) oder erweitern `@theme` statisch;
die Component-Layer fällt komplett aus dem CSS heraus und wird als
Nuxt-UI-Rezept neu ausgedrückt (~70 % kleinere `tokens.css`).

Reifegrad: solide für v0.4.0. Der Engine-Kern ist sauber geschichtet,
immutabel, gut getestet, zwischen CLI und App geteilt. Die Schwächen lagen
**nicht** im Kern, sondern in der Preview-Übersetzung (`extract-arbitrary.ts`),
einer CLI/UI-Divergenz und der untesteten Vue-Schicht.

## 2. Architektur & Datenfluss

```
  6× DTCG SourceFile (drag/zip)                   slot-mapping.json (optional, CLI)
        │                                                   │
        ▼                                                   ▼
  buildGraph ──► TokenGraph (Object.frozen)  ◄── identische Quelle für CLI & App
        │
        ├─► classifyToken ─► {skip | tailwind-default | theme-static | theme-mode-variant}
        │        (geteiltes "Gehirn" für CLI-Output UND Inspector)
        ├─► resolveTokenToValue (alias + var()-Kette, cycle-safe)
        ├─► recipe-engine (nur component-layer) ─► Nuxt-UI slots/variants
        │        3 Emit-Pfade: color var()/literal · arbitrary · shadow-node
        ├─► scanner ─► data-quality + completeness + forecast
        └─► renderers ─► tokens-css.ts (@theme + .dark{}) · app-config.ts (15 Komponenten)

  CLI:  build-cli.ts ─► scanGraph(ALL_15)  + renderers MIT options  ─► output/*
  App:  App.vue      ─► useScanReport(15)  + renderers MIT completeness ─► download/preview
                         LiveButton ─► extractArbitrary ─► inline styles (JIT-Umgehung)
```

| Datei | Rolle |
|---|---|
| `build-graph.ts` | Einziger Graph-Produzent; flacht DTCG, löst Aliase, friert Graph ein |
| `token-graph.ts` | Zentraler Typ-Vertrag |
| `classify-token.ts` | Geteilte Klassifikations-Engine |
| `resolve-token.ts` | Alias-+-`var()`-Löser mit Cycle-Guard |
| `recipe-engine.ts` | Component-Layer → Nuxt-UI-Rezepte (3 Emit-Pfade) |
| `slot-mapping.ts` / `-loader.ts` | Token-Id → slot/utility/variant; optionale Overrides |
| `scanner.ts` | Data-Quality + Hints + Completeness + Forecast (größte Datei) |
| `renderers/*` | `tokens-css.ts`, `app-config.ts` (`COMPONENT_ALLOW_LIST`=15), `line-builder.ts` |
| `tailwind-defaults.ts` / `.generated.ts` | Matcher + auto-generierte Tailwind-Skalentabellen |
| `app/extract-arbitrary.ts` | Preview-Übersetzer Klassen→Inline-Styles (JIT-Umgehung) |
| `app/App.vue` | Inspector-Root, State, 3-Pane-Layout |
| `app/components/LiveButton.vue` | Rezept-getriebene Button-Vorschau |
| `app/load-sources.ts` / `unzip.ts` | Datei-Ingestion, abhängigkeitsfreier ZIP-Reader |
| `scripts/build-cli.ts` | CLI-Entry (`build:tokens`) |

## 3. Stärken

- Echt reiner, unveränderlicher Kern. `buildGraph` wirft nie (Fehler als
  `GraphIssue`), Nodes/Maps `Object.frozen`, alles Downstream read-only.
- Eine geteilte Klassifikations-Engine → keine Drift zwischen Vorschau und Emission.
- Saubere Cascade-Schichtung (primitive/semantic/component), von Dateinamen entkoppelt.
- Cycle-safe überall; eleganter `var()`-vs-Literal-Color-Mechanismus (Dark-Mode kaskadiert automatisch).
- Doku == Code: README-Philosophie-Matrix 1:1 in `classify-token.ts` implementiert; v0.5.0-Backlog ehrlich abgegrenzt.
- Hohe Codequalität: kein `any`/`as any`, kein `console.*` in Prod, kleine Dateien, robuste Eingabe-Grenzen in `unzip.ts`.

## 4. Test-Abdeckung

**Stark:** Engine-Kern dicht getestet — inzwischen 258 Tests / 21 Dateien.
recipe-engine (34), slot-mapping (41), build-graph (29), scanner (24),
tailwind-defaults (20), classify-token (10), extract-arbitrary (13),
load-sources (6, neu). `issues-inspect.test.ts` ist ein Canary gegen echte
Figma-Fixtures.

**Größte verbleibende Lücken:**
- Vue-Komponenten-Schicht weiterhin ohne Mount-Tests (`App.vue`,
  `LiveButton.vue`, `ScanView.vue`) — `@vue/test-utils`/jsdom fehlen
  (`vitest.config.ts` → `environment: "node"`). `projectToState` (35 Z.) ungetestet.
- Kein Golden-Snapshot für `app.config.ts` (nur `.toContain()`).
- `tailwind-defaults.generated.ts` durch keinen Checksum/Versions-Test gepinnt.
- Keine Coverage-Messung → 80 %-Ziel unverifizierbar.

## 5. Verifizierte Befunde (Snapshot vor den Fixes)

Siehe Status-Tabelle oben für den aktuellen Stand. Vollständige Liste sortiert
nach Schweregrad (verifiziert/unsicher; widerlegte entfernt):

| Sev | Kind | Datei | Befund |
|---|---|---|---|
| high | bug | `extract-arbitrary.ts` | `font-[Inter]` auf `fontWeight` statt `fontFamily` geroutet → ✅ |
| high | bug | `extract-arbitrary.ts` | font-weight Scale-Klassen rendern nicht (JIT) → ✅ |
| high | bug | `App.vue` | Inspector-Download ≠ CLI (completeness fehlt) → ✅ |
| medium | bug | `scanner.ts` | Orphaned-size-Hint false positive → ✅ |
| medium | bug | `build-cli.ts` | CLI scannt nur `['button']` → ✅ |
| medium | risk | `load-sources.ts` | Array-Root-JSON erzeugt Garbage-Nodes → ✅ |
| medium | risk | `classify-token.ts` | Dark-only-Semantic im Light-Mode (unsicher) — offen |
| medium | risk | `load-sources.ts` | Shallow figma-mapping-Validierung → ✅ |
| medium | debt | `app-config.ts` | Nur Substring-Tests, kein Golden-Snapshot — offen |
| medium | debt | `build-cli.ts` | CLI in keiner tsconfig — offen |
| low | bug | `DimensionRuler.vue` | rem/em als px behandelt — offen |
| low | bug | `LiveButton.vue:183` | mutiert Style-Objekt (Immutabilität) — offen |
| low | debt | `slot-mapping-loader.ts` | Unbewachter `JSON.parse` → ✅ |
| low | debt | `scanner.ts` | `scanGraph()` 270 Z. — offen |

**Widerlegt:** `parseBucketKey`-Casts — Bucket-Key-Roundtrip ist geschlossen, keine externe Quelle.

## 6. Tech-Debt & Risiken (offen)

- Deferred v0.5.0-Backlog (gut dokumentiert): Sub-Element-Slots, per-Komponenten-Previews,
  `custom/<name>`-Konvention, Fonts-`@theme`-Pipeline, „Load from URL".
- Generierte Tailwind-Tabelle kann bei `npm update` still driften.
- `classifyGraph` wird pro Build/Scan ≥3× über alle Nodes gewalkt (nicht memoisiert).
- Deployment: kein `vercel.json`; Vercel Hobby + Private-Repo blockiert Deploys.
  `main` ist dem `v0.4.0`-Tag voraus → Patch-Tag 0.4.1 + CHANGELOG fällig.
- Dependencies: vitest zieht transitiv vite@5, Build läuft auf vite@6.

## 7. Empfehlungen (verbleibend, priorisiert)

1. Test-Infra: jsdom + `@vue/test-utils`; `LiveButton`/`projectToState`/`App.vue` testen; Golden-Snapshot; Versions-Pin der Tailwind-Tabelle; Coverage aktivieren.
2. Build/Release-Hygiene: `scripts/` ins typecheck-Gate; CI-Workflow oder pre-commit-Kommentar korrigieren; Patch-Tag 0.4.1.
3. Dark-only-Semantic als `GraphIssue` flaggen (`classify-token.ts`).
4. Niedrigprio: `DimensionRuler` rem→px, `LiveButton:183` immutabel, `scanGraph` Phasen 2-4 extrahieren, Stub-Funktionen mit Ticket versehen, stale Kommentare bereinigen.

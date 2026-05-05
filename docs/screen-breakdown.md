# Screen Breakdown — Tag-1 (Option d)

Inspector + Live-Preview für das Figma-Tokens → Nuxt UI v4 Adapter-Tool.
Single-Page-App, 100% client-side, keine Auth, keine Persistenz beyond localStorage.

---

## Layout — Drei-Zonen-Shell (persistent)

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: Logo · File-Name · Build-Status · Re-Drop · Download    │
├────────────┬───────────────────────────────────┬─────────────────┤
│            │                                   │                 │
│  Sidebar   │       Main Pane                   │   Output Pane   │
│  (Browser) │       (Inspector / Preview)       │   (Live-Code)   │
│            │                                   │                 │
│  280px     │       flex                        │   480px         │
│            │                                   │                 │
└────────────┴───────────────────────────────────┴─────────────────┘
```

Resizeable Splitter zwischen Main und Output. Output-Pane togglebar (Tab/Hotkey).

---

## Screen 1: Drop Zone (Initial / Empty State)

**Wann:** Kein Graph geladen.

**Inhalt:**
- Großer Drop-Bereich: "ZIPs oder JSON-Dateien hier ablegen"
- Erkennt: einzelne `.tokens.json`, mehrere JSON-Dateien, ZIP-Archive (Figma Multi-ZIP-Drop)
- Liste erwarteter Layer: color · dimension · typography · light · dark · global
- Beispiel-Daten-Button: "Demo laden" (lädt eingebettetes Test-Set)
- Footer-Link: "Was ist ein W3C-DTCG-Token?"

**State-Übergang:** Nach erfolgreichem Parse → Screen 2 (Inspector als Default-View).

**Issues-Handling:** Bei Parse-Fehler → Inline-Banner über Drop-Zone, Drop bleibt erhalten, User kann nachladen.

---

## Screen 2: Inspector View (Default nach Drop)

### Sidebar — Token-Browser

- **Filter oben:** Suche (Volltext über id + path), Layer-Toggle (primitive/semantic/component), Type-Toggle (color/dimension/...)
- **Tree-Ansicht:** Hierarchisch nach Figma-Path gruppiert
  - color / blue / 600
  - spacing / 4
  - button / primary / background
- **Counts pro Gruppe:** "color (142)", "spacing (28)"
- **Issue-Badge:** Rote Punkte an Nodes mit `GraphIssue` (unresolved alias etc.)
- **Theme-Switcher unten:** light · dark (steuert Preview-Werte)

### Main Pane — Node-Detail

Wenn Node gewählt:

- **Header:** Token-ID (kebab) · Layer-Badge · Type-Badge · Theme-Chips
- **Visual Preview:** Type-spezifisch
  - color → Farbswatch + Kontrast-Check gegen weiß/schwarz
  - dimension → Lineal mit Vergleichsbalken
  - shadow → Card-Demo mit appliziertem Schatten
  - typography → Live-Text-Sample
- **Werte-Block:**
  - Resolved CSS Value (das was im Output landet)
  - Raw `$value` (collapsed JSON)
  - Original Figma-Path
- **Alias-Chain (wenn vorhanden):**
  - "→ semantic.surface.primary → color.blue.600 → #2563EB"
  - Klickbar, navigiert zum nächsten Node
- **Used By (Reverse-Aliases):**
  - Liste aller Nodes die hierher zeigen
  - Klickbar
- **Issues (wenn vorhanden):**
  - Inline-Liste der `GraphIssue` für diesen Node

Wenn nichts gewählt:

- **Übersichts-Dashboard:**
  - Total nodes · per layer · per type
  - Issue-Summary (count by kind)
  - Build-Meta (timestamp, source files)

### Output Pane — Live-Preview

Tab-Bar oben:

- **`tokens.css`** (default)
- **`app.config.ts`**
- **`tokens.ts`**

Inhalt:

- Syntax-highlighted Code (read-only)
- Bei Selektion eines Nodes in der Sidebar → entsprechende Zeile im Output wird **gehighlightet + gescrollt**
- Top-right: Copy-Button, Download-Button (einzelne Datei)

Footer der Output-Pane:

- "Download all (.zip)" — bündelt alle drei Artefakte
- File-Size-Anzeige pro Tab

---

## Screen 3: Issues View (sekundär, gleiche Shell)

**Trigger:** Klick auf Issue-Badge im Header oder Issue-Count im Dashboard.

**Main Pane:**
- Gruppierte Liste aller `GraphIssue`s nach `kind`
- Pro Issue: Nachricht, Path, Link "Im Inspector öffnen"
- Top: "Export as JSON" für Bug-Reports

**Sidebar/Output bleiben identisch** — Issues sind ein Filter über den selben Graph.

---

## Header — Persistent Controls

| Element | Verhalten |
|---|---|
| Logo / Title | Klick → Reset zu Drop-Zone (mit Confirm) |
| File-Name | Zeigt geladene Quelle(n), Hover → Liste aller Source-Files |
| Build-Status | Grün (clean) · Gelb (n issues) · Klick → Issues View |
| Re-Drop | Öffnet Drop-Modal über bestehendem Graph (Replace) |
| Download all | Triggert ZIP-Bundle aller Artefakte |

---

## Keyboard

- `Cmd/Ctrl+K` — Sidebar-Suche fokussieren
- `Cmd/Ctrl+1/2/3` — Output-Tabs wechseln
- `Cmd/Ctrl+D` — Theme toggle (light/dark)
- `Cmd/Ctrl+/` — Output-Pane togglen
- `Esc` — Selektion löschen / Modal schließen
- `↑/↓` — Token-Liste navigieren

---

## State-Modell (Single Source: TokenGraph)

```
AppState =
  | { kind: "empty" }
  | { kind: "loading", files: File[] }
  | { kind: "loaded",
      graph: TokenGraph,
      selection: TokenId | null,
      filters: { search: string, layers: GraphLayer[], types: TokenType[] },
      view: "inspector" | "issues",
      outputTab: "css" | "appConfig" | "ts",
      theme: Theme }
  | { kind: "error", message: string, files: File[] }
```

Selection + Filter sind **Views** über den Graph — keine Mutation.
Theme-Switch ändert nur `cssValue`-Lookup für Semantic-Layer-Nodes (light vs dark Map).

---

## Out-of-Scope für Tag 1

- Diff zwischen zwei Graphen (= Option c, später)
- Token-Editing im Tool (nur read-only Inspector)
- Export anderer Frameworks als Nuxt UI v4
- User-Accounts / Cloud-Save
- Code-Connect-Generierung

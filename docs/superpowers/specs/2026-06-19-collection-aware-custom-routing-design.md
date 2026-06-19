# Design Spec — collection-aware custom routing

**Date:** 2026-06-19
**Status:** Approved
**Topic:** Read the Figma `com.figma.collectionName` metadata so the designer's `components/custom` vs `components/global` taxonomy becomes an authoritative custom-component signal (augmenting the structural heuristic), and surface disagreements between the declared collection and the inspector's anatomy heuristic.

## Context

The Figma plugin tags every token with `$extensions["com.figma.collectionName"]` — e.g. `components/global`, `components/custom`, `layout/global`. In the current export this is **uniform per component** (verified: sidebar = `components/custom`; everything else = `components/global`; layout primitives = `layout/global`). The inspector ignores `$extensions` except `com.figma.aliasData` (`build-graph.ts:158` skips it during the walk; `:231` reads aliasData), so the taxonomy currently drives nothing.

Custom-ness is determined today by `customPartsByComponent(report)` (`scanner.ts:817-830`): it merges `KNOWN_CUSTOM_COMPONENTS` (registry — `sidebar`) with `component-looks-custom` heuristic hits (fires for `chip` — UChip is a dot-indicator with only `root`/`base`, so chip's `label`/`close` are foreign). Its keys = which components emit as `custom/<name>` (→ `custom-components.ts`); its values = the foreign parts used as permissive `extraSlots` in `buildCustomRecipes`.

**Key data fact / motivation:** the taxonomy and the heuristic **disagree on chip** — chip is in `components/global` but the heuristic (correctly) flags it custom. An "authoritative" collection would wrongly force chip → `ui.chip` (it can't express label/close), so the heuristic must win on disagreement; the disagreement itself should be surfaced as actionable feedback.

## Goals / non-goals

- **Goal:** the declared collection drives custom membership (augments registry + heuristic) and disagreements produce a scanner warning.
- **Non-goal (current no-op):** on today's export the custom *set* is unchanged (sidebar already registry-custom; chip already heuristic-custom). The observable deliverable is the **chip disagreement warning** + the taxonomy now being load-bearing for future exports (a reclassified chip or a novel custom component becomes custom by declaration). This is intentional and stated up front.
- **Deferred:** part-derivation for a declared-custom component with no Nuxt analog and no registry/heuristic parts (none exist in the export). Such a component gets `[]` parts + a warning.

## Architecture / changes

### 1. Capture the collection — `src/build-graph.ts` + `src/token-graph.ts`

- Add `collection?: string` to the `TokenNode` interface (`token-graph.ts`, alongside `source`/`description`).
- At the node-construction site (where `com.figma.aliasData` is already read, ~`build-graph.ts:231`+), read `token.$extensions?.["com.figma.collectionName"]` and set it on the node. The recursive `walk` (line 153-168) is unchanged — it skips `$extensions` only to avoid recursing into it as a token group; the yielded `token` object still carries `$extensions`. Pure plumbing; no behavior change.

### 2. Per-component collection helper — `src/scanner.ts` (exported)

```ts
/** Component → its Figma collection (uniform across a component's tokens), e.g. "components/custom". */
export function componentCollections(graph: TokenGraph): ReadonlyMap<string, string>;
/** Components declared custom in Figma (collection === "components/custom"). */
export function declaredCustomComponents(graph: TokenGraph): ReadonlySet<string>;
```
`componentCollections` walks `graph.nodes`, and for each `layer === "component"` node takes `prefix = id.split("-")[0]` → `node.collection`. (Uniform per component; if ever mixed, last-wins is acceptable — a mixed component is a Figma authoring error the disagreement warning would not specifically cover, out of scope.) `declaredCustomComponents` = the subset whose collection is `"components/custom"`.

### 3. Membership augmentation — `customPartsByComponent`

Extend the signature to accept the declared-custom set and merge it **membership-only, without clobbering richer parts**:

```ts
export function customPartsByComponent(
  report: { issues: ReadonlyArray<ScanIssue> },
  declaredCustom?: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const [c, parts] of KNOWN_CUSTOM_COMPONENTS) out.set(c, [...parts]);       // registry (parts)
  for (const i of report.issues) {                                                // heuristic (parts) — wins
    if (i.kind !== "component-looks-custom") continue;
    if (i.componentName === undefined || i.customParts === undefined) continue;
    out.set(i.componentName, [...i.customParts]);
  }
  for (const c of declaredCustom ?? []) if (!out.has(c)) out.set(c, []);           // declared-only → membership, parts deferred
  return out;
}
```
Order guarantees chip/sidebar keep their real parts; a declared-custom-only component is added with `[]` (emits `custom/<name>` with standard slot mapping; deferred-parts warning covers the empty-recipe risk).

### 4. Disagreement warning — `src/scanner.ts` (new issue kind)

In `scanGraph`, after the `component-looks-custom` loop, using `componentCollections(graph)`:

- **`collection-anatomy-mismatch`** (severity `warning`): a component with a `component-looks-custom` hit whose collection is `components/global` (not `components/custom`). Message: *"`chip` is in Figma collection `components/global` but has custom parts (`close`, `label`) with no Nuxt `chip` slot — consider moving it to `components/custom`."* Fires for chip today. The component **stays custom** (heuristic wins) — this is feedback, not a demotion.
- **`custom-without-parts`** (severity `warning`): a `declaredCustom` component that is neither in `KNOWN_CUSTOM_COMPONENTS` nor has a `component-looks-custom` hit (so `customPartsByComponent` gave it `[]`). Message: *"`<name>` is declared `components/custom` but no foreign parts could be derived — its custom recipe may be empty (part-derivation for components without a Nuxt analog is not yet supported)."* No trigger in the current export (forward-looking).

`ScanIssue.kind` is an open `string` (token-graph.ts) — no type change. Both carry `componentName`.

### 5. Callers pass the declared-custom set

`src/app/App.vue:126` and `src/app/state.ts:83` call `customPartsByComponent(scanReport)` — change to `customPartsByComponent(scanReport, declaredCustomComponents(graph))` (the graph is in scope at both sites).

## Data flow

`build-graph` stamps `node.collection` from `$extensions` → `declaredCustomComponents(graph)` yields the `components/custom` set → `customPartsByComponent(report, declaredCustom)` merges it into the custom set (membership) → renderer/`buildCustomRecipes` emits those as `custom/<name>`. Separately, `scanGraph` cross-checks each heuristic-custom component's collection and emits `collection-anatomy-mismatch` on disagreement (chip).

## Error handling / edge cases

- A token with no `$extensions` or no `collectionName` → `node.collection` is `undefined` → the component is not declared-custom (membership unchanged). Safe default.
- Layout primitives (`layout/global`) and standard components (`components/global`) → not declared-custom; unaffected.
- A `components/custom` component already custom via registry/heuristic (sidebar/chip-if-moved) → `customPartsByComponent` keeps the richer parts (the `if (!out.has(c))` guard). No double-count, no parts loss.
- Mixed-collection component (not present today) → `componentCollections` last-wins; not specifically flagged (out of scope).

## Testing

- **build-graph unit** (`build-graph.test.ts`): a token with `$extensions["com.figma.collectionName"]: "components/custom"` → `node.collection === "components/custom"`; a token without it → `node.collection` undefined.
- **helper unit** (`scanner.test.ts`): `declaredCustomComponents` on a graph with a `components/custom` sidebar token + a `components/global` button token → `Set(["sidebar"])`; `componentCollections` maps each.
- **`customPartsByComponent` unit**: `declaredCustom` adds a not-otherwise-custom component with `[]`; does NOT overwrite a `component-looks-custom` component's parts; registry parts preserved.
- **scanner warning unit**: a chip-like fixture (global collection + foreign `close`/`label` parts → `component-looks-custom`) emits `collection-anatomy-mismatch`; a sidebar-like fixture (custom collection) does not; a clean `components/global` component (no foreign parts) emits neither; a declared-custom component with no parts → `custom-without-parts`.
- **Full suite green.** No browser step required for correctness; optionally confirm the mismatch warning renders in ScanView via `/browse` (nice-to-have, not a gate).

## Out of scope / future

- Part-derivation for declared-custom components with no Nuxt analog (deferred + warned).
- Dropping `sidebar` from `KNOWN_CUSTOM_COMPONENTS` in favor of pure collection-detection — the registry still carries sidebar's `item` parts, so it stays; revisit once part-derivation exists.
- Demoting heuristic-custom components on a `components/global` declaration (rejected — heuristic wins; we warn instead).
- `layout/*` collection semantics (layout primitives already handled by their own renderer).

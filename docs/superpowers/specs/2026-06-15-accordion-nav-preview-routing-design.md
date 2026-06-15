# Accordion / Nav Preview Routing — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Bugfix (preview reachability)

## Problem

The `accordion` and `nav` live previews are **unreachable** in the inspector. Their export
tokens are prefixed `accordion-item-*` / `nav-item-*`, so the token tree groups them under
the labels `accordion-item` / `nav-item`. But `COMPONENTS_WITH_PREVIEW` and the recipe engine
key these components as `accordion` / `nav`. The mismatch breaks three group→preview seams:

- **Routing** — `ComponentTree` emits `select-component` with the top-level group segment
  (`accordion-item`); App.vue's handler sets `selectedComponent = "accordion-item"`, so
  `previewSupported` is false and neither preview chain renders.
- **"Live" pill** — `ComponentTree.hasPreview(path)` checks
  `previewComponents.has(path.split("/")[0])` = `has("accordion-item")` = false, so the row
  shows no pill and is hidden under the `liveOnly` filter.
- **Live count** — App.vue's `liveCount` filters group labels by
  `COMPONENTS_WITH_PREVIEW.has(node.label)`, excluding `accordion-item` / `nav-item`.

The recipe engine already maps `accordion-item-*` → the `accordion` component (a real recipe
exists for both `accordion` and `nav`); only the UI's group↔preview mapping doesn't reconcile.

### Why it surfaces now

The previous export fixture had no accordion tokens at all (`OLD_ACCORDION_PATHS []`). This
is the first export with real accordion/nav data, so the `-item` mismatch first bites here.

### Scope confirmed by probe

`buildLayeredTree` over the new export produces exactly two preview-supported components with
no matching group label: `accordion` (group `accordion-item`) and `nav` (group `nav-item`).
Every other preview-less group is correctly preview-less — the `*-overlay-dark/light` context
variants, the layout primitives (`container`, `grid`, `page`, `section`, `stack`), and
`typography`. None of those end in `-item`, so the fix below never touches them.

## Approach (chosen: normalize at one shared helper)

A single source of truth maps a group label to its preview component, used everywhere the
group↔preview mapping happens. New module `src/app/preview-component.ts`:

```ts
/** The preview component a tree group maps to: the label itself if preview-supported,
 *  else the label with a trailing `-item` part stripped if THAT is preview-supported
 *  (accordion-item → accordion, nav-item → nav), else the label unchanged. */
export function previewComponentForGroup(label: string, previewSet: ReadonlySet<string>): string {
  if (previewSet.has(label)) return label;
  const stripped = label.replace(/-item$/, "");
  if (stripped !== label && previewSet.has(stripped)) return stripped;
  return label;
}

/** Whether a tree group has a rendered live preview (after normalization). */
export function groupHasPreview(label: string, previewSet: ReadonlySet<string>): boolean {
  return previewSet.has(previewComponentForGroup(label, previewSet));
}
```

Wiring (each a one-liner):
- **App.vue `@select-component` handler** → `selectedComponent = previewComponentForGroup(name, COMPONENTS_WITH_PREVIEW)`. (Chain-1's existing gate `selectedNode.id.split('-')[0] === selectedComponent` already yields `accordion`, so both chains then align.)
- **App.vue `liveCount`** → filter `groupHasPreview(node.label, COMPONENTS_WITH_PREVIEW)`.
- **`ComponentTree.hasPreview`** → `groupHasPreview(component, props.previewComponents ?? new Set())` (drives both the pill and `liveOnly` visibility).

Result: clicking the `accordion-item` / `nav-item` group routes to the `accordion` / `nav`
preview, the row shows its "Live" pill, the live count includes it, and `liveOnly` keeps it
visible. Coherent across all three seams.

### Rejected alternatives

- **Re-group the tree** so `accordion-item-*` lands under `accordion`: `buildLayeredTree`
  drives the whole tree, which legitimately shows the literal token structure — broad
  regression risk for a localized problem.
- **Add `accordion-item`/`nav-item` to `COMPONENTS_WITH_PREVIEW`**: pollutes the set with
  non-component names and leaves the recipe key still mismatched.

## Out of scope (separate follow-up cycle)

The accordion **recipe** has two latent bugs that become visible once routing lands (they
change real `app.config.ts` output, so they need grammar/slot-mapping work, not a preview
patch):
- `size-5` on `slots.item` — the `accordion-item-icon-size` token lands on the item base
  (accordion has no icon slot), which would size the item to 20×20.
- `accordion-item-bg` is dropped (no `bg-[…]` in the slot).

Nav's recipe will be checked the same way once its preview is visible. Surfacing these via
the now-reachable preview is the intended way to confirm them before fixing.

**Not affected by this work:** `input` is already tokenized and reachable; `selectmenu` is not
yet in the Figma kit, so it has no preview by design (a `LiveSelectMenu` is added if/when it's
tokenized). Neither is an `-item` group, so neither interacts with this fix.

## Tests

- `src/app/preview-component.test.ts` (new) — the helper: `button`→`button`/true,
  `card`→`card`/true, `accordion-item`→`accordion`/true, `nav-item`→`nav`/true,
  `button-overlay-dark`→unchanged/false, `nav-item-overlay-dark`→unchanged/false,
  `container`→unchanged/false.
- `src/app/App.preview-routing.test.ts` (extend) — emitting `select-component("accordion-item")`
  renders `LiveAccordion`; `select-component("nav-item")` renders `LiveNav` (the handler
  normalization, exercised through the stubbed `ComponentTree`).
- `src/app/components/ComponentTree.test.ts` (create or extend) — a real `ComponentTree`
  mount: an `accordion-item` top-level group with `previewComponents = {…, accordion, …}`
  shows the "Live" pill, and `onGroupClick` is wired to the right segment; a non-preview
  group (`container`) shows no pill.

## Success criteria

- Selecting the `accordion` and `nav` groups renders `LiveAccordion` / `LiveNav` in the
  Inspector, with the "Live" pill on those rows and both counted in the Live filter.
- Helper unit-tested; full suite green; no change to the tree's displayed labels or to any
  non-`-item` group.

## Release

Patch release **v0.28.7** (CHANGELOG `### Fixed` + a note that the latent accordion recipe
bugs are a follow-up; README test-count bump; tag, merge, push, GitHub Release).

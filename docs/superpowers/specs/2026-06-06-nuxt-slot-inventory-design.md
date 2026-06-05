# Design: Nuxt slot/part inventory + unsupported-part hint

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/nuxt-slot-inventory`
- **Theme:** the per-Nuxt-component slot inventory (foundation) + its first consumer, a scanner
  hint that flags Figma tokens referencing a part Nuxt's component has no slot for. This is the
  precise, per-part version of "bucket 3 (unsupported)" — the over-firing aggregate
  `component-looks-custom` flag stays parked.

## Problem

The parked `component-looks-custom` flag over-fired (8/15, incl. button) because a raw
"unmapped-share" metric conflates three things: genuinely custom parts (chip `label`/`close`),
validation combos (`chip-bg-error`), and **sub-element slots Nuxt HAS but the adapter doesn't
route yet** (`dropdown-item`, `table-th`, `nav-item`, `button-overlay`). The missing
discriminator is a per-Nuxt-component **slot inventory**: it separates "Nuxt has no such slot
(custom)" from "Nuxt has this slot, the adapter just doesn't route it (incomplete)".

This cycle builds that inventory and its first consumer — a precise, per-part hint.

## Goal

1. A hand-authored `NUXT_SLOTS` inventory: per (Figma) component → the set of Nuxt theme slot
   names (`base`, `label`, `leadingIcon`, `item`, `th`, …).
2. A scanner detector that flags, once per (component, part), a Figma token whose **part**
   (the segment after the component) is **not** a Nuxt slot for that component — and is not a
   utility/variant/state (auto-excluded). It does **not** flag parts that ARE Nuxt slots (those
   are valid, just unrouted — routing is a later slice).

Success criteria (against the real export):
- `chip` → `label`, `close` flagged ("Nuxt chip has no label/close slot").
- `button` → `overlay` flagged (Nuxt button has no `overlay` slot).
- `dropdown`/`table`/`nav` → **not** flagged (their `item`/`th`/`item` parts are real Nuxt
  slots — confirmed e.g. DropdownMenu has an `item` slot).
- `checkbox`/`radio`/`switch` → **not** flagged for their `bg-*-error` tokens (the part `bg` is
  a mapped utility, auto-excluded — these are validation combos, not parts).
- One hint per (component, part), not per token. Scanner-only; no grammar/output change.
- Full suite + typecheck + build green; verified against the new export.

## Decisions

- **Hand-authored, not generated.** Nuxt UI bundles all themes minified into one hashed
  `node_modules/@nuxt/ui/dist/shared/ui.*.mjs` — no clean export, unlike Tailwind's `theme.css`.
  A generator would be brittle (hash + minification change per version). So `NUXT_SLOTS` is a
  hand-authored constant (like `RING_FRAMED_COMPONENTS`/`PROP_DRIVEN_STATES`), transcribed from
  each component's theme `slots` keys (fetched via the Nuxt UI MCP). Nuxt UI v4 is the pinned
  target, so drift is slow.
- **Theme `slots`, not Vue template slots.** The inventory uses the theme's styling slot keys
  (`base`/`label`/`leadingIcon`/…), which is what token *parts* reference — not the Vue content
  slots (`leading`/`default`/`trailing`).
- **"Referenced part" derived from the grammar, no utility word-list.** A part is the 2nd
  segment of a **null-mapped** token that does **not** appear as the 2nd segment of any
  **mapped** token for that component. This auto-excludes variants (button-`outline`-bg maps),
  utilities (chip-`bg` maps), and validation combos (chip-`bg`-error is null but `bg` is mapped
  via chip-bg). Only genuine parts (`label`, `close`, `item`, `overlay`) survive. The grammar
  itself is the authority on what's a utility — no hand-maintained word-list.
- **Flag only parts NOT in NUXT_SLOTS.** A referenced part that IS a Nuxt slot (`dropdown-item`)
  is valid-but-unrouted → not flagged (routing is the next slice). A component with no
  `NUXT_SLOTS` entry is skipped (can't judge) — safe (no false flag).
- **Severity `warning`** (the token produces no output, like the other deviation hints).
- **One hint per (component, part)** with example token ids — not per token (chip would be 10).

## Design

### 1. Inventory (`src/component-vocab.ts`)

```typescript
/**
 * Per-Figma-component → the Nuxt UI v4 theme slot ("part") names that component
 * defines. Hand-authored from each component's theme `slots` keys (Nuxt UI MCP);
 * Nuxt UI v4 is the pinned target. Keyed by the Figma component name as it
 * appears in token ids (chip, dropdown, nav); slots taken from the matching Nuxt
 * component (Chip, DropdownMenu, NavigationMenu). Used to tell "Nuxt has no such
 * slot (custom)" from "valid Nuxt slot the adapter doesn't route yet".
 */
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["button", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
  ["input", new Set(["root", "base", "leading", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailing", "trailingIcon"])],
  ["textarea", new Set(["root", "base", "leading", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailing", "trailingIcon"])],
  ["chip", new Set(["root", "base"])],
  ["badge", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
  ["dropdown", new Set([/* DropdownMenu: content,input,empty,viewport,arrow,group,label,separator,item,itemLeadingIcon,… */])],
  // … remaining allow-list components (card, checkbox, kbd, modal, nav, progress, radio, switch, table)
  // transcribed from their Nuxt themes at implementation time; see "Inventory data" below.
]);

export function nuxtSlotsFor(component: string): ReadonlySet<string> | undefined {
  return NUXT_SLOTS.get(component);
}
```

**Inventory data:** the full per-component slot sets are transcribed from each Nuxt component's
theme `slots` keys (via `get-component <X> theme`), provided to the implementer. The
Figma→Nuxt name map: `dropdown`→DropdownMenu, `nav`→NavigationMenu, `radio`→RadioGroup,
`modal`→Modal, `table`→Table, others 1:1. `typography` has no Nuxt component → no entry (skipped).

### 2. Detector (`src/scanner.ts`)

In `scanGraph`'s index loop, accumulate per component:
- `mappedSecondSegByComponent: Map<string, Set<string>>` — the 2nd segment (`id.split("-")[1]`)
  of every token whose `getSlotMapping` is **non-null**.
- `nullTokensByComponent: Map<string, {seg: string, id: string}[]>` — for every **null-mapped**
  token, its 2nd segment + id.

After the loop, for each component **that has a `NUXT_SLOTS` entry**:
```typescript
const slots = nuxtSlotsFor(comp);
if (!slots) continue;                       // can't judge an uninventoried component
const mapped = mappedSecondSegByComponent.get(comp) ?? new Set();
// referenced part = a null token's 2nd segment that no mapped token uses, and that Nuxt lacks.
const byPart = new Map<string, string[]>(); // part → example token ids
for (const { seg, id } of nullTokensByComponent.get(comp) ?? []) {
  if (seg === undefined || mapped.has(seg) || slots.has(seg)) continue;
  const arr = byPart.get(seg) ?? [];
  arr.push(id);
  byPart.set(seg, arr);
}
for (const [part, ids] of byPart) {
  issues.push({
    id: `up-${comp}-${part}`,
    category: "classification-hint",
    severity: "warning",
    kind: "unsupported-part",
    message:
      `Figma \`${comp}\` references a \`${part}\` part that Nuxt UI v4 \`${comp}\` has no slot ` +
      `for (e.g. ${ids.slice(0, 3).map((i) => `\`${i}\``).join(", ")}). These tokens are not ` +
      `mapped — \`${comp}\` may be a custom component, or the part is mis-named.`,
    tokenIds: ids,
    componentName: comp,
  });
}
```

Notes:
- `mapped.has(seg)` excludes utilities/variants/validation-combos; `slots.has(seg)` excludes
  valid-but-unrouted Nuxt parts. What remains is a genuine unsupported part.
- The accumulation reuses the existing index-loop `getSlotMapping` call (no extra mapping work):
  add the seg to `mappedSecondSegByComponent` in the non-null path, and to
  `nullTokensByComponent` in the `mapping === null` branch (alongside the existing
  validation-colour / state-via-prop / structural-unmapped handling — independent of them).

### Tests (`src/scanner.test.ts`)
- chip: `chip-label-text`, `chip-close-icon`, `chip-bg` (mapped) → exactly two `unsupported-part`
  warnings (`label`, `close`); none for `bg`; messages name the part + an example id.
- valid Nuxt part not flagged: a component in `NUXT_SLOTS` with a part that IS a slot (e.g.
  `dropdown-item-padding` with `dropdown` having `item`) → no `unsupported-part`.
- validation combo not flagged: `checkbox-bg-error` + `checkbox-bg` (mapped) → `bg` is in
  `mappedSecondSeg` → no `unsupported-part`.
- uninventoried component skipped: a token for a component with no `NUXT_SLOTS` entry → no hint.
- one-hint-per-part: multiple `chip-label-*` tokens → a single `label` hint listing examples.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Against the new export (transient swap, restore): the CLI scan lists `unsupported-part`
  warnings for `chip` (`label`, `close`) and `button` (`overlay`), and **none** for
  `dropdown`/`table`/`nav` (their item/th parts are real slots) or for the
  `checkbox`/`radio`/`switch` validation tokens. Note the exact set to confirm no over-fire.
- Headless (optional): open the scan pane, confirm the chip group shows the label/close warnings.

## Out of scope
- **Sub-element slot routing** (populate `SLOT_PREFIXES` from `NUXT_SLOTS` so `dropdown-item`
  maps) — the next slice; this cycle only *detects*, it does not route.
- **Rebuilding the `component-looks-custom` aggregate flag** on top of this — later.
- Variant/state capability (separate axis; `RING_FRAMED_VARIANTS`/`PROP_DRIVEN_STATES` cover
  parts of it).
- The Figma→Nuxt component **name** mapping as a first-class table (handled inline when
  transcribing the inventory).

## Risks
- **Inventory accuracy / drift.** Hand-authored from pinned Nuxt UI v4; the `unsupported-part`
  hint makes a wrong/missing slot visible rather than silently mis-mapping. Transcribed
  carefully from the themes (DropdownMenu `item` already verified).
- **Camel-case part names.** Nuxt slots are camelCase (`leadingIcon`); Figma parts are lowercase
  words. Mismatches only matter for *unmapped* parts; the parts in the real export
  (`label`/`close`/`overlay`/`item`/`th`) are single lowercase words that match the slot keys.
  A future mismatch would surface as a (reviewable) `unsupported-part` warning, not a silent bug.
- **Partial inventory.** Components without a `NUXT_SLOTS` entry are skipped (no flag) — safe;
  the inventory is populated for the full allow-list so coverage is broad.

---

## Revision (verification-driven, 2026-06-06)

Building the detector exactly as designed above over-fired on the real export: **13 warnings**
instead of ~3. chip(label/close) + button(overlay) were correct, but 7 were false positives —
`badge→letter` (a typo `letter-spaching`), `checkbox→size`/`checked`, `textarea→min`/`resize`,
`nav→ring`/`focus`. Root cause: the "mapped-2nd-seg" trick only excludes a 2nd segment if some
token with that exact segment maps; **utility/state/dimension words that appear only in
null-mapped tokens for a component** (size, min, resize, ring, letter, checked, focus) slip
through. The central claim "no utility word-list needed" is disproven.

The user's intent (confirmed): the warnings ARE a Figma-cleanup tool — typos and naming
mismatches *should* surface (to fix in Figma), but the utility/state/dimension false positives
must not. Decisions: **(a)** add a `NON_PART_SEGMENTS` exclusion; **(b)** add concrete rename
suggestions via a Figma→Nuxt part-alias map; **(c)** defer typo detection (a separate
"unrecognized-utility / did-you-mean" detector — its own cycle; the one typo `letter-spaching`
is fixed in Figma manually and is excluded here since `letter` ∈ `NON_PART_SEGMENTS`).

### Revised design

**`component-vocab.ts`** — two new exports:

```typescript
/** 2nd segments that are NEVER a sub-element part — utility/state/dimension words.
 * Excludes these from the unsupported-part detector (the mapped-2nd-seg trick alone
 * misses utility words that only appear in null-mapped tokens for a component). */
export const NON_PART_SEGMENTS: ReadonlySet<string> = new Set<string>([
  ...STATE_KEYS, // hover, active, disabled, focus, checked, default, hovered
  "selected", "visited",
  "size", "min", "max", "height", "width", "radius", "gap", "offset", "spacing", "padding",
  "font", "letter", "line", "text", "tracking", "leading", "weight", "family",
  "border", "bg", "ring", "overlay", "placeholder", "underline", "icon", "color",
  "fill", "stroke", "resize", "shadow",
]);

/** Figma part name → the Nuxt UI v4 slot it corresponds to (naming mismatch). Drives a
 * concrete "rename in Figma" suggestion. Only suggested when the aliased name is a real slot
 * of that component (self-validating). */
export const FIGMA_NUXT_PART_ALIAS: ReadonlyMap<string, string> = new Map([
  ["row", "tr"],
  ["divider", "separator"],
  ["check", "icon"],
]);
```

**`scanner.ts` detector** — a referenced part is flagged iff it is `!mapped.has(seg) &&
!slots.has(seg) && !NON_PART_SEGMENTS.has(seg)`. The message has two flavours:

- **Naming mismatch** (`FIGMA_NUXT_PART_ALIAS` has the part AND `slots.has(alias)`):
  `` `table-row-hover-bg` uses a `row` part. Nuxt UI v4 `table` calls this slot `tr` — rename in Figma (e.g. `table-tr-…`). (tokens: `table-row-hover-bg`, …) ``
- **Genuine missing / custom** (no valid alias):
  `` `chip-label-text` references a `label` part that Nuxt UI v4 `chip` has no slot for (slots: root, base). `chip` may be a custom component, or the part is mis-named. ``

### Revised expected result (real export)
After the revision, exactly: **chip→label/close** and **button→overlay** (custom/mis-named),
**table→row/divider** and **checkbox→check** (with rename suggestions). The 7 utility/state FPs
are gone. The typo `badge-letter-spaching` is not flagged this cycle (deferred to a typo
detector; fix in Figma).

### Out of scope (revision)
- The "unrecognized-utility / did-you-mean" typo detector (fuzzy-match) — separate cycle.
- Per-component alias scoping (the alias map is global; the `slots.has(alias)` self-validation
  prevents a wrong suggestion on a component that lacks the aliased slot).

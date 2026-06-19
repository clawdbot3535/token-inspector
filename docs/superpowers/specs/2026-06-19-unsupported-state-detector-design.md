# Design Spec — Bucket 3: unsupported-state detector (stateless components)

**Date:** 2026-06-19
**Status:** Approved
**Topic:** A state token on a component that has **no** interaction states at all (kbd → UKbd) currently emits an inert pseudo-class prefix. Recognize stateless components, drop the token, and flag a new `unsupported-state` deviation — completing the capability-deviation trilogy (real pseudo-class / prop-driven / unsupported).

## Context

The grammar's `STATE_KEYS` is global, so any component's `*-active`/`*-hover`/… token gets a `state:` prefix regardless of whether the real Nuxt component supports that state. Three buckets (see [[nuxt-state-variant-capability-deviation]]):

1. **Real CSS pseudo-class** (hover/focus/disabled on button/input) → `state:` prefix works.
2. **Prop-driven** (input/textarea `active` → `highlight`; nav `active` → the `active` variant, shipped v0.42.0) → `PROP_DRIVEN_STATES` drops + flags `state-via-prop`.
3. **Unsupported by that component** → this spec.

The live export has `kbd-bg-active`, which today maps to `{slot:"base", utilityType:"bg-color", statePrefix:"active"}` → emits `active:bg-[…]`. But Nuxt UI v4's `UKbd` is a static key display with **no** hover/active/focus/disabled — so the class is inert. This is the genuine Bucket-3 case. (The original chip seed from the bucket memory is now stale: chip became a **custom** component — hand-built, designer-controlled recipe — so its states are not "unsupported"; chip/sidebar are excluded.)

## Changes

### 1. Grammar — `STATELESS_COMPONENTS` (`packages/grammar/src/component-vocab.ts`)

A new set mirroring `PROP_DRIVEN_STATES`, near it:

```ts
/**
 * Components mapped to Nuxt UI v4 components that expose NO interaction states at all
 * (UKbd is a static key display — no hover/active/focus/disabled). Any state token on these
 * is unexpressible: the grammar drops it and the scanner flags an `unsupported-state` deviation.
 * Distinct from PROP_DRIVEN_STATES (there a prop drives the state; here the state does not exist).
 * Seed: kbd (the live-export case `kbd-bg-active`). badge/card/progress are candidate additions
 * when an export carries their state tokens; custom components (chip/sidebar) are excluded.
 */
export const STATELESS_COMPONENTS: ReadonlySet<string> = new Set(["kbd"]);
```

Auto-exported from `@tg/grammar` (the index does `export * from "./component-vocab.js"`).

### 2. Grammar drop (`packages/grammar/src/slot-mapping.ts`)

Import `STATELESS_COMPONENTS` (from `./component-vocab.js`, alongside the existing `STATE_KEYS`/`propDrivenStateFor` imports) and add a guard directly after the prop-driven drop (currently ~line 387-389):

```ts
  // Stateless components (kbd) expose NO interaction states — a state token here can't be
  // expressed as a recipe class; drop it. The scanner flags it as `unsupported-state`.
  if (parsed.state !== null && parsed.state !== "default" && STATELESS_COMPONENTS.has(parsed.component)) {
    return null;
  }
```

Result: `kbd-bg-active` → `null` (no inert `active:`); `kbd-bg` (no state) still maps to `{slot:"base", bg-color}`.

### 3. Scanner (`src/scanner.ts`)

Import `STATELESS_COMPONENTS` and `STATE_KEYS` from `@tg/grammar`. Add a detector helper next to `propDrivenStateForId`:

```ts
/** {state} when the token's trailing segment is an interaction state on a stateless component, else null. */
function unsupportedStateForId(id: string): { state: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  const last = segs[segs.length - 1]!;
  if (!STATELESS_COMPONENTS.has(component)) return null;
  if (last === "default" || !STATE_KEYS.has(last)) return null;
  return { state: last };
}
```

In the existing `if (mapping === null) { … }` block, after the `pd` (`state-via-prop`) push and before the null-token accounting (`const nseg = …`), add an independent check:

```ts
      const us = unsupportedStateForId(node.id);
      if (us !== null) {
        issues.push({
          id: `us-${node.id}`,
          category: "classification-hint",
          severity: "warning",
          kind: "unsupported-state",
          message:
            `\`${node.id}\` targets the \`${us.state}\` state, but Nuxt UI v4's \`${prefix}\` is a ` +
            `stateless component (no hover/active/focus/disabled) — so no \`ui.${prefix}\` override is emitted.`,
          tokenIds: [node.id],
          componentName: prefix,
        });
      }
```

`prefix` is the already-computed `node.id.split("-")[0]`. `ScanIssue.kind` is typed `string` (token-graph.ts), so `"unsupported-state"` needs no type change. `pd` and `us` are mutually exclusive (kbd is not in `PROP_DRIVEN_STATES`), so the two checks are independent `if`s. The token is still recorded in `nullTokensByComponent` (same as prop-driven tokens) — consistent existing behavior.

## Data flow

`kbd-bg-active` → parsed (`component:"kbd"`, `state:"active"`) → slot-mapping's stateless guard returns `null` (dropped; no recipe class) → recipe-engine emits nothing for it → scanner's `mapping === null` branch: `unsupportedStateForId` → `{state:"active"}` → an `unsupported-state` warning in the scan report.

## Error handling / edge cases

- A stateless-component **non-state** token (`kbd-bg`, `kbd-radius`) is unaffected — the guard requires a non-default `parsed.state`.
- A **non-stateless** component's state token (`button-solid-bg-active`, `input-bg-hover`) is unaffected — `button`/`input` aren't in `STATELESS_COMPONENTS`.
- `prefix` not in the scan allow-list → the whole token is skipped earlier (`if (!allowSet.has(prefix)) continue;`), so no spurious warning for unselected components.
- The detector keys on `segs[0]` and the trailing segment, matching `propDrivenStateForId`'s convention.

## Testing

- **Grammar unit** (`component-vocab.test.ts`): `STATELESS_COMPONENTS.has("kbd")` is `true`; `STATELESS_COMPONENTS.has("button")` is `false`.
- **Grammar unit** (`slot-mapping.test.ts`): `heuristicSlotMapping("kbd-bg-active", "color")` returns `null`; `heuristicSlotMapping("kbd-bg", "color")` is non-null (base bg still maps); `heuristicSlotMapping("button-solid-bg-active", "color")` is non-null (non-stateless component unaffected).
- **Scanner unit** (`scanner.test.ts`): a graph with `kbd-bg-active` (component allow-listed) yields an `unsupported-state` warning naming the `active` state and `kbd`; a graph with `button-solid-bg-active` yields no `unsupported-state` issue.
- **Recipe-engine** (`recipe-engine.test.ts`): a kbd recipe built from a graph with `kbd-bg-active` contains no `active:` classes.
- **Full suite green.** If a pre-existing test asserted `kbd-bg-active` maps or emits `active:`, update it to the dropped/flagged behavior (none expected; the suite is authoritative).
- **No browser verification** — emit/scan change, not a render change.

## Out of scope / future

- badge/card/progress in `STATELESS_COMPONENTS` — add when an export carries their state tokens (none today).
- Custom components (chip/sidebar) — designer-controlled hand-built recipes; their states are not "unsupported."
- dropdown/table — they have real states (`data-highlighted` hover, selected); a per-component supported-states map (rejected here for YAGNI) would be the tool for those partial cases.
- Phase C (hover/focus/active pseudo-states) remains CDP-blocked.

# Component Anatomy Spec — nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the `component-anatomy.ts` data layer (model + nav's 30-slot structural/optional classification), the foundation for the coverage guide.

**Architecture:** A pure data module in `@tg/grammar` next to `component-vocab.ts`; keyed by component, mirrors `NUXT_SLOTS` exactly. No logic, no consumer yet — additive data + an `anatomyFor` accessor, guarded by a 100%-coverage test invariant.

**Tech Stack:** TypeScript (`@tg/grammar`), Vitest.

---

## Task 1: anatomy module + tests (TDD)

**Files:**
- Create: `packages/grammar/src/component-anatomy.ts`
- Test: `packages/grammar/src/component-anatomy.test.ts`
- Modify: `packages/grammar/src/index.ts` (barrel export)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { anatomyFor, COMPONENT_ANATOMY } from "./component-anatomy.js";
import { nuxtSlotsFor } from "./component-vocab.js";

describe("component-anatomy — nav", () => {
  it("covers exactly the nav NUXT_SLOTS (no missing, no extra)", () => {
    const anatomy = anatomyFor("nav");
    expect(anatomy).toBeDefined();
    const slots = nuxtSlotsFor("nav")!;
    expect(new Set(anatomy!.keys())).toEqual(new Set(slots));
  });

  it("classifies exactly {root,list,item,link} as structural", () => {
    const anatomy = anatomyFor("nav")!;
    const structural = [...anatomy.entries()].filter(([, a]) => a.classification === "structural").map(([s]) => s);
    expect(new Set(structural)).toEqual(new Set(["root", "list", "item", "link"]));
  });

  it("every slot has a valid classification + a non-empty controls string (<=60 chars)", () => {
    for (const [, a] of anatomyFor("nav")!) {
      expect(["structural", "optional"]).toContain(a.classification);
      expect(a.controls.length).toBeGreaterThan(0);
      expect(a.controls.length).toBeLessThanOrEqual(60);
    }
  });

  it("returns undefined for an uncurated component", () => {
    expect(anatomyFor("button")).toBeUndefined();
    expect(COMPONENT_ANATOMY.has("button")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npx vitest run packages/grammar/src/component-anatomy.test.ts`
Expected: FAIL (cannot find `./component-anatomy.js`).

- [ ] **Step 3: Implement `component-anatomy.ts`**

```ts
// Per-component Nuxt UI v4 theme anatomy: each slot classified structural vs optional, with a
// one-line "what it controls". The foundation of the coverage guide — it lets the engine report
// which parts of a component a design still needs to cover. Keys mirror NUXT_SLOTS exactly
// (enforced by component-anatomy.test.ts). Curated from the Nuxt UI v4 component themes.

export type SlotClassification = "structural" | "optional";

export interface SlotAnatomy {
  /** structural = must design to match the base component; optional = adornment / variant / sub-feature. */
  classification: SlotClassification;
  /** Short (<=60 char) phrase naming the visual the slot governs (for the to-design list). */
  controls: string;
}

const s = (controls: string): SlotAnatomy => ({ classification: "structural", controls });
const o = (controls: string): SlotAnatomy => ({ classification: "optional", controls });

// nav — Nuxt UI v4 NavigationMenu. structural = base navbar (root/list/item/link); the rest are
// adornments (icons/avatars/badges), the submenu cluster, and grouping. (Classification locked
// 2026-06-16 with the user; see the design spec.)
const NAV: ReadonlyMap<string, SlotAnatomy> = new Map([
  ["root", s("navbar container: layout (flex), gap, orientation")],
  ["list", s("items wrapper: layout / alignment of the entries")],
  ["item", s("each entry container: vertical spacing")],
  ["link", s("link: text, padding, bg, hover, active, ring, radius")],
  ["label", o("section heading text (grouped navs)")],
  ["linkLeadingIcon", o("leading icon size / colour on a link")],
  ["linkLeadingAvatar", o("leading avatar on a link")],
  ["linkLeadingAvatarSize", o("leading avatar size token")],
  ["linkLeadingChipSize", o("leading chip size token")],
  ["linkTrailing", o("trailing slot container (badge / icon)")],
  ["linkTrailingBadge", o("trailing badge on a link")],
  ["linkTrailingBadgeSize", o("trailing badge size token")],
  ["linkTrailingIcon", o("trailing / chevron icon (rotates on open)")],
  ["linkLabel", o("link text wrapper (truncate; inherits from link)")],
  ["linkLabelExternalIcon", o("external-link indicator icon")],
  ["childList", o("submenu list container")],
  ["childLabel", o("submenu section label")],
  ["childItem", o("submenu item container")],
  ["childLink", o("submenu link: text, padding, hover, active")],
  ["childLinkWrapper", o("submenu link content wrapper")],
  ["childLinkIcon", o("submenu link icon")],
  ["childLinkLabel", o("submenu link label text")],
  ["childLinkLabelExternalIcon", o("submenu external-link icon")],
  ["childLinkDescription", o("submenu link description text")],
  ["separator", o("divider between items / groups")],
  ["viewportWrapper", o("dropdown viewport positioning wrapper")],
  ["viewport", o("dropdown panel: bg, shadow, radius, ring")],
  ["content", o("dropdown content container + animation")],
  ["indicator", o("active-item indicator bar")],
  ["arrow", o("dropdown arrow / caret")],
]);

/** Per-component, per-slot anatomy. Keys mirror NUXT_SLOTS exactly (100% coverage required). */
export const COMPONENT_ANATOMY: ReadonlyMap<string, ReadonlyMap<string, SlotAnatomy>> = new Map([
  ["nav", NAV],
]);

/** The anatomy of a component, or undefined if not curated yet. */
export function anatomyFor(component: string): ReadonlyMap<string, SlotAnatomy> | undefined {
  return COMPONENT_ANATOMY.get(component);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/grammar/src/component-anatomy.test.ts`
Expected: PASS (4 tests). If the coverage test fails, a slot is mis-spelled vs `NUXT_SLOTS.nav` — fix the key, not the test.

- [ ] **Step 5: Barrel export**

Add to `packages/grammar/src/index.ts` (so future consumers — coverage engine, web app — import from `@tg/grammar`):

```ts
export { COMPONENT_ANATOMY, anatomyFor, type SlotAnatomy, type SlotClassification } from "./component-anatomy.js";
```

(Match the file's existing export style — verify how `component-vocab` symbols are re-exported and mirror it.)

- [ ] **Step 6: Full suite + commit**

Run: `npm test` — expect all green. Record the exact total test count.

```bash
git add packages/grammar/src/component-anatomy.ts packages/grammar/src/component-anatomy.test.ts packages/grammar/src/index.ts
git commit -m "feat(grammar): component-anatomy layer + nav classification (coverage-guide foundation)"
```

---

## Task 2: Release v0.28.12

**Files:** `CHANGELOG.md`, `README.md`, `package.json`

- [ ] **Step 1: CHANGELOG** (`Edit`, insert below `# Changelog`)

```markdown
## [0.28.12] — 2026-06-16

### Added

- **Component-anatomy layer (coverage-guide foundation)** — `packages/grammar/src/component-anatomy.ts`
  classifies each Nuxt UI theme slot as `structural` (must design to match the base component) or
  `optional` (adornment / variant / sub-feature), with a one-line "what it controls." Seeded with
  `nav` (all 30 `NavigationMenu` slots; structural = `root`/`list`/`item`/`link`), grounded in the
  Nuxt UI v4 theme. A 100%-coverage test ties the anatomy to `NUXT_SLOTS`. Additive data — no
  user-facing behaviour yet; it backs the upcoming design-coverage guide (see
  `docs/superpowers/specs/2026-06-16-component-anatomy-nav-design.md`).
```

- [ ] **Step 2: README test count** — bump `README.md:248` to the exact total from Task 1 Step 6.

- [ ] **Step 3: Bump + tag**

```bash
npm version 0.28.12 --no-git-tag-version
git add -A
git commit -m "chore(release): v0.28.12 — component-anatomy layer (nav)"
git tag v0.28.12
```

- [ ] **Step 4: Merge, push, release**

```bash
git checkout main
git merge --ff-only feat/component-anatomy-nav
gh auth switch --user clawdbot3535
git push origin main && git push origin v0.28.12
gh release create v0.28.12 --repo clawdbot3535/token-inspector \
  --title "v0.28.12 — component-anatomy layer (nav)" \
  --notes "Adds the component-anatomy layer: each Nuxt theme slot tagged structural vs optional + a one-line 'what it controls'. Seeded with nav (30 NavigationMenu slots; structural = root/list/item/link), grounded in Nuxt UI v4. 100%-coverage test ties it to NUXT_SLOTS. Additive data — foundation for the design-coverage guide (office-hours direction). No user-facing change yet."
gh auth switch --user d56de
git branch -d feat/component-anatomy-nav
```

- [ ] **Step 5: Update memory** — mark nav anatomy DONE in `matching-strategy-conclusion.md`; next composites = accordion/dropdown/table/modal, then the coverage engine (Step 2). Bump test count.

---

## Self-Review

**Spec coverage:** the data model + nav's 30-slot classification (Task 1), the 100%-coverage + structural-set + shape invariants (Task 1 tests), barrel export, release (Task 2). The other four composites + the coverage engine + UI are out of scope per the spec. All present.

**Placeholder scan:** none.

**Type/name consistency:** `SlotClassification` / `SlotAnatomy` / `COMPONENT_ANATOMY` / `anatomyFor` consistent across module, test, barrel. The nav keys are copied from `NUXT_SLOTS.nav` (30) — the coverage test fails loudly on any mismatch.

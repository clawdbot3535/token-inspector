# Nuxt slot inventory + unsupported-part hint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hand-authored `NUXT_SLOTS` inventory (per Figma component → Nuxt theme slot names) plus a scanner detector that flags, once per (component, part), a Figma token whose part (2nd segment) is not a Nuxt slot for that component — auto-excluding utilities/variants/validation-combos.

**Architecture:** Task 1 adds the inventory data + helper to `component-vocab.ts`. Task 2 adds the detector to `scanner.ts`: accumulate, per component, the 2nd-segments of mapped tokens and the (2nd-segment, id) of null-mapped tokens; after the loop, a referenced part = a null token's 2nd segment that no mapped token uses; flag those not in `NUXT_SLOTS`.

**Tech Stack:** TypeScript engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/nuxt-slot-inventory` (spec committed at `78f6598`).

**Spec:** `docs/superpowers/specs/2026-06-06-nuxt-slot-inventory-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` — get arities right by hand. `scanGraph(graph, options)` is 2-arg; `makeNode`/`makeGraph` helpers are at the top of `src/scanner.test.ts`.
- The slot data below is transcribed from the live Nuxt UI v4 themes (verified via MCP). DropdownMenu has `item`, Table has `th`, NavigationMenu has `item`/`link` — so those components do NOT flag.

---

### Task 1: `NUXT_SLOTS` inventory + helper

**Files:**
- Modify: `src/component-vocab.ts` (append after the existing exports)
- Test: `src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/component-vocab.test.ts`, add `NUXT_SLOTS, nuxtSlotsFor` to the import, and append:

```typescript
describe("NUXT_SLOTS / nuxtSlotsFor", () => {
  it("knows chip has only root/base (no label/close)", () => {
    const chip = nuxtSlotsFor("chip");
    expect(chip?.has("base")).toBe(true);
    expect(chip?.has("label")).toBe(false);
    expect(chip?.has("close")).toBe(false);
  });
  it("knows the sub-element slots that exist (dropdown item, table th, nav item)", () => {
    expect(nuxtSlotsFor("dropdown")?.has("item")).toBe(true);
    expect(nuxtSlotsFor("table")?.has("th")).toBe(true);
    expect(nuxtSlotsFor("nav")?.has("item")).toBe(true);
  });
  it("returns undefined for an uninventoried component", () => {
    expect(nuxtSlotsFor("typography")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: FAIL — symbols not exported.

- [ ] **Step 3: Add the inventory + helper**

Append to `src/component-vocab.ts`:

```typescript
/**
 * Per-Figma-component → the Nuxt UI v4 theme slot ("part") names that component
 * defines. Hand-authored from each component's theme `slots` keys (Nuxt UI MCP;
 * Nuxt UI v4 is the pinned target). Keyed by the Figma component name as it
 * appears in token ids (chip, dropdown, nav); slots taken from the matching Nuxt
 * component (Chip, DropdownMenu, NavigationMenu, …). Used to tell "Nuxt has no
 * such slot (custom/mis-named)" from "valid Nuxt slot the adapter doesn't route
 * yet". Covers the parts-bearing + form/display components; the rest of the
 * allow-list (card, kbd, modal, progress, radio, switch) have no referenced
 * parts today — add their slot sets here when they do (the detector skips
 * uninventoried components safely).
 */
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["button", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
  ["badge", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
  ["input", new Set(["root", "base", "leading", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailing", "trailingIcon"])],
  ["textarea", new Set(["root", "base", "leading", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailing", "trailingIcon"])],
  ["chip", new Set(["root", "base"])],
  ["checkbox", new Set(["root", "container", "base", "indicator", "icon", "wrapper", "label", "description"])],
  ["dropdown", new Set([
    "content", "input", "empty", "viewport", "arrow", "group", "label", "separator",
    "item", "itemLeadingIcon", "itemLeadingAvatar", "itemLeadingAvatarSize", "itemTrailing",
    "itemTrailingIcon", "itemTrailingKbds", "itemTrailingKbdsSize", "itemWrapper", "itemLabel",
    "itemDescription", "itemLabelExternalIcon",
  ])],
  ["table", new Set(["root", "base", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "separator", "empty", "loading"])],
  ["nav", new Set([
    "root", "list", "label", "item", "link", "linkLeadingIcon", "linkLeadingAvatar",
    "linkLeadingAvatarSize", "linkLeadingChipSize", "linkTrailing", "linkTrailingBadge",
    "linkTrailingBadgeSize", "linkTrailingIcon", "linkLabel", "linkLabelExternalIcon",
    "childList", "childLabel", "childItem", "childLink", "childLinkWrapper", "childLinkIcon",
    "childLinkLabel", "childLinkLabelExternalIcon", "childLinkDescription", "separator",
    "viewportWrapper", "viewport", "content", "indicator", "arrow",
  ])],
]);

/** The Nuxt UI v4 theme slot names for a Figma component, or undefined if not inventoried. */
export function nuxtSlotsFor(component: string): ReadonlySet<string> | undefined {
  return NUXT_SLOTS.get(component);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/component-vocab.ts src/component-vocab.test.ts
git commit -m "feat(vocab): NUXT_SLOTS inventory (per-component Nuxt theme slot names)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: Unsupported-part scanner detector

**Files:**
- Modify: `src/scanner.ts` (import; accumulators near `componentTokens` ~line 85; record in the index loop ~lines 94-129; emit after the loop ~line 180, before "Per-component analysis")
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/scanner.test.ts` (new `describe`):

```typescript
describe("scanGraph — unsupported-part hint (slot inventory)", () => {
  it("flags chip label/close parts (Nuxt chip has no such slot), not bg", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-label-text-disabled", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
      makeNode({ id: "chip-close-icon", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const ups = report.issues.filter((i) => i.kind === "unsupported-part");
    expect(ups.map((i) => i.id).sort()).toEqual(["up-chip-close", "up-chip-label"]);
    const labelHit = ups.find((i) => i.id === "up-chip-label")!;
    expect(labelHit.severity).toBe("warning");
    expect(labelHit.componentName).toBe("chip");
    expect(labelHit.message).toContain("label");
    expect(labelHit.tokenIds).toContain("chip-label-text");
    // bg is a mapped utility → never flagged as a part
    expect(report.issues.find((i) => i.kind === "unsupported-part" && i.id === "up-chip-bg")).toBeUndefined();
  });

  it("does not flag a part that IS a Nuxt slot (dropdown item)", () => {
    const graph = makeGraph([
      makeNode({ id: "dropdown-item-padding", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "dropdown-item-hover-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const report = scanGraph(graph, { components: ["dropdown"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part")).toBeUndefined();
  });

  it("does not flag a validation combo on a mapped utility segment (checkbox-bg-error)", () => {
    const graph = makeGraph([
      makeNode({ id: "checkbox-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "checkbox-bg-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["checkbox"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part")).toBeUndefined();
  });

  it("skips an uninventoried component (no NUXT_SLOTS entry)", () => {
    const graph = makeGraph([
      makeNode({ id: "widget-thing-color", layer: "component", type: "color", source: "global", base: "#000000" }),
    ]);
    const report = scanGraph(graph, { components: ["widget"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part")).toBeUndefined();
  });

  it("emits one hint per part across multiple tokens", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-label-text-disabled", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const labelHits = report.issues.filter((i) => i.kind === "unsupported-part" && i.id === "up-chip-label");
    expect(labelHits).toHaveLength(1);
    expect(labelHits[0]!.tokenIds.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — no `unsupported-part` issues emitted.

- [ ] **Step 3: Import the helper**

In `src/scanner.ts`, add `nuxtSlotsFor` to the `./component-vocab.js` import.

- [ ] **Step 4: Add the accumulators**

Next to `const componentTokens = new Map<string, ComponentEntry[]>();` (~line 85), add:

```typescript
  const mappedSecondSegByComponent = new Map<string, Set<string>>();
  const nullTokensByComponent = new Map<string, { seg: string; id: string }[]>();
```

- [ ] **Step 5: Record segments in the index loop**

In the index loop, INSIDE the `if (mapping === null) { … }` block, right before its closing `continue;` (~line 128), record the null token (its 2nd segment + id):

```typescript
      const nseg = node.id.split("-")[1];
      if (nseg !== undefined) {
        const nl = nullTokensByComponent.get(prefix) ?? [];
        nl.push({ seg: nseg, id: node.id });
        nullTokensByComponent.set(prefix, nl);
      }
      continue;
```

And for the NON-null path, right after the `if (mapping === null) { … }` block ends (~line 129, before the D2c unframed-variant hint), record the mapped 2nd segment:

```typescript
    const mseg = node.id.split("-")[1];
    if (mseg !== undefined) {
      const ms = mappedSecondSegByComponent.get(prefix) ?? new Set<string>();
      ms.add(mseg);
      mappedSecondSegByComponent.set(prefix, ms);
    }
```

- [ ] **Step 6: Emit the unsupported-part hints after the loop**

After the index loop closes (~line 179) and before the `// ─── 3. Per-component analysis` section (~line 181), add:

```typescript
  // Unsupported-part hint: a Figma token whose part (2nd segment) is not a Nuxt
  // slot for that component, and is not a utility/variant/validation segment
  // (those appear on a mapped token, so they're in mappedSecondSeg). One warning
  // per (component, part). Components with no NUXT_SLOTS entry are skipped.
  for (const [comp, nullToks] of nullTokensByComponent) {
    const slots = nuxtSlotsFor(comp);
    if (!slots) continue;
    const mapped = mappedSecondSegByComponent.get(comp) ?? new Set<string>();
    const byPart = new Map<string, string[]>();
    for (const { seg, id } of nullToks) {
      if (mapped.has(seg) || slots.has(seg)) continue;
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
          `Figma \`${comp}\` references a \`${part}\` part that Nuxt UI v4 \`${comp}\` has no ` +
          `slot for (e.g. ${ids.slice(0, 3).map((i) => `\`${i}\``).join(", ")}). These tokens ` +
          `are not mapped — \`${comp}\` may be a custom component, or the part is mis-named.`,
        tokenIds: ids,
        componentName: comp,
      });
    }
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — chip flags label+close (not bg); dropdown item not flagged; checkbox-bg-error not flagged; uninventoried skipped; one hint per part.

- [ ] **Step 8: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (no regression — the accumulators only add `unsupported-part` issues for inventoried components with genuine parts).

- [ ] **Step 9: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): unsupported-part hint from the Nuxt slot inventory"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Against the new export (transient swap, restore after — `assets/tokens-20260605-123353.zip`): `npm run build:tokens`; in the CLI scan confirm `unsupported-part` warnings for `chip` (`label`, `close`) and `button` (`overlay`), and **none** for `dropdown`/`table`/`nav` (item/th are real slots) or the `checkbox`/`radio`/`switch` validation tokens. List the exact `unsupported-part` set to confirm no over-fire. Restore: `git checkout components/ && npm run build:tokens`.
- [ ] Headless (optional): open the scan pane, confirm the `chip` group shows the label/close warnings.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** inventory + helper (Task 1), referenced-part detector + one-hint-per-part (Task 2). The detector derivation (null 2nd-seg ∉ mapped 2nd-seg ∉ NUXT_SLOTS) matches the spec; auto-excludes variants/utilities/validation.
- **Disjoint & additive:** the accumulators piggyback on the existing `getSlotMapping` call; the emit loop only adds `unsupported-part` issues; no existing detector touched.
- **Verified data:** DropdownMenu `item`, Table `th`, NavigationMenu `item`/`link` confirmed via MCP → dropdown/table/nav do not flag. `button-overlay` flags (no `overlay` slot); `nav-overlay-bg` does NOT flag (it maps to the `overlay-bg` utility, so `overlay` ∈ mappedSecondSeg for nav).
- **No placeholders:** every step has full code + exact command + expected result.

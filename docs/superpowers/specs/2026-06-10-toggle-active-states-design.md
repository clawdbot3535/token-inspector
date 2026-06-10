# Design: toggle active states — scan-view switch + commit panel

- **Date:** 2026-06-10
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/toggle-active-states` (off `main`, independent of `feat/icon-slot-mirror`)
- **Theme:** two header toggles flip UI state without showing it. Give the scan-view switch (both
  triggers) and the `Commit…` toggle clear, consistent active states + ARIA.

## Problem / goal (audit findings)

1. **Scan/Inspector switch has no perceivable state.** Two triggers toggle `state.view`:
   the header **"· N issues"** button (App.vue ~452; only `text-warning hover:underline`) and the
   **`HeaderStatusStrip`** row (has `bg-zinc-100 dark:bg-zinc-800` when active — barely visible,
   and a different treatment than the issues button, which has none).
2. **`Commit…` (`commit-open`) is a toggle that looks like an action.** Browser-verified: bg is
   transparent before AND after opening the panel.

Success criteria:
- In scan view, BOTH scan triggers visibly show the pressed state with one shared treatment, and
  carry `aria-pressed`. Clicking either returns to the inspector (unchanged behaviour).
- `Commit…` shows a pressed look while the panel is open and carries `aria-expanded`.
- No other visual/behaviour changes. Suite + typecheck + build green; headless QA confirms the
  states visually.

## Decisions

- **One shared "pressed" treatment for the scan triggers**, anchored on the strip's existing
  language but made perceptible: active = `bg-zinc-100 dark:bg-zinc-800` **plus**
  `ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700`. The issues button additionally keeps its
  `text-warning` identity and gains `rounded px-1` so the pressed pill has a shape.
- **`Commit…` reuses its own hover colour as the pressed state** (`bg-elevated`), so open ⇒ looks
  like "held down": `:class="showCommitPanel ? 'bg-elevated' : 'hover:bg-elevated/80'"`, plus
  `:aria-expanded="showCommitPanel"`.
- **ARIA:** `aria-pressed` on both scan triggers (toggle buttons), `aria-expanded` on `Commit…`
  (disclosure). No roles changed — they are already `<button>`s.
- **No header-button unification (option C)** — explicitly out of scope per user decision.

## Design

### `src/app/App.vue`
- Issues button (~452):
  ```vue
            <button
              v-if="issueCount > 0"
              class="text-warning hover:underline rounded px-1"
              :class="state.view.value === 'scan' ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700' : ''"
              :aria-pressed="state.view.value === 'scan'"
              @click="state.view.value = state.view.value === 'scan' ? 'inspector' : 'scan'"
            >
  ```
- `commit-open` button (~494):
  ```vue
            :class="showCommitPanel ? 'bg-elevated' : 'hover:bg-elevated/80'"
            :aria-expanded="showCommitPanel"
  ```
  (replacing the static `hover:bg-elevated/80` inside the existing class string; the rest of the
  classes stay.)

### `src/app/components/HeaderStatusStrip.vue`
- Strengthen the active binding and add ARIA:
  ```vue
    :class="scanViewActive ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700' : ''"
    :aria-pressed="scanViewActive"
  ```

### Tests
- `HeaderStatusStrip.test.ts` (extend the existing component test): with `scanViewActive: true`
  the root button has `aria-pressed="true"` and the ring class; with `false` → `aria-pressed="false"`,
  no ring class.
- `App.test.ts` (extend the smoke test): after clicking `commit-open`, the button has
  `aria-expanded="true"` (and `"false"` before). The issues-button binding is covered by visual QA
  (the smoke graph may not produce issues; do not contrive one).

### Verification
- `npm run typecheck && npx vitest run && npm run build`.
- Headless QA: load the export; open scan via the strip → strip AND issues button show the pressed
  treatment; back to inspector → cleared; open the commit panel → `Commit…` shows `bg-elevated`
  and `aria-expanded=true`. Screenshots of both states.

## Out of scope
- Header button-language unification (C); any ScanView-internal changes (its tabs already have
  states); new toggles.

## Risks
- Minimal — class/ARIA additions only. The ring treatment must be checked in dark mode (headless
  QA covers light; dark spot-checked via the theme toggle).

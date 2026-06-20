# Q2a — "Live Build" via StackBlitz-SDK Embed — Design Spec

**Status:** Draft for review
**Date:** 2026-06-20
**Topic:** Embed the generated kit's **real build** inside the inspector via an in-app iframe, so the user sees the build-time-Tailwind render of their components **without a local `npm i`**. This is **Q2a** — Phase 1 of the "(Q) true-export fidelity" north star endgame, using the **StackBlitz SDK** as a zero-licence, zero-header de-risking substrate. Phase 2 (Q2b, parked) swaps in self-hosted `@webcontainer/api`.

---

## Mission context

Q1 (v0.52.0) made the inspector **emit** a complete runnable Vite+Vue+@nuxt/ui kit (`buildKitFiles(graph) → ExportFile[]`), validated by a local `npm i && vite build`. The remaining gap to the endgame is **showing that real build inside the inspector** — closing the loop so the user never leaves the app to see the literal product.

A feasibility recon (this session) established the substrate landscape: only **WebContainers** (StackBlitz) and **Nodebox** (CodeSandbox, stale/abandoned) run a *real* Node/npm/Vite — and therefore the real `@tailwindcss/vite` + `@nuxt/ui/vite` plugins — in the browser. Sandpack's classic bundler is a custom transpiler that **cannot load a Vite plugin**, so it is disqualified for fidelity. WebContainers can be consumed two ways: **self-hosted `@webcontainer/api`** (our domain, but requires `COOP/COEP` cross-origin-isolation headers + a StackBlitz licence-key handshake) or the **StackBlitz SDK** (`embedProject`, runs the WebContainer inside stackblitz.com's own isolated iframe — **no host headers, no licence, free**).

**Decision (review-approved):** **de-risk via the StackBlitz SDK first** (Phase 1, this spec), then migrate to self-hosted `@webcontainer/api` once `@nuxt/ui` v4 is proven to build cleanly in a WebContainer and the embed UX is validated. The two phases share the **same substrate-agnostic harness** (the kit files + the Live Build panel); only the execution adapter changes — exactly the P→Q "swap the execution substrate under the same harness" framing.

**Confirmed mechanism (research):** `sdk.embedProject(elementOrId, { title, template: 'node', files }, embedOptions)` instantiates a full WebContainer from an **in-memory `files` map** (`Record<path, contents>`, no GitHub repo needed), runs `npm install` + the configured start command, and renders the dev server in an iframe. New projects are **ephemeral** ("not persisted on StackBlitz, only live in the browser's memory unless the user forks"), though the file tree **is transmitted to stackblitz.com** to instantiate the VM. The host page needs **no COOP/COEP** changes (the WebContainer runs inside StackBlitz's already-isolated frame). Source: https://developer.stackblitz.com/platform/api/javascript-sdk

---

## Goal

On demand, the inspector embeds the user's generated kit as a running StackBlitz WebContainer and shows the **real build-time render** of their themed components inside an in-app iframe — proving (de-risking) that `@nuxt/ui` v4 builds in a WebContainer and validating the embed UX, without any licence or header work.

**Success criteria:**
- A new **"Live Build"** tab in the Kit view, alongside the existing `Kit | Coverage` (the fast runtime-Tailwind render stays untouched).
- An **on-demand** trigger (a button; never auto-boot, because `npm install` of `@nuxt/ui` is ~30–90 s + hundreds of MB of tab RAM).
- On trigger, the panel embeds the kit (built from the current `graph` via the existing `buildKitFiles`) as a StackBlitz `node` project in **preview-only** mode (no StackBlitz editor/explorer/nav), and the user sees the components rendered by the real build-time Tailwind compiler.
- The embed is **substrate-agnostic** behind a small interface, so Phase 2 (self-hosted WebContainer) is a swap of one adapter, not a UI rewrite.
- The pure adapter (`toLiveBuildFiles`) is unit-tested; the panel's wiring is mount-tested with a mocked SDK; the real render is validated manually (the de-risk proof).
- No change to the existing `buildKitFiles` output or any renderer; the Live Build layer is additive.

---

## Scope

**In scope:**
- A pure **`toLiveBuildFiles(graph)`** adapter: `buildKitFiles(graph)` → StackBlitz's flat `files` map (strip the `kit/` path prefix) + a StackBlitz-specific `package.json` augmentation (run config).
- A thin **`embedLiveBuild`** substrate wrapper around `@stackblitz/sdk` behind a `LiveBuildSubstrate` interface.
- A **`LiveBuildPanel.vue`** with the on-demand button, the embed target, status/latency/privacy messaging, and an "open in StackBlitz" escape hatch.
- Wiring a **"Live Build"** tab into the Kit view.
- Adding `@stackblitz/sdk` as a dependency.

**Out of scope (parked → Phase 2 / later):**
- **Q2b — self-hosted `@webcontainer/api`**: `vercel.json` `COOP/COEP` headers, the OSS licence-key handshake, bundling away any cross-origin asset, the `embedViaWebContainer` substrate implementation. (The interface is designed for this swap now; the implementation is later.)
- **HMR re-mount on token re-upload** (Phase 1 simply re-embeds a fresh project when the user re-triggers).
- Fully removing StackBlitz branding (not possible in the SDK embed).
- The **Nuxt target**, chip/sidebar in the gallery, a one-click "download kit" button (all pre-existing Q-roadmap parks).
- Changing `buildKitFiles` / the kit templates' canonical output.

---

## Current state (key seams, from recon)

- **`buildKitFiles(graph) → ExportFile[]`** (`src/renderers/kit/kit-emitter.ts`, shipped v0.52.0) already produces the 9-file runnable kit (`kit/package.json`, `kit/vite.config.ts`, `kit/index.html`, `kit/tokens.css`, `kit/theme.ts`, `kit/src/main.ts`, `kit/src/main.css`, `kit/src/App.vue`, `kit/README.md`). `ExportFile = { path; content }`. This is the substrate-agnostic input — reused verbatim.
- The Kit view is `LiveKitPanel.vue` with a `paneTab` `ref<"kit"|"coverage">` in `App.vue` (two tabs today). The Live Build tab joins here.
- The kit's `package.json` has scripts `dev: "vite"`, `build`, `preview` (no `start`). The kit's `main.css` uses paths relative to `kit/src/` (`@import "../tokens.css"`) — stripping the uniform `kit/` prefix preserves the relative structure (`src/main.css` → `../tokens.css` = root `tokens.css`).
- The inspector loads **nothing cross-origin** at runtime (`index.html` is bare; `@tailwindcss/browser` is npm-bundled, not CDN) — relevant only to Phase 2, noted here so the Phase-2 header work is known to be low-risk.

---

## Design — units

### 1. `toLiveBuildFiles(graph) → Record<string, string>` (pure)
`src/app/live-build/to-live-build-files.ts`. Calls the existing `buildKitFiles(graph)`, then:
- **Strips the `kit/` prefix** from every path (StackBlitz project root = kit root): `kit/package.json` → `package.json`, `kit/src/App.vue` → `src/App.vue`, etc.
- **Augments `package.json`** so StackBlitz runs install + the vite dev server: parse the emitted `package.json`, add `stackblitz: { installDependencies: true, startCommand: "npm run dev" }`, re-serialise. (The canonical kit `package.json` is NOT mutated — this augmentation is StackBlitz-embed-only.)
- Returns the flat `Record<path, contents>` StackBlitz expects.
Pure, deterministic → unit-tested.

### 2. `LiveBuildSubstrate` interface + `embedViaStackblitz` (the swap seam)
`src/app/live-build/substrate.ts` defines:
```ts
export interface LiveBuildSubstrate {
  embed(el: HTMLElement, files: Record<string, string>, opts: { title: string }): Promise<void>;
  openExternal(files: Record<string, string>, opts: { title: string }): void;
}
```
`src/app/live-build/stackblitz-substrate.ts` implements it via `@stackblitz/sdk`:
- `embed` → `sdk.embedProject(el, { title, description, template: "node", files }, { view: "preview", hideExplorer: true, hideNavigation: true, height: "100%", openFile: "src/App.vue" })`.
- `openExternal` → `sdk.openProject({ title, template: "node", files }, { newWindow: true })` (the escape hatch).
Phase 2 adds `webcontainer-substrate.ts` implementing the same interface; the panel is unchanged.

### 3. `LiveBuildPanel.vue` (the UI)
`src/app/components/LiveBuildPanel.vue`. Props: `graph`. State: `status: "idle" | "embedding" | "ready" | "error"`.
- **Idle:** a "Start live build" button (disabled when no graph) + a short note: "Runs the real `@nuxt/ui` build in a sandbox (~30–90 s first boot). Your generated kit is sent to stackblitz.com to run; it is ephemeral and not saved."
- **On click:** `status = "embedding"`, compute `toLiveBuildFiles(props.graph)`, call `substrate.embed(embedEl, files, { title })`. A spinner + "Booting sandbox & installing dependencies…".
- **Ready:** the embedded iframe fills the panel. A small toolbar: "Rebuild" (re-embed with current tokens) + "Open in StackBlitz ↗" (`substrate.openExternal`).
- **Error/offline:** inline message + the "Open in StackBlitz ↗" link as a manual fallback.
The substrate is injected (constructor/prop/factory) so tests pass a mock.

### 4. Tab wiring
`App.vue` (or `LiveKitPanel.vue`, whichever owns the tab strip): extend `paneTab` to `"kit" | "coverage" | "livebuild"`, add the tab label "Live Build", mount `LiveBuildPanel` when active. The existing Kit (runtime-Tailwind) and Coverage tabs are untouched.

---

## Data flow

`graph → buildKitFiles (existing) → toLiveBuildFiles (strip kit/, augment package.json) → LiveBuildSubstrate.embed → sdk.embedProject (node template) → StackBlitz WebContainer (npm install + vite dev) → preview iframe (real build-time Tailwind render)`.

No change to recipe building or any renderer. The Live Build layer reads `graph` and reuses `buildKitFiles` only.

---

## Error handling / fidelity / privacy

- **No graph:** button disabled; panel shows "Upload a token export first."
- **Embed/network failure or offline:** the SDK embed fails gracefully → inline error + the "Open in StackBlitz ↗" manual fallback (which also needs network, but surfaces the StackBlitz status to the user).
- **Latency honesty:** the idle + embedding states tell the user about the ~30–90 s first boot, so the wait reads as expected, not broken.
- **Privacy transparency:** the idle note states that the generated kit is sent to stackblitz.com (ephemeral, unsaved). This is the explicit trade-off of Phase 1 vs the self-hosted Phase 2; the inspector only ever handles design tokens (no secrets), so this is acceptable for de-risking. Documented in the panel and the spec.
- **Fidelity:** because the WebContainer runs the **real** `vite` + `@tailwindcss/vite` + `@nuxt/ui/vite`, the render is the literal build-time product — the whole point. (Sandpack would have failed this; hence StackBlitz/WebContainer.)

## Testing

- **Unit (pure):** `toLiveBuildFiles` — asserts the `kit/` prefix is stripped (`package.json` at root, `src/App.vue` present), the `package.json` gains `stackblitz.startCommand = "npm run dev"` + `installDependencies: true`, the canonical kit `package.json` content is otherwise preserved, and `theme.ts`/`tokens.css`/`vite.config.ts` survive intact.
- **Component (mocked substrate):** `LiveBuildPanel` mount test — button disabled with no graph; click with a graph calls the injected substrate's `embed` once with the files from `toLiveBuildFiles` and `{ title }`; error state renders the fallback link; the on-demand gate (no auto-embed on mount) is verified.
- **Tab wiring:** a focused mount test that the "Live Build" tab mounts `LiveBuildPanel` and the Kit/Coverage tabs still work.
- **Manual integration (the de-risk proof, like Q1's Task 5):** on the live export, click "Start live build", confirm the StackBlitz embed boots, `@nuxt/ui` installs, vite dev serves, and the gallery renders themed. Documented as a validation step, not a jsdom test (the SDK injects a third-party iframe).
- Pre-commit gate (vue-tsc + full vitest) green throughout. (`*.test.ts` are excluded from `npm run typecheck` — type test helpers explicitly; mind the `new Map(arr.map(f => [..] ))` `as const` footgun.)

## Resolved decisions (review-approved)
1. **Substrate = WebContainers**, consumed via the **StackBlitz SDK** for Phase 1 (de-risk; no licence/headers). Self-hosted `@webcontainer/api` is Phase 2.
2. **Placement = a new "Live Build" tab** alongside Kit + Coverage (the runtime-Tailwind Kit render stays; this augments, not replaces).
3. **Preview-only embed** (`view: "preview"`, hide explorer/nav) + an "Open in StackBlitz ↗" escape hatch.
4. **On-demand button** (never auto-boot), because install is ~30–90 s + heavy RAM.
5. **Substrate-agnostic seam** (`LiveBuildSubstrate` interface) so Phase 2 is an adapter swap.

## Flagged for the plan (implementation details)
- The exact `@stackblitz/sdk` `embedProject` options + the `package.json` `stackblitz` run-config field (confirm `startCommand`/`installDependencies` against the current SDK docs during the first task; the manual validation will surface any mismatch).
- Whether the tab strip lives in `App.vue` or `LiveKitPanel.vue` (follow the existing `paneTab` owner — recon during the plan).
- How the substrate is injected into `LiveBuildPanel` for testability (prop vs factory vs provide/inject — pick the lightest that the repo already uses).
- Embed iframe sizing/height within the existing pane layout.

## Future (parked)
- **Q2b — self-hosted `@webcontainer/api`:** `vercel.json` `COOP: same-origin` + `COEP: require-corp`, the OSS licence-key boot handshake, the `embedViaWebContainer` substrate (mount `FileSystemTree`, `spawn npm install`, `server-ready` → iframe). Same panel, same `toLiveBuildFiles` (minus the StackBlitz `package.json` augmentation), swapped substrate.
- HMR re-mount of `theme.ts`/`tokens.css` into a long-lived container on token change (avoid re-install).
- The Nuxt target; chip/sidebar in the gallery; a one-click "download kit" button; (Y) deviation decision-routing.

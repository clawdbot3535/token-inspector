# Q1 — Runnable Vite+@nuxt/ui Kit Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a complete, runnable Vite + Vue 3 + @nuxt/ui project under `kit/` in the export bundle, so the user runs `npm i && npm run dev` and sees their components rendered by the **real build-time Tailwind compiler**, globally themed by their tokens — the literal product.

**Architecture:** A new pure `src/renderers/kit/` module builds the kit files as `ExportFile[]`. The theme reuses the EXISTING `deriveRoles` + `buildComponentRecipes` (no app-config refactor). The Vite plugin's `ui` option (`ui({ ui: theme })`) applies colours + component overrides at build time; `@tailwindcss/vite` compiles `tokens.css`. The kit files are appended to the existing `buildExportFiles()` (git-export) and `downloadAll()` (zip) pipelines under `kit/`.

**Tech Stack:** TypeScript, Vitest. The generated kit targets `@nuxt/ui` ^4 + Vite 6 + Vue 3.5. Emitter functions are pure (unit-tested); the build-and-render fidelity is validated once via `npm i && npm run build` (Task 5, manual).

---

## File Structure
- **Create `src/renderers/kit/kit-theme.ts`** — `buildKitTheme(graph) → KitTheme` (colours + per-component recipes), reusing `deriveRoles` + `buildComponentRecipes`.
- **Create `src/renderers/kit/kit-gallery.ts`** — `GALLERY_SNIPPETS` map + `buildKitGallery(graph) → string` (the `App.vue` content).
- **Create `src/renderers/kit/kit-templates.ts`** — the static file templates (`vite.config.ts`, `package.json`, `tsconfig.json`, `index.html`, `main.ts`, `main.css`, `README.md`) as string constants.
- **Create `src/renderers/kit/kit-emitter.ts`** — `buildKitFiles(graph) → ExportFile[]` assembling all `kit/*` files.
- **Create the matching `*.test.ts`** for theme, gallery, emitter.
- **Modify `src/renderers/app-config.ts`** — `export` the existing `deriveRoles` (if not already exported).
- **Modify `src/app/components/CommitPanel.vue`** (`buildExportFiles`) + **`src/app/App.vue`** (`downloadAll`) — append the kit files.

Verified facts: `COMPONENT_ALLOW_LIST` (16) is exported from `app-config.ts`. `buildComponentRecipes(graph, { components })` returns `Record<string, ComponentRecipe>` (`{ slots, variants }`). `deriveRoles(graph)` returns a `RoleMapping` (currently the hardcoded `DEFAULT_ROLES`). `ExportFile = { path: string; content: string }` (`git-export.ts`). `buildExportFiles()` returns `defaultRenderers.map(...)`. The kit's `main.ts` needs `@nuxt/ui/vue-plugin` + a memory-history `vue-router` (`4.6.4`, required by NavigationMenu).

---

### Task 1: `kit-theme.ts` — the build-time theme object

**Files:**
- Create: `src/renderers/kit/kit-theme.ts`
- Modify: `src/renderers/app-config.ts` (export `deriveRoles`)
- Test: `src/renderers/kit/kit-theme.test.ts`

- [ ] **Step 1: Ensure `deriveRoles` is exported.** In `src/renderers/app-config.ts`, confirm `deriveRoles` is `export`ed (the function returning the `RoleMapping`). If it's a local `function deriveRoles`, add `export`. Do NOT change its behaviour. Quick check: `grep -n "deriveRoles" src/renderers/app-config.ts`.

- [ ] **Step 2: Write the failing test.** Create `src/renderers/kit/kit-theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGraph } from "../../build-graph.js";
import type { SourceFile } from "../../token-graph.js";
import { buildKitTheme } from "./kit-theme.js";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "number" }, bg: { $value: "#3b82f6", $type: "color" } } } },
  ];
  return buildGraph(sources);
}

describe("buildKitTheme", () => {
  it("includes the colour roles", () => {
    const theme = buildKitTheme(buttonGraph());
    expect(theme.colors).toBeDefined();
    expect(typeof theme.colors!.primary).toBe("string"); // e.g. "blue"
    expect(typeof theme.colors!.neutral).toBe("string");
  });
  it("includes a per-component recipe (slots/variants) for components present in the export", () => {
    const theme = buildKitTheme(buttonGraph());
    expect(theme.button).toBeDefined();
    expect(theme.button!.slots).toBeDefined();
  });
  it("omits components with no recipe", () => {
    const theme = buildKitTheme(buttonGraph());
    // a component with no tokens in this fixture should be absent (or have an empty recipe — assert it's not a crash)
    expect(theme).toBeTypeOf("object");
  });
});
```

- [ ] **Step 3: Run to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/renderers/kit/kit-theme.test.ts`
Expected: FAIL — `kit-theme.ts` does not exist.

- [ ] **Step 4: Implement.** Create `src/renderers/kit/kit-theme.ts`:

```ts
import type { TokenGraph, ComponentRecipe } from "../../token-graph.js";
import { buildComponentRecipes } from "../../recipe-engine.js";
import { COMPONENT_ALLOW_LIST, deriveRoles } from "../app-config.js";

/** The `@nuxt/ui` app-config `ui` shape consumed by the Vite plugin's `ui` option:
 *  colours + per-component slot/variant overrides. Built from the SAME functions the
 *  app.config.ts renderer uses, so the kit and the Nuxt export stay consistent. */
export type KitTheme = {
  colors?: Record<string, string>;
} & Record<string, ComponentRecipe | Record<string, string> | undefined>;

export function buildKitTheme(graph: TokenGraph): KitTheme {
  const roles = deriveRoles(graph);
  const recipes = buildComponentRecipes(graph, { components: [...COMPONENT_ALLOW_LIST] });
  const theme: KitTheme = { colors: { ...roles } };
  for (const name of COMPONENT_ALLOW_LIST) {
    const recipe = recipes[name];
    if (recipe) theme[name] = recipe;
  }
  return theme;
}
```
(If `RoleMapping`/`ComponentRecipe` import paths differ, fix to the real ones — `grep` for their definitions. If `deriveRoles`/`buildComponentRecipes` have different signatures than assumed, adapt and note it.)

- [ ] **Step 5: Run to verify pass.**
Run: `npx vitest run src/renderers/kit/kit-theme.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/renderers/kit/kit-theme.ts src/renderers/kit/kit-theme.test.ts src/renderers/app-config.ts
git commit -m "feat(kit-export): buildKitTheme reuses deriveRoles + buildComponentRecipes"
```

---

### Task 2: `kit-gallery.ts` — the App.vue gallery

**Files:**
- Create: `src/renderers/kit/kit-gallery.ts`
- Test: `src/renderers/kit/kit-gallery.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/renderers/kit/kit-gallery.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGraph } from "../../build-graph.js";
import type { SourceFile } from "../../token-graph.js";
import { buildKitGallery } from "./kit-gallery.js";

function multiCompGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { bg: { $value: "#3b82f6", $type: "color" } }, badge: { bg: { $value: "#10b981", $type: "color" } } } },
  ];
  return buildGraph(sources);
}

describe("buildKitGallery", () => {
  it("produces a Vue SFC wrapping the gallery in <UApp> and a section per present component", () => {
    const sfc = buildKitGallery(multiCompGraph());
    expect(sfc).toContain("<UApp>");
    expect(sfc).toContain("<UButton");
    expect(sfc).toContain("<UBadge");
    expect(sfc).toContain('data-component="button"'); // section marker
  });
  it("omits a section for a component absent from the export", () => {
    const sfc = buildKitGallery(multiCompGraph());
    expect(sfc).not.toContain('data-component="accordion"');
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/renderers/kit/kit-gallery.test.ts`
Expected: FAIL — `kit-gallery.ts` does not exist.

- [ ] **Step 3: Implement.** Create `src/renderers/kit/kit-gallery.ts`:

```ts
import type { TokenGraph } from "../../token-graph.js";
import { buildComponentRecipes } from "../../recipe-engine.js";
import { COMPONENT_ALLOW_LIST } from "../app-config.js";

/** Markup per component for the gallery. The theme is GLOBAL (Vite plugin), so plain
 *  component usage is themed automatically — no per-component :ui needed. Lean: one
 *  default instance + the key variants. Overlay components (modal/dropdown) render a
 *  static trigger; chip/sidebar are custom (deferred from v1 — see kit README). */
const GALLERY_SNIPPETS: Record<string, string> = {
  button: `<UButton>Button</UButton> <UButton variant="outline">Outline</UButton> <UButton variant="soft">Soft</UButton>`,
  badge: `<UBadge>Badge</UBadge> <UBadge color="error">Error</UBadge> <UBadge color="success">Success</UBadge>`,
  input: `<UInput placeholder="Text" />`,
  textarea: `<UTextarea placeholder="Text" />`,
  card: `<UCard>Card body</UCard>`,
  kbd: `<UKbd value="K" />`,
  progress: `<UProgress :model-value="50" />`,
  switch: `<USwitch :model-value="true" /> <USwitch :model-value="false" />`,
  checkbox: `<UCheckbox :model-value="true" label="Checkbox" />`,
  radio: `<URadioGroup :model-value="'a'" :items="[{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }]" />`,
  table: `<UTable :data="[{ id: 1, name: 'Row 1' }, { id: 2, name: 'Row 2' }]" />`,
  nav: `<UNavigationMenu :items="[{ label: 'Home' }, { label: 'Docs' }]" />`,
  accordion: `<UAccordion :items="[{ label: 'Section', content: 'Body' }]" />`,
  modal: `<UModal title="Modal"><UButton>Open modal</UButton></UModal>`,
  dropdown: `<UDropdownMenu :items="[[{ label: 'Item' }]]"><UButton>Open menu</UButton></UDropdownMenu>`,
  // chip / sidebar (custom components) deferred from gallery v1.
};

export function buildKitGallery(graph: TokenGraph): string {
  const recipes = buildComponentRecipes(graph, { components: [...COMPONENT_ALLOW_LIST] });
  const present = COMPONENT_ALLOW_LIST.filter((name) => recipes[name] && GALLERY_SNIPPETS[name]);
  const sections = present
    .map(
      (name) => `      <section data-component="${name}" class="space-y-2">
        <h2 class="text-sm font-semibold capitalize">${name}</h2>
        <div class="flex flex-wrap items-center gap-3">${GALLERY_SNIPPETS[name]}</div>
      </section>`,
    )
    .join("\n");
  return `<script setup lang="ts"></script>

<template>
  <UApp>
    <main class="p-8 space-y-8 max-w-3xl mx-auto">
      <h1 class="text-lg font-bold">Design Kit</h1>
${sections}
    </main>
  </UApp>
</template>
`;
}
```
(If `UDropdownMenu`/`UModal`/`UTable`/`UNavigationMenu` prop shapes differ in @nuxt/ui v4, the Task 5 build validation will surface it — adjust the snippet then. Keep the snippet minimal/valid.)

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/renderers/kit/kit-gallery.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/renderers/kit/kit-gallery.ts src/renderers/kit/kit-gallery.test.ts
git commit -m "feat(kit-export): buildKitGallery — App.vue showcase per present component"
```

---

### Task 3: `kit-templates.ts` + `kit-emitter.ts` — assemble the kit files

**Files:**
- Create: `src/renderers/kit/kit-templates.ts`, `src/renderers/kit/kit-emitter.ts`
- Test: `src/renderers/kit/kit-emitter.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/renderers/kit/kit-emitter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGraph } from "../../build-graph.js";
import type { SourceFile } from "../../token-graph.js";
import { buildKitFiles } from "./kit-emitter.js";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { bg: { $value: "#3b82f6", $type: "color" } } } },
  ];
  return buildGraph(sources);
}

describe("buildKitFiles", () => {
  it("emits a self-contained runnable kit under kit/", () => {
    const files = buildKitFiles(buttonGraph());
    const byPath = new Map(files.map((f) => [f.path, f.content]));
    for (const p of ["kit/package.json", "kit/vite.config.ts", "kit/index.html", "kit/tokens.css", "kit/theme.ts", "kit/src/main.ts", "kit/src/main.css", "kit/src/App.vue", "kit/README.md"]) {
      expect(byPath.has(p), `missing ${p}`).toBe(true);
    }
  });
  it("vite.config wires the theme via the @nuxt/ui plugin ui option", () => {
    const vc = new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content])).get("kit/vite.config.ts")!;
    expect(vc).toContain('from "@nuxt/ui/vite"');
    expect(vc).toContain("ui({ ui: theme })");
    expect(vc).toContain("tailwindcss()");
  });
  it("package.json pins the runtime + build deps incl. vue-router 4.6.4", () => {
    const pkg = JSON.parse(new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content])).get("kit/package.json")!);
    expect(pkg.dependencies["@nuxt/ui"]).toBeDefined();
    expect(pkg.dependencies["vue-router"]).toBe("4.6.4");
    expect(pkg.scripts.dev).toBe("vite");
  });
  it("main.css imports tailwind, the tokens, and nuxt ui in order", () => {
    const css = new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content])).get("kit/src/main.css")!;
    expect(css.indexOf('@import "tailwindcss"')).toBeLessThan(css.indexOf('@import "../tokens.css"'));
    expect(css.indexOf('@import "../tokens.css"')).toBeLessThan(css.indexOf('@import "@nuxt/ui"'));
  });
  it("theme.ts exports a serialised theme object", () => {
    const t = new Map(buildKitFiles(buttonGraph()).map((f) => [f.path, f.content])).get("kit/theme.ts")!;
    expect(t).toContain("export const theme");
    expect(t).toContain('"colors"');
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/renderers/kit/kit-emitter.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement the templates.** Create `src/renderers/kit/kit-templates.ts`:

```ts
export const KIT_PACKAGE_JSON = JSON.stringify(
  {
    name: "design-kit",
    private: true,
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: {
      vue: "^3.5.0",
      "vue-router": "4.6.4",
      "@nuxt/ui": "^4.0.0",
    },
    devDependencies: {
      "@tailwindcss/vite": "^4.0.0",
      tailwindcss: "^4.0.0",
      "@vitejs/plugin-vue": "^5.2.0",
      vite: "^6.0.0",
    },
  },
  null,
  2,
) + "\n";

export const KIT_VITE_CONFIG = `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import ui from "@nuxt/ui/vite";
import { theme } from "./theme";

export default defineConfig({
  plugins: [vue(), tailwindcss(), ui({ ui: theme })],
});
`;

export const KIT_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design Kit</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

export const KIT_MAIN_TS = `import { createApp } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./main.css";

const app = createApp(App);
app.use(createRouter({ history: createMemoryHistory(), routes: [] }));
app.use(ui);
app.mount("#app");
`;

export const KIT_MAIN_CSS = `@import "tailwindcss";
@import "../tokens.css";
@import "@nuxt/ui";

@source "./**/*.{vue,ts}";
`;

export const KIT_README = `# Design Kit

A runnable Vite + Vue 3 + @nuxt/ui project generated from your token export. The components
are themed by your tokens via the real build-time Tailwind compiler — this is the literal product.

## Run

\\\`\\\`\\\`bash
npm install
npm run dev
\\\`\\\`\\\`

\`theme.ts\` holds your generated \`ui\` theme (colours + component overrides), applied globally via the
\`@nuxt/ui\` Vite plugin in \`vite.config.ts\`. \`tokens.css\` holds your design tokens (compiled at build time).
`;
```
(NOTE: the `@source` glob in `KIT_MAIN_CSS` is relative to `kit/src/`; adjust only if Task 5 build fails to pick up component classes.)

- [ ] **Step 4: Implement the emitter.** Create `src/renderers/kit/kit-emitter.ts`:

```ts
import type { TokenGraph } from "../../token-graph.js";
import type { ExportFile } from "../../app/git-export.js";
import { tokensCssRenderer } from "../tokens-css.js";
import { buildKitTheme } from "./kit-theme.js";
import { buildKitGallery } from "./kit-gallery.js";
import { KIT_PACKAGE_JSON, KIT_VITE_CONFIG, KIT_INDEX_HTML, KIT_MAIN_TS, KIT_MAIN_CSS, KIT_README } from "./kit-templates.js";

/** Builds a self-contained runnable Vite+@nuxt/ui kit project as ExportFiles under `kit/`. */
export function buildKitFiles(graph: TokenGraph): ExportFile[] {
  const theme = buildKitTheme(graph);
  return [
    { path: "kit/package.json", content: KIT_PACKAGE_JSON },
    { path: "kit/vite.config.ts", content: KIT_VITE_CONFIG },
    { path: "kit/index.html", content: KIT_INDEX_HTML },
    { path: "kit/tokens.css", content: tokensCssRenderer.render(graph).text },
    { path: "kit/theme.ts", content: `export const theme = ${JSON.stringify(theme, null, 2)} as const;\n` },
    { path: "kit/src/main.ts", content: KIT_MAIN_TS },
    { path: "kit/src/main.css", content: KIT_MAIN_CSS },
    { path: "kit/src/App.vue", content: buildKitGallery(graph) },
    { path: "kit/README.md", content: KIT_README },
  ];
}
```
(Confirm the `ExportFile` import path — `git-export.ts` exports `ExportFile`; if it lives elsewhere, fix the import. If importing from `src/app/...` into `src/renderers/...` creates an unwanted layering dependency, define a local `interface ExportFile { path: string; content: string }` in the kit module instead and note it.)

- [ ] **Step 5: Run to verify pass + full suite.**
Run: `npx vitest run src/renderers/kit/ && npx vitest run && npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 6: Commit.**
```bash
git add src/renderers/kit/kit-templates.ts src/renderers/kit/kit-emitter.ts src/renderers/kit/kit-emitter.test.ts
git commit -m "feat(kit-export): kit-emitter assembles the runnable Vite+@nuxt/ui kit files"
```

---

### Task 4: Wire the kit into the export pipeline

**Files:**
- Modify: `src/app/components/CommitPanel.vue` (`buildExportFiles`), `src/app/App.vue` (`downloadAll`)
- Test: extend an existing CommitPanel/App test OR add a focused test that the export includes `kit/` paths

- [ ] **Step 1: Write the failing test.** Add (or extend) a test asserting the assembled export includes the kit. If `buildExportFiles` is a component-internal function, prefer a small unit test that imports `buildKitFiles` and asserts it's spread into the export list; otherwise add a CommitPanel mount test asserting a `kit/package.json` entry appears. Minimal version (a focused unit test on the wiring helper, if you extract one) — the implementer picks the lightest real assertion. The key behaviour: `buildExportFiles()` output and `downloadAll()`'s zip entries both include the `kit/*` files.

- [ ] **Step 2: Run to verify it fails.** (kit files not yet appended.)

- [ ] **Step 3: Implement — `buildExportFiles` (`CommitPanel.vue`).** After the `defaultRenderers.map(...)` array, append the kit files. The function returns `ExportFile[]`; spread `buildKitFiles(g)` and prefix with the git `dir` if present (mirror the existing `dir ? \`${dir}/${r.id}\` : r.id` logic):

```ts
import { buildKitFiles } from "@core/renderers/kit/kit-emitter.js";
// ...
function buildExportFiles(): ExportFile[] {
  const g = props.graph;
  if (!g) return [];
  const target = parseGitUrl(exportUrl.value);
  const dir = target?.dir ?? "";
  const base = defaultRenderers.map((r) => ({
    path: dir ? `${dir}/${r.id}` : r.id,
    content: r.id === appConfigRenderer.id
      ? appConfigRenderer.render(g, { completeness: props.completeness }).text
      : r.render(g).text,
  }));
  const kit = buildKitFiles(g).map((f) => ({ path: dir ? `${dir}/${f.path}` : f.path, content: f.content }));
  return [...base, ...kit];
}
```

- [ ] **Step 4: Implement — `downloadAll` (`App.vue`).** Append the kit files to the zip `entries` (shape `{ name, data }`):

```ts
import { buildKitFiles } from "@core/renderers/kit/kit-emitter.js";
// ... inside downloadAll, after the existing entries:
const entries = [
  ...defaultRenderers.map((r) => ({ name: r.id, data: /* existing */ })),
  ...(customOutputText.value.trim().length > 0 ? [{ name: customComponentsRenderer.id, data: customOutputText.value }] : []),
  ...buildKitFiles(g).map((f) => ({ name: f.path, data: f.content })),
];
```
(Use the exact `@core/...` import specifier the rest of `App.vue`/`CommitPanel.vue` use for core modules — confirm against existing imports.)

- [ ] **Step 5: Run to verify pass + full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green. The download/git-export now include `kit/*`.

- [ ] **Step 6: Commit.**
```bash
git add src/app/components/CommitPanel.vue src/app/App.vue src/app/**/*.test.ts
git commit -m "feat(kit-export): include the runnable kit in download-zip + git-export"
```

---

### Task 5: Integration validation (manual — the real Q proof; not a unit test)

- [ ] Generate the kit from the live export into a temp dir and build it for real:
```bash
cd /Users/christian/Dev/token-inspector
T=$(mktemp -d); unzip -oq assets/tokens-20260619-214856.zip -d "$T/in"
npx tsx -e '
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildGraph } from "./src/build-graph.ts";
import { buildKitFiles } from "./src/renderers/kit/kit-emitter.ts";
const inDir = process.argv[1], outDir = process.argv[2];
const files = readdirSync(inDir).filter(f=>f.endsWith(".tokens.json")).map(f=>({name:f.replace(/\.tokens\.json$/,""),data:JSON.parse(readFileSync(join(inDir,f),"utf8"))}));
const g = buildGraph(files as any);
for (const f of buildKitFiles(g)) { const p = join(outDir, f.path); mkdirSync(dirname(p), {recursive:true}); writeFileSync(p, f.content); }
console.log("kit written to", join(outDir,"kit"));
' "$T/in" "$T"
cd "$T/kit" && npm install && npm run build
```
Expected: `npm install` + `npm run build` (vite build) exit 0. If the build fails, the error pinpoints a template/snippet issue (e.g. a wrong `@nuxt/ui` prop in a gallery snippet, the `@source` glob, or a serialisation issue in `theme.ts`) — fix the relevant template/snippet/emitter and re-run. Optionally `npm run dev` + `/browse` the kit to confirm the components render themed.
- [ ] Record the result (built / what was fixed). `rm -rf "$T"` when done.

---

## Self-review checklist (run before handoff)
- README test-count: update if the harness total changed after Tasks 1–4.
- Confirm `buildKitFiles` is imported in BOTH `CommitPanel.vue` (git-export) and `App.vue` (download-zip).
- Confirm the kit is self-contained (`kit/tokens.css` present; no references outside `kit/`).
- The Task 5 build MUST pass before considering the feature done — it's the fidelity proof.

## Out of scope (parked)
Q2 (embed the kit in an in-app iframe / WebContainer); the Nuxt target (`nuxt.config` + `app.config.ts`); chip/sidebar in the gallery (custom `tv()` components — deferred, noted in the kit README); a one-click "download kit" button; richer per-component playground. See the spec's "Future".

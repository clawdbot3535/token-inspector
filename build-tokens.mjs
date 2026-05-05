#!/usr/bin/env node
// Transforms Figma W3C design tokens into Nuxt UI compatible artifacts.
// Inputs:  components/{color,dimension,typography,light,dark,global}.tokens.json
// Outputs: output/{tokens.css, tokens.ts, nuxt-ui.app.config.ts}

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const inDir = resolve(here, "components");
const outDir = resolve(here, "output");

const FILES = {
  color: "color.tokens.json",
  dimension: "dimension.tokens.json",
  typography: "typography.tokens.json",
  light: "light.tokens.json",
  dark: "dark.tokens.json",
  global: "global.tokens.json",
};

// Slug uses '-' as separator, so all matchers operate on dash-form
const NUMBER_UNIT_MAP = [
  { match: /^(spacing|rounded|border|shadow)-/, unit: "px" },
  { match: /^font-size-/, unit: "px" },
  { match: /^line-height-/, unit: "px" },
  { match: /^letter-spacing-/, unit: "px" },
  { match: /-(padding|gap|radius|height|width|size|offset|spacing|border)(-|$)/, unit: "px" },
];

const NO_UNIT = [/^font-weight-/, /-font-weight$/, /-opacity$/, /^opacity-/, /-line-height$/];

const NAME_FIXES = [
  [/^font-weigth/, "font-weight"],
  [/^line-heigth/, "line-height"],
  [/font-weigth\//g, "font-weight/"],
  [/line-heigth\//g, "line-height/"],
];

const load = (name) => JSON.parse(readFileSync(resolve(inDir, FILES[name]), "utf8"));

function* walk(node, path = []) {
  for (const [k, v] of Object.entries(node)) {
    if (k === "$extensions") continue;
    if (v && typeof v === "object") {
      if ("$value" in v) yield { path: [...path, k], token: v };
      else yield* walk(v, [...path, k]);
    }
  }
}

const slug = (parts) => {
  let raw = parts.join("/").toLowerCase();
  for (const [from, to] of NAME_FIXES) raw = raw.replace(from, to);
  return raw
    .replace(/[^a-z0-9/_-]+/gi, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const cssVar = (parts) => `--${slug(parts)}`;

const inferUnit = (slugged) => {
  for (const re of NO_UNIT) if (re.test(slugged)) return "";
  for (const { match, unit } of NUMBER_UNIT_MAP) if (match.test(slugged)) return unit;
  return "";
};

const round = (n, p = 3) => Math.round(n * 10 ** p) / 10 ** p;

const colorToCss = (val) => {
  if (val.alpha !== undefined && val.alpha < 1) {
    const [r, g, b] = val.components.map((c) => Math.round(c * 255));
    return `rgba(${r}, ${g}, ${b}, ${round(val.alpha, 4)})`;
  }
  return val.hex;
};

const balanceParens = (s) => {
  const open = (s.match(/\(/g) || []).length;
  const close = (s.match(/\)/g) || []).length;
  return open > close ? s + ")".repeat(open - close) : s;
};

const isCssValueString = (slugged) =>
  /^shadow-|-shadow$|-shadow-/.test(slugged); // shadows are CSS values, not literals

const formatValue = (token, slugged) => {
  const t = token.$type;
  const v = token.$value;
  if (t === "color") return colorToCss(v);
  if (t === "number") {
    const unit = inferUnit(slugged);
    return unit ? `${v}${unit}` : String(v);
  }
  if (t === "string") {
    if (isCssValueString(slugged)) return balanceParens(v);
    return /\s/.test(v) ? `"${v}"` : v;
  }
  return String(v);
};

// Build alias index: targetVariableName -> css var name
function buildAliasIndex(...sources) {
  const idx = new Map();
  for (const src of sources) {
    for (const { path, token } of walk(src.data)) {
      const targets = [path.join("/")];
      const ext = token.$extensions?.["com.figma.aliasData"];
      if (ext?.targetVariableName) targets.push(ext.targetVariableName);
      for (const t of targets) {
        let key = t.toLowerCase();
        for (const [from, to] of NAME_FIXES) key = key.replace(from, to);
        if (!idx.has(key)) idx.set(key, cssVar(path));
      }
    }
  }
  return idx;
}

const resolveAlias = (token, aliasIndex) => {
  const ext = token.$extensions?.["com.figma.aliasData"];
  if (!ext?.targetVariableName) return null;
  let key = ext.targetVariableName.toLowerCase();
  for (const [from, to] of NAME_FIXES) key = key.replace(from, to);
  return aliasIndex.get(key) || null;
};

const emitDecl = (varName, token, aliasIndex, useAlias = true) => {
  const slugged = varName.replace(/^--/, "");
  if (useAlias) {
    const aliasVar = resolveAlias(token, aliasIndex);
    if (aliasVar) return `  ${varName}: var(${aliasVar});`;
  }
  return `  ${varName}: ${formatValue(token, slugged)};`;
};

function buildCss() {
  const color = { name: "color", data: load("color") };
  const dimension = { name: "dimension", data: load("dimension") };
  const typography = { name: "typography", data: load("typography") };
  const light = { name: "light", data: load("light") };
  const dark = { name: "dark", data: load("dark") };
  const global = { name: "global", data: load("global") };

  const aliasIndex = buildAliasIndex(color, dimension, typography, light, dark);

  const sections = [];
  sections.push("/* Generated by build-tokens.mjs — do not edit by hand */");
  sections.push("/* Source: components/*.tokens.json (Figma W3C export) */\n");

  // Layer 1: primitives — :root, no alias resolution
  const primitiveLines = [];
  for (const src of [color, dimension, typography]) {
    primitiveLines.push(`  /* ${src.name} */`);
    for (const { path, token } of walk(src.data)) {
      primitiveLines.push(emitDecl(cssVar(path), token, aliasIndex, false));
    }
  }
  sections.push(`:root {\n${primitiveLines.join("\n")}\n}\n`);

  // Layer 2: semantic light — :root, alias resolved to primitives
  const lightLines = [];
  for (const { path, token } of walk(light.data)) {
    lightLines.push(emitDecl(cssVar(path), token, aliasIndex, true));
  }
  sections.push(`/* Semantic — light theme (default) */\n:root, html.light, [data-theme="light"] {\n${lightLines.join("\n")}\n}\n`);

  // Layer 2b: semantic dark — overrides under .dark / [data-theme=dark]
  const darkLines = [];
  for (const { path, token } of walk(dark.data)) {
    darkLines.push(emitDecl(cssVar(path), token, aliasIndex, true));
  }
  sections.push(`/* Semantic — dark theme (Nuxt UI sets html.dark by default) */\nhtml.dark, [data-theme="dark"] {\n${darkLines.join("\n")}\n}\n`);

  // Layer 3: component tokens — :root, alias to semantic/primitives where possible
  const componentLines = [];
  for (const { path, token } of walk(global.data)) {
    componentLines.push(emitDecl(cssVar(path), token, aliasIndex, true));
  }
  sections.push(`/* Component tokens (overrides resolve to semantic/primitive aliases) */\n:root {\n${componentLines.join("\n")}\n}\n`);

  return sections.join("\n");
}

function buildTs() {
  const all = {};
  for (const key of ["color", "dimension", "typography", "light", "dark", "global"]) {
    const data = load(key);
    for (const { path, token } of walk(data)) {
      const slugged = slug(path);
      all[slugged] = formatValue(token, slugged);
    }
  }
  const entries = Object.entries(all)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
  return `// Generated by build-tokens.mjs — do not edit by hand
export const tokens = {
${entries}
} as const;

export type TokenName = keyof typeof tokens;

export const cssVar = (name: TokenName): string => \`var(--\${name})\`;
`;
}

function buildAppConfig() {
  // Map our component slot tokens to Nuxt UI v3 ui.* keys where the names align.
  // Most of our component values are CSS-variable bound, so the Nuxt UI app.config
  // primarily aliases color roles. Other component overrides should be applied via
  // the tokens.css custom properties.
  return `// Generated by build-tokens.mjs
// Drop into your Nuxt project as app.config.ts (or merge with existing).
// Nuxt UI v3 reads colors from this config; component sizing/spacing is driven
// by the CSS variables in tokens.css.

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
    // Example: bind Nuxt UI button slot to our CSS variables.
    // Uncomment / extend as needed.
    // button: {
    //   slots: {
    //     base: 'rounded-[var(--button-radius)] gap-[var(--button-gap)] font-[var(--button-font-weight)]',
    //   },
    // },
  },
});
`;
}

const css = buildCss();
const ts = buildTs();
const appCfg = buildAppConfig();

writeFileSync(resolve(outDir, "tokens.css"), css);
writeFileSync(resolve(outDir, "tokens.ts"), ts);
writeFileSync(resolve(outDir, "nuxt-ui.app.config.ts"), appCfg);

console.log("✓ output/tokens.css           ", css.length, "bytes");
console.log("✓ output/tokens.ts            ", ts.length, "bytes");
console.log("✓ output/nuxt-ui.app.config.ts", appCfg.length, "bytes");

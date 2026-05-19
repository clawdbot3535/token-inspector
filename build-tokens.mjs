#!/usr/bin/env node
// Transforms Figma W3C design tokens into a Tailwind-compatible tokens.css.
// Inputs:  components/{color,dimension,typography,light,dark,global}.tokens.json
// Output:  output/tokens.css

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

const ensurePrefix = (id, prefix) => (id.startsWith(`${prefix}-`) ? id : `${prefix}-${id}`);

function themeVarName(slugged, type) {
  if (type === "color") return ensurePrefix(slugged, "color");
  if (type === "shadow") return ensurePrefix(slugged, "shadow");
  if (type === "fontFamily") return ensurePrefix(slugged, "font");
  if (type === "fontWeight") return ensurePrefix(slugged, "font-weight");

  if (slugged.startsWith("font-family-")) return ensurePrefix(slugged.slice("font-family-".length), "font");
  if (/-font-family(-|$)/.test(slugged)) return ensurePrefix(slugged, "font");

  if (slugged.startsWith("font-size-")) return ensurePrefix(slugged.slice("font-size-".length), "text");
  if (/-font-size(-|$)/.test(slugged)) return ensurePrefix(slugged, "text");

  if (slugged.startsWith("line-height-")) return ensurePrefix(slugged.slice("line-height-".length), "leading");
  if (/-line-height(-|$)/.test(slugged)) return ensurePrefix(slugged, "leading");

  if (slugged.startsWith("letter-spacing-")) return ensurePrefix(slugged.slice("letter-spacing-".length), "tracking");
  if (/-letter-spacing(-|$)/.test(slugged)) return ensurePrefix(slugged, "tracking");

  if (slugged.startsWith("rounded-")) return ensurePrefix(slugged.slice("rounded-".length), "radius");
  if (/^(radius|rounded)-/.test(slugged) || /-(radius|rounded)(-|$)/.test(slugged)) {
    return ensurePrefix(slugged, "radius");
  }

  if (slugged.startsWith("border-width-")) {
    return ensurePrefix(slugged.slice("border-width-".length), "border-width");
  }
  if (slugged.startsWith("border-")) {
    return ensurePrefix(slugged.slice("border-".length), "border-width");
  }

  if (slugged.startsWith("spacing-") || /-(spacing|padding|gap|size|width|height|offset)(-|$)/.test(slugged)) {
    return ensurePrefix(slugged, "spacing");
  }

  return slugged;
}

const cssVar = (parts, token) => `--${themeVarName(slug(parts), token?.$type)}`;

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
  if (t === "number" || t === "dimension") {
    const unit = inferUnit(slugged);
    return unit ? `${v}${unit}` : String(v);
  }
  if (t === "string" || t === "fontFamily" || t === "fontWeight" || t === "duration") {
    if (isCssValueString(slugged)) return balanceParens(v);
    return /\s/.test(v) ? `"${v}"` : v;
  }
  if (t === "shadow") return balanceParens(String(v));
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
        if (!idx.has(key)) idx.set(key, cssVar(path, token));
      }
    }
  }
  return idx;
}

const parseCurlyAlias = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m = trimmed.match(/^\{([^{}]+)\}$/);
  if (!m || !m[1]) return null;
  const rawTarget = m[1];
  let key = rawTarget.toLowerCase().replace(/\./g, "/");
  for (const [from, to] of NAME_FIXES) key = key.replace(from, to);
  return { rawTarget, key };
};

const resolveAlias = (token, aliasIndex) => {
  const ext = token.$extensions?.["com.figma.aliasData"];
  if (ext?.targetVariableName) {
    let key = ext.targetVariableName.toLowerCase();
    for (const [from, to] of NAME_FIXES) key = key.replace(from, to);
    return aliasIndex.get(key) || null;
  }
  const curly = parseCurlyAlias(token.$value);
  if (curly) return aliasIndex.get(curly.key) || null;
  return null;
};

const emitDecl = (varName, token, sourceSlugged, aliasIndex, useAlias = true) => {
  if (useAlias) {
    const aliasVar = resolveAlias(token, aliasIndex);
    if (aliasVar) return `  ${varName}: var(${aliasVar});`;
    if (parseCurlyAlias(token.$value)) return null;
  }
  const value = formatValue(token, sourceSlugged);
  if (/^\{[^{}]+\}$/.test(value) || value === "undefined") return null;
  return `  ${varName}: ${value};`;
};

function buildCss() {
  const color = { name: "color", data: load("color") };
  const dimension = { name: "dimension", data: load("dimension") };
  const typography = { name: "typography", data: load("typography") };
  const light = { name: "light", data: load("light") };
  const dark = { name: "dark", data: load("dark") };
  const global = { name: "global", data: load("global") };

  const aliasIndex = buildAliasIndex(color, dimension, typography, light, dark, global);

  const sections = [];
  sections.push("/* Generated by build-tokens.mjs — do not edit by hand */");
  sections.push("/* Source: components/*.tokens.json (Figma W3C export) */\n");

  // Layer 1: primitives — @theme, no alias resolution
  const primitiveLines = [];
  for (const src of [color, dimension, typography]) {
    primitiveLines.push(`  /* ${src.name} */`);
    for (const { path, token } of walk(src.data)) {
      const decl = emitDecl(cssVar(path, token), token, slug(path), aliasIndex, false);
      if (decl) primitiveLines.push(decl);
    }
  }
  sections.push(`@theme {\n${primitiveLines.join("\n")}\n}\n`);

  // Layer 2: semantic light — @theme, alias resolved to primitives
  const lightLines = [];
  for (const { path, token } of walk(light.data)) {
    const decl = emitDecl(cssVar(path, token), token, slug(path), aliasIndex, true);
    if (decl) lightLines.push(decl);
  }
  sections.push(`/* Semantic — light theme (default) */\n@theme {\n${lightLines.join("\n")}\n}\n`);

  // Layer 2b: semantic dark — overrides under .dark / [data-theme=dark]
  const darkLines = [];
  for (const { path, token } of walk(dark.data)) {
    const decl = emitDecl(cssVar(path, token), token, slug(path), aliasIndex, true);
    if (decl) darkLines.push(decl);
  }
  sections.push(`/* Semantic — dark theme (Nuxt UI sets html.dark by default) */\nhtml.dark, [data-theme="dark"] {\n${darkLines.join("\n")}\n}\n`);

  // Layer 3: component tokens — @theme, alias to semantic/primitives where possible
  const componentLines = [];
  for (const { path, token } of walk(global.data)) {
    const decl = emitDecl(cssVar(path, token), token, slug(path), aliasIndex, true);
    if (decl) componentLines.push(decl);
  }
  sections.push(`/* Component tokens (overrides resolve to semantic/primitive aliases) */\n@theme {\n${componentLines.join("\n")}\n}\n`);

  return sections.join("\n");
}

const css = buildCss();

writeFileSync(resolve(outDir, "tokens.css"), css);

console.log("✓ output/tokens.css           ", css.length, "bytes");

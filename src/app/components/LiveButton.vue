<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";

interface Props {
  graph: TokenGraph | null;
}

const props = defineProps<Props>();

const buttonRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, { components: ["button"] });
  return recipes["button"] ?? null;
});

const SIZES = ["sm", "md", "lg"] as const;
const STATES = ["default", "hover", "active", "disabled", "focus"] as const;
type State = (typeof STATES)[number];
// Fallback rendered as a single row when no variant tokens are present.
const FALLBACK_VARIANT = "default";

interface PreviewCell {
  /** Label shown under the button (size key or state key). */
  label: string;
  /** Class string with arbitrary classes removed (for the live button). */
  buttonClasses: string;
  /** Inline style hosting arbitrary values that Tailwind JIT can't see. */
  style: CSSProperties;
}

interface VariantRow {
  variant: string;
  sizeCells: PreviewCell[];
  stateCells: PreviewCell[];
  /** Full merged class string for `md` — shown in the code preview row. */
  inspectClasses: string;
}

// Tailwind utility prefix → CSS property mapping. Used by the preview
// to translate arbitrary-value classes like `px-[10px]` into inline
// styles, because Tailwind v4 JIT only sees classes that appear as
// static strings in the source — the recipe-engine emits these classes
// dynamically at runtime so they're never generated.
const ARBITRARY_TO_CSS: Readonly<Record<string, ReadonlyArray<keyof CSSProperties>>> = {
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  pl: ["paddingLeft"],
  pr: ["paddingRight"],
  pt: ["paddingTop"],
  pb: ["paddingBottom"],
  gap: ["gap"],
  size: ["width", "height"],
  rounded: ["borderRadius"],
  font: ["fontWeight"],
  leading: ["lineHeight"],
  tracking: ["letterSpacing"],
  bg: ["backgroundColor"],
  border: ["borderColor"],
  underline: ["textDecorationColor"],
  ring: ["boxShadow"],
};

// `text-[…]` is ambiguous: text-[#fff] is color, text-[14px] is font-size.
function textProperty(value: string): keyof CSSProperties {
  return /^(#|rgb|hsl|var\()/i.test(value) ? "color" : "fontSize";
}

interface Extracted {
  classes: string;
  style: CSSProperties;
}

function extractArbitrary(classString: string): Extracted {
  const style: Record<string, string> = {};
  const classes: string[] = [];
  for (const cls of classString.split(/\s+/).filter(Boolean)) {
    if (cls.includes(":")) {
      classes.push(cls);
      continue;
    }
    const m = cls.match(/^([a-z-]+)-\[(.+)\]$/);
    if (m === null) {
      classes.push(cls);
      continue;
    }
    const prefix = m[1]!;
    const rawValue = m[2]!;
    // Tailwind v4 reads `_` inside [...] as a literal space.
    const value = rawValue.replace(/_/g, " ");

    let properties: ReadonlyArray<keyof CSSProperties> | undefined;
    if (prefix === "text") {
      properties = [textProperty(value)];
    } else if (prefix === "ring") {
      style.boxShadow = `0 0 0 2px ${value}`;
      continue;
    } else {
      properties = ARBITRARY_TO_CSS[prefix];
    }
    if (properties === undefined) {
      classes.push(cls);
      continue;
    }
    for (const prop of properties) {
      style[prop as string] = value;
    }
  }

  // Tailwind preflight zeroes border-width on every element, so a bare
  // `border-color` is invisible. Compensate when the recipe set a border
  // color but did not specify a width / style.
  if (style.borderColor !== undefined) {
    if (style.borderWidth === undefined) style.borderWidth = "1px";
    if (style.borderStyle === undefined) style.borderStyle = "solid";
  }
  // A `<button>` has no default text-decoration, so `text-decoration-color`
  // on its own paints nothing. Surface the underline when the recipe sets
  // an underline color.
  if (style.textDecorationColor !== undefined) {
    if (style.textDecorationLine === undefined) {
      style.textDecorationLine = "underline";
    }
  }

  return { classes: classes.join(" "), style: style as CSSProperties };
}

/**
 * Project a class string to a single state's static view by promoting
 * the chosen state's pseudo-class-prefixed classes to base classes and
 * dropping every other state. `default` keeps the unprefixed base and
 * drops all state-prefixed entries.
 *
 * Example for state="hover":
 *   "bg-[#A] hover:bg-[#B] active:bg-[#C]"
 *   → "bg-[#B]"  (hover wins; active dropped)
 */
function projectToState(classString: string, state: State): string {
  const STATE_PREFIXES: ReadonlySet<string> = new Set([
    "hover",
    "active",
    "disabled",
    "focus",
  ]);
  const baseClasses: string[] = [];
  const stateClasses: string[] = [];

  for (const cls of classString.split(/\s+/).filter(Boolean)) {
    const m = cls.match(/^([a-z-]+):(.+)$/);
    if (m === null) {
      // No state prefix — part of the base look, always included.
      baseClasses.push(cls);
      continue;
    }
    const prefix = m[1]!;
    const rest = m[2]!;
    if (!STATE_PREFIXES.has(prefix)) {
      // Some other prefix (responsive, dark, …) — leave untouched.
      baseClasses.push(cls);
      continue;
    }
    if (prefix === state) {
      stateClasses.push(rest);
    }
    // Other state prefix → dropped for this projection.
  }

  // Promoted state classes come last so they override base ones via
  // both Tailwind's last-wins rule AND extractArbitrary's later
  // inline-style override.
  return [...baseClasses, ...stateClasses].join(" ");
}

const variantRows = computed<VariantRow[]>(() => {
  const recipe = buttonRecipe.value;
  if (!recipe) return [];
  const baseClasses = recipe.slots["base"] ?? "";
  const variantMap = recipe.variants.variant ?? {};
  const variantKeys = Object.keys(variantMap).sort();
  const keys = variantKeys.length > 0 ? variantKeys : [FALLBACK_VARIANT];

  return keys.map((variant) => {
    const variantClasses =
      variant === FALLBACK_VARIANT ? "" : (variantMap[variant]?.["base"] ?? "");

    // ── Sizes row: vary size for the default (no-state) projection. ──
    const sizeCells: PreviewCell[] = SIZES.map((size) => {
      const sizeClasses = recipe.variants.size?.[size]?.["base"] ?? "";
      const merged = [baseClasses, variantClasses, sizeClasses]
        .filter((s) => s.length > 0)
        .join(" ")
        .trim();
      const projected = projectToState(merged, "default");
      const { classes: buttonClasses, style } = extractArbitrary(projected);
      return { label: size, buttonClasses, style };
    });

    // ── States row: hold size at md, vary the state projection. ──
    const mdSizeClasses = recipe.variants.size?.["md"]?.["base"] ?? "";
    const mdMerged = [baseClasses, variantClasses, mdSizeClasses]
      .filter((s) => s.length > 0)
      .join(" ")
      .trim();
    const stateCells: PreviewCell[] = STATES.map((state) => {
      const projected = projectToState(mdMerged, state);
      const { classes: buttonClasses, style } = extractArbitrary(projected);
      // Disabled state also gets the standard opacity/cursor cue so the
      // preview matches what users perceive in real apps.
      if (state === "disabled") {
        (style as Record<string, string>).opacity = "0.6";
        (style as Record<string, string>).cursor = "not-allowed";
      }
      return { label: state, buttonClasses, style };
    });

    return {
      variant,
      sizeCells,
      stateCells,
      inspectClasses: mdMerged,
    };
  });
});

const hasVariantTokens = computed(() =>
  Object.keys(buttonRecipe.value?.variants.variant ?? {}).length > 0,
);

function copy(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="!buttonRecipe" class="text-xs text-zinc-500 italic">
      No button tokens detected in the loaded graph.
    </p>

    <div
      v-for="row in variantRows"
      :key="row.variant"
      class="space-y-2 border-t border-zinc-200 dark:border-zinc-700 pt-3"
    >
      <div class="flex items-center justify-between">
        <span
          class="text-xs font-mono uppercase tracking-wide text-zinc-500"
        >
          {{ row.variant }}
        </span>
        <button
          type="button"
          class="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          @click="copy(row.inspectClasses)"
          :title="`Copy md classes for ${row.variant}`"
        >
          Copy
        </button>
      </div>

      <!-- Size axis: vary sm/md/lg at the default state. -->
      <div class="flex items-end gap-3">
        <div class="text-[10px] uppercase tracking-wider text-zinc-400 min-w-[36px]">
          size
        </div>
        <div
          v-for="cell in row.sizeCells"
          :key="`size-${cell.label}`"
          class="flex flex-col items-center gap-1"
        >
          <button
            type="button"
            :class="
              cell.buttonClasses +
              (hasVariantTokens
                ? ' transition-colors'
                : ' bg-blue-500 text-white hover:bg-blue-600 transition-colors')
            "
            :style="cell.style"
          >
            {{ cell.label }}
          </button>
          <span class="text-[10px] text-zinc-500">{{ cell.label }}</span>
        </div>
      </div>

      <!-- State axis: hold size at md, vary default/hover/active/disabled/focus. -->
      <div class="flex items-end gap-3 flex-wrap">
        <div class="text-[10px] uppercase tracking-wider text-zinc-400 min-w-[36px]">
          state
        </div>
        <div
          v-for="cell in row.stateCells"
          :key="`state-${cell.label}`"
          class="flex flex-col items-center gap-1"
        >
          <button
            type="button"
            :class="
              cell.buttonClasses +
              (hasVariantTokens
                ? ' transition-colors'
                : ' bg-blue-500 text-white hover:bg-blue-600 transition-colors')
            "
            :style="cell.style"
          >
            md
          </button>
          <span class="text-[10px] text-zinc-500">{{ cell.label }}</span>
        </div>
      </div>

      <code
        class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
        {{ row.inspectClasses }}
      </code>
    </div>
  </div>
</template>

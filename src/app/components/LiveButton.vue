<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCopyToClipboard } from "../composables/use-copy-to-clipboard.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { PREVIEW_STATES, projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  /** Component name to preview (matches a key in the token graph). */
  componentName?: string;
  /** Lucide icon name rendered in the leading slot when the recipe declares one. */
  iconName?: string;
  /**
   * Tailwind utility class to highlight inside the per-variant code blocks.
   * App.vue passes the resolved utility for the currently selected
   * component-layer (skip-kind) token so the designer can see where
   * the value lands inside each variant's class string.
   */
  highlightUtility?: string;
  /**
   * Completeness scores from the scan report. When present, each size cell
   * gets a small n/m badge so designers can see how many slots are mapped.
   */
  completeness?: ReadonlyArray<CompletenessScore>;
}

const props = withDefaults(defineProps<Props>(), {
  componentName: "button",
  iconName: "i-lucide-rocket",
  highlightUtility: undefined,
  completeness: undefined,
});

/** Look up the completeness score for the given size key on this component. */
function cellCompleteness(sizeKey: string): CompletenessScore | undefined {
  return props.completeness?.find(
    (c) => c.component === props.componentName && c.variantKey === sizeKey,
  );
}

/**
 * Tokenise a class string on whitespace and flag tokens that equal the
 * highlight target. Used by the template to wrap matching tokens in a
 * primary-coloured chip so a clicked Figma token visually maps to its
 * landing place in every variant's recipe.
 */
function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => ({ token, highlight: target !== undefined && token === target }));
}

const buttonRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, {
    components: [props.componentName],
  });
  return recipes[props.componentName] ?? null;
});

// Fallback rendered as a single row when no variant tokens are present.
const FALLBACK_VARIANT = "default";

// Sizes derived from the recipe (ordered xs→xl), the switcher's selected size,
// and a guarded active size — mirrors LiveBadge so the switch shows the real
// sizes (button has xs/sm/md/lg) and never points at a missing one.
const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];
const sizes = computed<string[]>(() => {
  const keys = Object.keys(buttonRecipe.value?.variants.size ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
});
const selectedSize = ref<string>("md");
const activeSize = computed<string>(() =>
  sizes.value.includes(selectedSize.value) ? selectedSize.value : (sizes.value[0] ?? "default"),
);

interface PreviewCell {
  /** Label shown under the button (size key or state key). */
  label: string;
  /** Class string with arbitrary classes removed (for the live button). */
  buttonClasses: string;
  /** Inline style hosting arbitrary values that Tailwind JIT can't see. */
  style: CSSProperties;
}

interface HighlightSegment {
  token: string;
  highlight: boolean;
}

interface VariantRow {
  variant: string;
  stateCells: PreviewCell[];
  /** Full merged class string for `md` — shown in the code preview row. */
  inspectClasses: string;
  /** Pre-tokenised inspect classes with highlight flags for the code block. */
  segments: HighlightSegment[];
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

    // ── States row: hold size at the active value, vary state projection. ──
    const sizeClasses =
      recipe.variants.size?.[activeSize.value]?.["base"] ?? "";
    const merged = [baseClasses, variantClasses, sizeClasses]
      .filter((s) => s.length > 0)
      .join(" ")
      .trim();
    const stateCells: PreviewCell[] = PREVIEW_STATES.map((state) => {
      const projected = projectToState(merged, state);
      const { classes: buttonClasses, style } = extractArbitrary(projected);
      // Disabled state also gets the standard opacity/cursor cue so the
      // preview matches what users perceive in real apps. Spread into a new
      // object rather than mutating the style returned by extractArbitrary.
      const cellStyle: CSSProperties =
        state === "disabled"
          ? { ...style, opacity: "0.6", cursor: "not-allowed" }
          : style;
      return { label: state, buttonClasses, style: cellStyle };
    });

    return {
      variant,
      stateCells,
      inspectClasses: merged,
      segments: highlightSegments(merged),
    };
  });
});

// Completeness for the active size — shown once in each variant row header
// (replaces the per-size-cell badges of the removed size axis).
const activeCompleteness = computed<CompletenessScore | undefined>(() =>
  cellCompleteness(activeSize.value),
);

// Human-readable label rendered inside each preview button. Capitalises
// the component name so "button" → "Button", "badge" → "Badge". The cell
// label below each button still carries the size/state identifier.
const buttonLabel = computed<string>(() => {
  const name = props.componentName;
  return name.charAt(0).toUpperCase() + name.slice(1);
});

// Detect whether the recipe declares a leadingIcon slot for any variant.
// When present, every preview cell gets a Lucide icon so the user can see
// how icon sizing varies across the size axis. Trailing-icon support is
// intentionally out of scope here: in the current Figma setup the
// trailing-icon configuration lives on component variants (iconOnly /
// noIcon / both) rather than on tokens, so a complete treatment is
// deferred to v0.5.0+ component previews.
const hasLeadingIcon = computed<boolean>(() => {
  const r = buttonRecipe.value;
  if (!r) return false;
  if (r.slots.leadingIcon) return true;
  for (const axis of [r.variants.size, r.variants.variant] as const) {
    if (!axis) continue;
    for (const slots of Object.values(axis)) {
      if (slots.leadingIcon) return true;
    }
  }
  return false;
});

const hasVariantTokens = computed(() =>
  Object.keys(buttonRecipe.value?.variants.variant ?? {}).length > 0,
);

const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-6">
    <p v-if="!buttonRecipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <div
      v-for="row in variantRows"
      :key="row.variant"
      class="space-y-2 border-t border-zinc-200 dark:border-zinc-700 pt-3"
    >
      <div class="flex items-center gap-3">
        <span class="text-xs font-mono uppercase tracking-wide text-zinc-500">
          {{ row.variant }}
        </span>

        <!-- Size switcher — drives the state row's size. Shown when >1 size. -->
        <div
          v-if="sizes.length > 1"
          class="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-[10px] overflow-hidden"
          :title="`Preview size — currently ${activeSize}`"
        >
          <button
            v-for="s in sizes"
            :key="s"
            type="button"
            data-testid="button-size-switch"
            class="px-1.5 py-0.5 transition-colors"
            :class="
              activeSize === s
                ? 'bg-primary text-inverted'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            "
            @click="selectedSize = s"
          >
            {{ s }}
          </button>
        </div>

        <span
          v-if="activeCompleteness"
          class="text-[9px] font-mono"
          :class="
            activeCompleteness.defined === activeCompleteness.total
              ? 'text-emerald-500'
              : 'text-amber-500'
          "
        >
          {{ activeCompleteness.defined }}/{{ activeCompleteness.total }}
        </span>

        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{
            'text-success border-success/60': wasJustCopied(`livebtn-${row.variant}`),
          }"
          @click="copy(row.inspectClasses, `livebtn-${row.variant}`)"
          :title="`Copy ${activeSize} classes for ${row.variant}`"
        >
          {{ wasJustCopied(`livebtn-${row.variant}`) ? "Copied!" : "Copy" }}
        </button>
      </div>

      <!-- State row at the active size (the only row; badge-style). -->
      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div
          v-for="cell in row.stateCells"
          :key="`state-${cell.label}`"
          class="flex flex-col justify-end items-center gap-1 min-w-[88px]"
        >
          <button
            type="button"
            :class="
              cell.buttonClasses +
              (hasVariantTokens
                ? ' inline-flex items-center transition-colors'
                : ' inline-flex items-center bg-blue-500 text-white hover:bg-blue-600 transition-colors')
            "
            :style="cell.style"
          >
            <UIcon v-if="hasLeadingIcon" :name="iconName" class="shrink-0" />
            {{ buttonLabel }}
          </button>
          <span class="text-[10px] text-zinc-500 font-mono">{{ cell.label }}</span>
        </div>
      </div>

      <code
        class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
        <template
          v-for="(seg, segIdx) in row.segments"
          :key="segIdx"
        ><span
            v-if="seg.highlight"
            class="bg-primary/20 ring-1 ring-primary/40 rounded px-0.5"
          >{{ seg.token }}</span><span v-else>{{ seg.token }}</span><span
            v-if="segIdx < row.segments.length - 1"
          >&nbsp;</span></template>
      </code>
    </div>
  </div>
</template>

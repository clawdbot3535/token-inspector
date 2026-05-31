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

const SIZES = ["sm", "md", "lg"] as const;
type Size = (typeof SIZES)[number];
// Fallback rendered as a single row when no variant tokens are present.
const FALLBACK_VARIANT = "default";

// User-selectable size used for the state-axis row. The size-axis row
// always shows all sizes so this only affects the state preview cells.
const stateAxisSize = ref<Size>("md");

interface PreviewCell {
  /** Label shown under the button (size key or state key). */
  label: string;
  /** Class string with arbitrary classes removed (for the live button). */
  buttonClasses: string;
  /** Inline style hosting arbitrary values that Tailwind JIT can't see. */
  style: CSSProperties;
  /** Completeness score for this cell's size key, when a scan report is present. */
  completeness?: CompletenessScore;
}

interface HighlightSegment {
  token: string;
  highlight: boolean;
}

interface VariantRow {
  variant: string;
  sizeCells: PreviewCell[];
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

    // ── Sizes row: vary size for the default (no-state) projection. ──
    const sizeCells: PreviewCell[] = SIZES.map((size) => {
      const sizeClasses = recipe.variants.size?.[size]?.["base"] ?? "";
      const merged = [baseClasses, variantClasses, sizeClasses]
        .filter((s) => s.length > 0)
        .join(" ")
        .trim();
      const projected = projectToState(merged, "default");
      const { classes: buttonClasses, style } = extractArbitrary(projected);
      return { label: size, buttonClasses, style, completeness: cellCompleteness(size) };
    });

    // ── States row: hold size at user-chosen value, vary state projection. ──
    const sizeClasses =
      recipe.variants.size?.[stateAxisSize.value]?.["base"] ?? "";
    const merged = [baseClasses, variantClasses, sizeClasses]
      .filter((s) => s.length > 0)
      .join(" ")
      .trim();
    const stateCells: PreviewCell[] = PREVIEW_STATES.map((state) => {
      const projected = projectToState(merged, state);
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
      inspectClasses: merged,
      segments: highlightSegments(merged),
    };
  });
});

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
        <span
          class="text-xs font-mono uppercase tracking-wide text-zinc-500"
        >
          {{ row.variant }}
        </span>
        <!-- Size switcher for the state-axis row. Hoisted here so the
             selected size sits next to the variant label and the rest
             of the grid stays flat. -->
        <div
          class="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-[10px] overflow-hidden"
          :title="`State preview size — currently ${stateAxisSize}`"
        >
          <button
            v-for="s in SIZES"
            :key="s"
            type="button"
            class="px-1.5 py-0.5 transition-colors"
            :class="
              stateAxisSize === s
                ? 'bg-primary text-inverted'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            "
            @click="stateAxisSize = s"
          >
            {{ s }}
          </button>
        </div>
        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{
            'text-success border-success/60': wasJustCopied(`livebtn-${row.variant}`),
          }"
          @click="copy(row.inspectClasses, `livebtn-${row.variant}`)"
          :title="`Copy ${stateAxisSize} classes for ${row.variant}`"
        >
          {{ wasJustCopied(`livebtn-${row.variant}`) ? "Copied!" : "Copy" }}
        </button>
      </div>

      <!-- Axis grid: left column = axis label / controls, right column = cells. -->
      <div class="grid grid-cols-[72px_1fr] gap-y-4 gap-x-4 items-start">
        <!-- Size axis: vary sm/md/lg at the default state. -->
        <div
          class="text-[10px] uppercase tracking-wider text-zinc-400 pt-2"
        >
          size
        </div>
        <div class="flex flex-wrap gap-x-6 gap-y-3">
          <div
            v-for="cell in row.sizeCells"
            :key="`size-${cell.label}`"
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
            <span
              v-if="cell.completeness"
              class="text-[9px] font-mono"
              :class="
                cell.completeness.defined === cell.completeness.total
                  ? 'text-emerald-500'
                  : 'text-amber-500'
              "
            >
              {{ cell.completeness.defined }}/{{ cell.completeness.total }}
            </span>
          </div>
        </div>

        <!-- State axis: hold size at the chosen value, vary state projection.
             The size selector lives in the row header so this column is
             just the axis label, matching the size axis above. -->
        <div
          class="text-[10px] uppercase tracking-wider text-zinc-400 pt-2"
        >
          state
        </div>
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

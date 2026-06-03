<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCopyToClipboard } from "../composables/use-copy-to-clipboard.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState, type PreviewState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  /** Component name to preview (matches a key in the token graph). */
  componentName?: string;
  /**
   * Lucide icon shown in the leading slot (left), analogous to LiveButton's
   * single icon. Defaults to a search glyph for inputs.
   */
  leadingIconName?: string;
  /**
   * Lucide icon shown in the trailing slot (right). Inputs commonly pair a
   * leading affordance with a trailing one (e.g. a chevron); defaults to that.
   * Both icons render only when the recipe declares an icon-size token.
   */
  trailingIconName?: string;
  /** Tailwind utility to highlight inside the code block (selected token's class). */
  highlightUtility?: string;
  /** Completeness scores from the scan report; renders an n/m badge when present. */
  completeness?: ReadonlyArray<CompletenessScore>;
}

const props = withDefaults(defineProps<Props>(), {
  componentName: "input",
  leadingIconName: "i-lucide-search",
  trailingIconName: "i-lucide-chevron-down",
  highlightUtility: undefined,
  completeness: undefined,
});

// Inputs render the states the recipe actually encodes. `active` (in
// PREVIEW_STATES) is omitted because inputs have no active token family;
// `error`/`success` validation colors are dropped by the engine today and
// surfaced as a Scan-View deviation in cycle B, not rendered here.
const INPUT_STATES: ReadonlyArray<PreviewState> = ["default", "hover", "focus", "disabled"];

const inputRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, {
    components: [props.componentName],
  });
  return recipes[props.componentName] ?? null;
});

const baseClasses = computed<string>(() => inputRecipe.value?.slots["base"] ?? "");

// Icons render only when the recipe declares an icon-size token (which the
// slot grammar maps to the leadingIcon slot). That single signal gates BOTH
// the leading (search) and trailing (chevron) preview icons.
const hasIcons = computed<boolean>(() => {
  const r = inputRecipe.value;
  if (!r) return false;
  if (r.slots.leadingIcon) return true;
  for (const slots of Object.values(r.variants.size ?? {})) {
    if (slots.leadingIcon) return true;
  }
  return false;
});

// The icon size comes from the recipe's icon-size token (e.g. size-4 → 16px),
// resolved to an inline style so it never depends on the Tailwind JIT.
const iconStyle = computed<CSSProperties>(() => {
  const r = inputRecipe.value;
  let cls = r?.slots.leadingIcon ?? "";
  if (cls === "") {
    for (const slots of Object.values(r?.variants.size ?? {})) {
      if (slots.leadingIcon) {
        cls = slots.leadingIcon;
        break;
      }
    }
  }
  return extractArbitrary(cls).style;
});

interface PreviewCell {
  /** State key shown under the input. */
  label: string;
  /** Class string with arbitrary/scale classes removed (for the live input). */
  inputClasses: string;
  /** Inline style hosting values Tailwind JIT can't see. */
  style: CSSProperties;
}

interface HighlightSegment {
  token: string;
  highlight: boolean;
}

/** Tokenise a class string and flag tokens equal to the highlight target. */
function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => ({ token, highlight: target !== undefined && token === target }));
}

const stateCells = computed<PreviewCell[]>(() => {
  const base = baseClasses.value;
  if (base.length === 0) return [];
  return INPUT_STATES.map((state) => {
    const projected = projectToState(base, state);
    const { classes: inputClasses, style } = extractArbitrary(projected);
    // Reserve room for the absolutely-positioned icons via INLINE padding.
    // The recipe's `px-*` resolves to an inline paddingLeft/Right, and inline
    // styles beat classes — so a `pl-*` class can't push the text clear. We
    // override the inline padding directly: 0.5rem icon offset + 1rem icon +
    // 0.5rem gap = 2rem on each side that carries an icon. Spread into a new
    // object rather than mutating extractArbitrary's result.
    const withIconPadding: CSSProperties = hasIcons.value
      ? { ...style, paddingLeft: "2rem", paddingRight: "2rem" }
      : style;
    const cellStyle: CSSProperties =
      state === "disabled"
        ? { ...withIconPadding, opacity: "0.6", cursor: "not-allowed" }
        : withIconPadding;
    return { label: state, inputClasses, style: cellStyle };
  });
});

const segments = computed<HighlightSegment[]>(() => highlightSegments(baseClasses.value));

/** Completeness score for this component's base slot, when a scan report is present. */
const baseCompleteness = computed<CompletenessScore | undefined>(() =>
  props.completeness?.find((c) => c.component === props.componentName),
);

const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-4">
    <p v-if="!inputRecipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">state</span>
        <span
          v-if="baseCompleteness"
          class="text-[9px] font-mono"
          :class="
            baseCompleteness.defined === baseCompleteness.total
              ? 'text-emerald-500'
              : 'text-amber-500'
          "
        >
          {{ baseCompleteness.defined }}/{{ baseCompleteness.total }}
        </span>
        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied('liveinput-base') }"
          @click="copy(baseClasses, 'liveinput-base')"
          title="Copy base classes"
        >
          {{ wasJustCopied("liveinput-base") ? "Copied!" : "Copy" }}
        </button>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div
          v-for="cell in stateCells"
          :key="`state-${cell.label}`"
          class="flex flex-col items-start gap-1 min-w-[160px]"
        >
          <div class="relative inline-flex items-center w-full">
            <UIcon
              v-if="hasIcons"
              :name="leadingIconName"
              class="absolute left-2 shrink-0 text-zinc-400 pointer-events-none"
              :style="iconStyle"
            />
            <input
              type="text"
              placeholder="Placeholder"
              :aria-label="`Input preview — ${cell.label} state`"
              :class="[cell.inputClasses, 'w-full']"
              :style="cell.style"
              :disabled="cell.label === 'disabled'"
            />
            <UIcon
              v-if="hasIcons"
              :name="trailingIconName"
              class="absolute right-2 shrink-0 text-zinc-400 pointer-events-none"
              :style="iconStyle"
            />
          </div>
          <span class="text-[10px] text-zinc-500 font-mono">{{ cell.label }}</span>
        </div>
      </div>

      <code
        class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
        <template
          v-for="(seg, segIdx) in segments"
          :key="segIdx"
        ><span
            v-if="seg.highlight"
            class="bg-primary/20 ring-1 ring-primary/40 rounded px-0.5"
          >{{ seg.token }}</span><span v-else>{{ seg.token }}</span><span
            v-if="segIdx < segments.length - 1"
          >&nbsp;</span></template>
      </code>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { resolveComponentTokens, tokensForGroup } from "../component-preview.js";
import type { Variant } from "../resolve.js";

const props = defineProps<{
  graph: TokenGraph;
  variant: Variant;
  defaultIcon?: string;
}>();

const emit = defineEmits<{
  highlight: [ids: ReadonlySet<string>];
}>();

const tokenStyle = computed(() => resolveComponentTokens(props.graph, "button", props.variant));
const available = computed(() => new Set(Object.keys(tokenStyle.value).map((k) => k.slice(2))));

const SHARED: readonly string[] = [
  "button-padding-x",
  "button-padding-y",
  "button-radius",
  "button-radius-focus",
  "button-font-size",
  "button-font-weight",
  "button-line-height",
  "button-letter-spacing",
  "button-gap",
  "button-ring-offset",
];

const SIZE_TOKENS: readonly string[] = [
  "button-height-sm",
  "button-height-md",
  "button-height-lg",
  "button-padding-x-sm",
  "button-padding-x-md",
  "button-padding-x-lg",
  "button-icon-size-md",
  "button-gap",
];

const VARIANT_TOKENS: Record<"solid" | "outline" | "ghost" | "link", readonly string[]> = {
  solid: [
    "button-solid-bg",
    "button-solid-bg-hover",
    "button-solid-bg-active",
    "button-solid-bg-disabled",
    "button-solid-text",
    "button-solid-text-disabled",
    "button-solid-border",
    "button-solid-ring-focus",
  ],
  outline: [
    "button-outline-bg",
    "button-outline-bg-hover",
    "button-outline-bg-active",
    "button-outline-bg-disabled",
    "button-outline-text",
    "button-outline-text-disabled",
    "button-outline-border",
    "button-outline-border-hover",
    "button-outline-border-disabled",
    "button-outline-ring-focus",
  ],
  ghost: [
    "button-ghost-bg",
    "button-ghost-bg-hover",
    "button-ghost-bg-active",
    "button-ghost-bg-disabled",
    "button-ghost-text",
    "button-ghost-text-hover",
    "button-ghost-text-active",
    "button-ghost-text-disabled",
    "button-ghost-border",
    "button-ghost-ring-focus",
  ],
  link: [
    "button-link-bg",
    "button-link-bg-hover",
    "button-link-text",
    "button-link-text-hover",
    "button-link-text-disabled",
    "button-link-border",
  ],
};

type VariantKey = keyof typeof VARIANT_TOKENS;
const VARIANTS: readonly VariantKey[] = ["solid", "outline", "ghost", "link"];
type HoverKey = VariantKey | "sizes";

const hovered = ref<HoverKey | null>(null);

function enterVariant(v: VariantKey) {
  hovered.value = v;
  emit("highlight", tokensForGroup(available.value, [...SHARED, ...VARIANT_TOKENS[v]]));
}

function enterSizes() {
  hovered.value = "sizes";
  emit("highlight", tokensForGroup(available.value, SIZE_TOKENS));
}

function leave() {
  hovered.value = null;
  emit("highlight", new Set());
}

const empty = computed(() => Object.keys(tokenStyle.value).length === 0);
</script>

<template>
  <div v-if="!empty" class="space-y-2">
    <div class="flex items-center justify-between text-xs">
      <span class="text-muted">Live preview · button</span>
      <span class="text-[10px] text-muted">hover any row to highlight its tokens</span>
    </div>

    <div
      class="border border-default rounded p-4 bg-elevated space-y-4"
      :style="tokenStyle"
      data-token-scope="button"
    >
      <!-- Sizes row (all solid) -->
      <div
        class="lb-col"
        :class="{ 'lb-col-active': hovered === 'sizes' }"
        @mouseenter="enterSizes"
        @mouseleave="leave"
      >
        <div class="lb-caption">sizes (solid)</div>
        <div class="lb-row">
          <button class="lb lb-solid lb-size-sm" type="button">SM</button>
          <button class="lb lb-solid lb-size-md" type="button">MD</button>
          <button class="lb lb-solid lb-size-md lb-with-icon" type="button">
            <UIcon v-if="props.defaultIcon" :name="props.defaultIcon" class="lb-icon" />
            <svg
              v-else
              class="lb-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            MD + icon
          </button>
          <button class="lb lb-solid lb-size-lg" type="button">LG</button>
        </div>
      </div>

      <!-- Variant grid (states per variant) -->
      <div class="lb-grid">
        <div
          v-for="v in VARIANTS"
          :key="v"
          class="lb-col"
          :class="{ 'lb-col-active': hovered === v }"
          @mouseenter="enterVariant(v)"
          @mouseleave="leave"
        >
          <div class="lb-caption">{{ v }}</div>
          <div class="lb-row">
            <button :class="['lb', `lb-${v}`]" type="button">Button</button>
            <button :class="['lb', `lb-${v}`, 'lb-hover-sim']" type="button">Hover</button>
            <button :class="['lb', `lb-${v}`, 'lb-focus-sim']" type="button">Focus</button>
            <button :class="['lb', `lb-${v}`]" type="button" disabled>Disabled</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lb-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}
@media (min-width: 640px) {
  .lb-grid { grid-template-columns: 1fr 1fr; }
}
.lb-col {
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 120ms;
}
.lb-col-active {
  background: rgb(0 0 0 / 0.04);
}
.lb-caption {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(0 0 0 / 0.55);
  margin-bottom: 0.4rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lb-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

/* Shared button shape — driven by token CSS vars on the scope wrapper.
   For the default md case height is content+padding driven; the .lb-size-*
   modifiers below switch to explicit height + zero padding-block so the
   button-height-* tokens drive the sizing literally. */
.lb {
  padding-inline: var(--button-padding-x, 12px);
  padding-block: var(--button-padding-y, 8px);
  border-radius: var(--button-radius, 6px);
  font-size: var(--button-font-size, 14px);
  font-weight: var(--button-font-weight, 500);
  line-height: var(--button-line-height, 1.25);
  letter-spacing: var(--button-letter-spacing, normal);
  gap: var(--button-gap, 6px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 120ms, color 120ms, border-color 120ms, outline-color 120ms;
}
.lb:disabled { cursor: not-allowed; }

/* Size modifiers — explicit height so button-height-* visibly differ. */
.lb-size-sm {
  height: var(--button-height-sm);
  padding-block: 0;
  padding-inline: var(--button-padding-x-sm);
}
.lb-size-md {
  height: var(--button-height-md);
  padding-block: 0;
  padding-inline: var(--button-padding-x-md);
}
.lb-size-lg {
  height: var(--button-height-lg);
  padding-block: 0;
  padding-inline: var(--button-padding-x-lg);
}

/* Icon slot — driven by button-icon-size-md; gap from shared button-gap. */
.lb-icon {
  width: var(--button-icon-size-md, 16px);
  height: var(--button-icon-size-md, 16px);
  flex-shrink: 0;
}

/* Focus ring — simulated via outline using per-variant ring-focus token. */
.lb-focus-sim {
  outline-style: solid;
  outline-width: 2px;
  outline-offset: var(--button-ring-offset, 2px);
}

/* Solid */
.lb-solid {
  background: var(--button-solid-bg);
  color: var(--button-solid-text);
  border-color: var(--button-solid-border, transparent);
}
.lb-solid:hover:not(:disabled),
.lb-solid.lb-hover-sim:not(:disabled) {
  background: var(--button-solid-bg-hover);
}
.lb-solid:active:not(:disabled) { background: var(--button-solid-bg-active); }
.lb-solid.lb-focus-sim:not(:disabled) {
  outline-color: var(--button-solid-ring-focus);
}
.lb-solid:disabled {
  background: var(--button-solid-bg-disabled);
  color: var(--button-solid-text-disabled);
}

/* Outline */
.lb-outline {
  background: var(--button-outline-bg);
  color: var(--button-outline-text);
  border-color: var(--button-outline-border);
}
.lb-outline:hover:not(:disabled),
.lb-outline.lb-hover-sim:not(:disabled) {
  background: var(--button-outline-bg-hover);
  border-color: var(--button-outline-border-hover, var(--button-outline-border));
}
.lb-outline:active:not(:disabled) { background: var(--button-outline-bg-active); }
.lb-outline.lb-focus-sim:not(:disabled) {
  outline-color: var(--button-outline-ring-focus);
}
.lb-outline:disabled {
  background: var(--button-outline-bg-disabled);
  color: var(--button-outline-text-disabled);
  border-color: var(--button-outline-border-disabled, var(--button-outline-border));
}

/* Ghost */
.lb-ghost {
  background: var(--button-ghost-bg);
  color: var(--button-ghost-text);
  border-color: var(--button-ghost-border, transparent);
}
.lb-ghost:hover:not(:disabled),
.lb-ghost.lb-hover-sim:not(:disabled) {
  background: var(--button-ghost-bg-hover);
  color: var(--button-ghost-text-hover, var(--button-ghost-text));
}
.lb-ghost:active:not(:disabled) {
  background: var(--button-ghost-bg-active);
  color: var(--button-ghost-text-active, var(--button-ghost-text));
}
.lb-ghost.lb-focus-sim:not(:disabled) {
  outline-color: var(--button-ghost-ring-focus);
}
.lb-ghost:disabled {
  background: var(--button-ghost-bg-disabled);
  color: var(--button-ghost-text-disabled);
}

/* Link */
.lb-link {
  background: var(--button-link-bg, transparent);
  color: var(--button-link-text);
  border-color: var(--button-link-border, transparent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lb-link:hover:not(:disabled),
.lb-link.lb-hover-sim:not(:disabled) {
  background: var(--button-link-bg-hover, transparent);
  color: var(--button-link-text-hover, var(--button-link-text));
}
.lb-link.lb-focus-sim:not(:disabled) {
  /* Link variant has no dedicated ring-focus token — fall back to solid. */
  outline-color: var(--button-solid-ring-focus);
}
.lb-link:disabled {
  color: var(--button-link-text-disabled);
  text-decoration: none;
}
</style>

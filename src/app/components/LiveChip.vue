<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "chip",
  customParts: () => new Map(),
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = useCustomPreviewRecipe(() => props.graph, () => props.componentName, () => props.customParts);

interface Render { classes: string; style: CSSProperties; }
interface Pill { label: string; base: Render; lbl: Render; close: Render; }
const pills = computed<Pill[]>(() => {
  const r = recipe.value;
  if (!r) return [];
  const baseSlot = r.slots["base"] ?? "";
  const labelSlot = r.slots["label"] ?? "";
  const close = extractArbitrary(projectToState(r.slots["close"] ?? "", "default"));
  const colorVariants = (r.variants?.color ?? {}) as Record<string, { base?: string; label?: string }>;
  const rows = [
    { key: "default", baseExtra: "", lblExtra: "" },
    ...Object.keys(colorVariants).map((k) => ({
      key: k,
      baseExtra: colorVariants[k]?.base ?? "",
      lblExtra: colorVariants[k]?.label ?? "",
    })),
  ];
  return rows.map((row) => ({
    label: row.key === "default" ? "Chip" : row.key,
    base: extractArbitrary(projectToState([baseSlot, row.baseExtra].filter((s) => s.length > 0).join(" "), "default")),
    lbl: extractArbitrary(projectToState([labelSlot, row.lblExtra].filter((s) => s.length > 0).join(" "), "default")),
    close,
  }));
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <span
          v-for="pill in pills"
          :key="pill.label"
          data-testid="chip"
          class="inline-flex items-center gap-1"
          :class="pill.base.classes"
          :style="pill.base.style"
        >
          <span :class="pill.lbl.classes" :style="pill.lbl.style">{{ pill.label }}</span>
          <button
            type="button"
            class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none opacity-60"
          >
            <span :class="pill.close.classes" :style="pill.close.style">×</span>
          </button>
        </span>
      </div>
    </template>
  </div>
</template>

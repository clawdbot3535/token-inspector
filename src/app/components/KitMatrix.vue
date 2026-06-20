<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import type { VariantCell, StateCell } from "../composables/use-render-diff.js";
import { behaviorsFor, scannerNotesFor, type KitNote } from "../kit-behaviors.js";
import RealVariantCell from "./RealVariantCell.vue";

const props = withDefaults(
  defineProps<{
    componentName: string;
    variantCells: VariantCell[];
    stateCells: StateCell[];
    graph: TokenGraph | null;
    showDiagnostics?: boolean;
  }>(),
  { showDiagnostics: false },
);

const scannerNotes = computed(() => scannerNotesFor(props.componentName, props.graph));
const variantAxisCells = computed(() => props.variantCells.filter((c) => c.axis === "variant"));
const colorAxisCells = computed(() => props.variantCells.filter((c) => c.axis === "color"));

// Shared by both the variant- AND color-axis sections: Nuxt UI colors are
// implemented as variants, so color keys deliberately route through the same
// `variants` bucket of KIT_BEHAVIORS. There is no separate `colors` bucket — do
// not add one without also adding a dedicated lookup here.
function variantNotes(key: string): readonly KitNote[] {
  return behaviorsFor(props.componentName, { variant: key });
}
function stateNotes(state: string): readonly KitNote[] {
  return [...behaviorsFor(props.componentName, { state }), ...(scannerNotes.value.byState[state] ?? [])];
}
</script>

<template>
  <div data-testid="kit-matrix">
    <section v-if="variantAxisCells.length" data-testid="kit-row-variants">
      <h3 class="mt-4 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">Variants</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <RealVariantCell
          v-for="cell in variantAxisCells"
          :key="cell.key"
          :label="cell.key"
          :specs="cell.specs"
          :show-diagnostics="showDiagnostics"
          :notes="variantNotes(cell.key)"
        >
          <slot name="cell" :cell="cell" />
        </RealVariantCell>
      </div>
    </section>

    <section v-if="colorAxisCells.length" data-testid="kit-row-colors">
      <h3 class="mt-4 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">Colors</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <RealVariantCell
          v-for="cell in colorAxisCells"
          :key="cell.key"
          :label="cell.key"
          :specs="cell.specs"
          :show-diagnostics="showDiagnostics"
          :notes="variantNotes(cell.key)"
        >
          <slot name="cell" :cell="cell" />
        </RealVariantCell>
      </div>
    </section>

    <section v-if="stateCells.length" data-testid="kit-row-states">
      <h3 class="mt-4 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">States</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <RealVariantCell
          v-for="cell in stateCells"
          :key="cell.state"
          :label="cell.state"
          :specs="cell.specs"
          :show-diagnostics="showDiagnostics"
          :notes="stateNotes(cell.state)"
        >
          <slot name="cell" :cell="cell" />
        </RealVariantCell>
      </div>
    </section>
  </div>
</template>

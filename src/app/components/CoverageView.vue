<script setup lang="ts">
import { computed } from "vue";
import type { ComponentCoverage } from "@core/coverage.js";

const props = defineProps<{ coverage: ComponentCoverage }>();

const structural = computed(() => props.coverage.slots.filter((s) => s.classification === "structural"));
const optional = computed(() => props.coverage.slots.filter((s) => s.classification === "optional"));
</script>

<template>
  <div data-testid="coverage-view" class="space-y-4">
    <div class="flex items-baseline justify-between">
      <div class="font-mono text-base">{{ coverage.component }} — coverage</div>
      <div
        class="text-xs font-mono"
        :class="coverage.structuralTouched < coverage.structuralTotal ? 'text-warning' : 'text-success'"
      >
        {{ coverage.structuralTouched }}/{{ coverage.structuralTotal }} structural
      </div>
    </div>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Structural · must design
      </h3>
      <ul class="space-y-0.5">
        <li
          v-for="s in structural"
          :key="s.slot"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-error'">
            {{ s.touched ? "✓" : "✗" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
          <span
            v-if="!s.touched"
            class="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
          >to design</span>
        </li>
      </ul>
    </section>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Optional · designed or Nuxt default
      </h3>
      <ul class="space-y-0.5">
        <li
          v-for="s in optional"
          :key="s.slot"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-zinc-400'">
            {{ s.touched ? "✓" : "○" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ComponentCoverage } from "@core/coverage.js";

const props = defineProps<{ coverage: ComponentCoverage }>();
const emit = defineEmits<{ "select-tokens": [ids: readonly string[]] }>();

const structural = computed(() => props.coverage.slots.filter((s) => s.classification === "structural"));
const optional = computed(() => props.coverage.slots.filter((s) => s.classification === "optional"));
const inherited = computed(() => props.coverage.slots.filter((s) => s.classification === "inherited"));
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
      <div role="list" class="space-y-0.5">
        <component
          :is="s.tokenIds.length ? 'button' : 'div'"
          v-for="s in structural"
          :key="s.slot"
          :type="s.tokenIds.length ? 'button' : undefined"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5 w-full text-left rounded"
          :class="s.tokenIds.length ? 'cursor-pointer hover:bg-elevated' : ''"
          @click="s.tokenIds.length && emit('select-tokens', s.tokenIds)"
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
        </component>
      </div>
    </section>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Optional · designed or Nuxt default
      </h3>
      <div role="list" class="space-y-0.5">
        <component
          :is="s.tokenIds.length ? 'button' : 'div'"
          v-for="s in optional"
          :key="s.slot"
          :type="s.tokenIds.length ? 'button' : undefined"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5 w-full text-left rounded"
          :class="s.tokenIds.length ? 'cursor-pointer hover:bg-elevated' : ''"
          @click="s.tokenIds.length && emit('select-tokens', s.tokenIds)"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-zinc-400'">
            {{ s.touched ? "✓" : "○" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
        </component>
      </div>
    </section>

    <section v-if="inherited.length">
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Inherited · follows another slot
      </h3>
      <div role="list" class="space-y-0.5">
        <div
          v-for="s in inherited"
          :key="s.slot"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-zinc-400'">
            {{ s.touched ? "✓" : "↳" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
          <span class="ml-auto shrink-0 text-[10px] text-zinc-400">inherits {{ s.inheritsFrom }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

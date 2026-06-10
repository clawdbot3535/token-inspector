<script setup lang="ts">
interface Props {
  parts: string[];
  states: string[];
  sizes: string[];
  selectedParts: string[];
  selectedStates: string[];
  selectedSizes: string[];
}
const props = defineProps<Props>();
const emit = defineEmits<{
  "update:selectedParts": [value: string[]];
  "update:selectedStates": [value: string[]];
  "update:selectedSizes": [value: string[]];
}>();

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
</script>

<template>
  <div class="space-y-3 text-xs">
    <!-- Parts / Slots -->
    <div v-if="props.parts.length > 0">
      <p class="text-[10px] uppercase tracking-wider text-muted mb-1.5">Parts</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="part in props.parts"
          :key="part"
          type="button"
          class="px-2 py-0.5 rounded border font-mono transition-colors"
          :class="
            props.selectedParts.includes(part)
              ? 'bg-primary text-inverted border-primary'
              : 'border-default text-muted hover:border-primary/50'
          "
          @click="emit('update:selectedParts', toggle(props.selectedParts, part))"
        >
          {{ part }}
        </button>
      </div>
    </div>

    <!-- States -->
    <div v-if="props.states.length > 0">
      <p class="text-[10px] uppercase tracking-wider text-muted mb-1.5">States</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="state in props.states"
          :key="state"
          type="button"
          class="px-2 py-0.5 rounded border font-mono transition-colors"
          :class="
            props.selectedStates.includes(state)
              ? 'bg-primary text-inverted border-primary'
              : 'border-default text-muted hover:border-primary/50'
          "
          @click="emit('update:selectedStates', toggle(props.selectedStates, state))"
        >
          {{ state }}
        </button>
      </div>
    </div>

    <!-- Sizes -->
    <div v-if="props.sizes.length > 0">
      <p class="text-[10px] uppercase tracking-wider text-muted mb-1.5">Sizes</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="size in props.sizes"
          :key="size"
          type="button"
          class="px-2 py-0.5 rounded border font-mono transition-colors"
          :class="
            props.selectedSizes.includes(size)
              ? 'bg-primary text-inverted border-primary'
              : 'border-default text-muted hover:border-primary/50'
          "
          @click="emit('update:selectedSizes', toggle(props.selectedSizes, size))"
        >
          {{ size }}
        </button>
      </div>
    </div>
  </div>
</template>

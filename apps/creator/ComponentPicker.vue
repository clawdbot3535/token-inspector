<script setup lang="ts">
interface Props {
  components: string[];
  modelValue: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <nav class="flex flex-col gap-0.5 overflow-y-auto">
    <button
      v-for="name in props.components"
      :key="name"
      type="button"
      :data-testid="`component-picker-${name}`"
      class="w-full text-left px-3 py-1.5 text-xs rounded transition-colors font-mono"
      :class="
        name === props.modelValue
          ? 'bg-primary text-inverted font-semibold'
          : 'text-default hover:bg-elevated'
      "
      @click="emit('update:modelValue', name)"
    >
      {{ name }}
    </button>
  </nav>
</template>

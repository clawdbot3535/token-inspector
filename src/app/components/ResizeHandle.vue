<script setup lang="ts">
interface Props {
  /** Position relative to the pane that owns this handle. */
  side: "left" | "right";
}

interface Emits {
  (event: "pointerdown", e: PointerEvent): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    :class="[
      'absolute top-0 bottom-0 w-1 cursor-col-resize select-none group',
      side === 'right' ? 'right-0' : 'left-0',
    ]"
    role="separator"
    aria-orientation="vertical"
    @pointerdown="(e) => emit('pointerdown', e)"
  >
    <div
      class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-transparent group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors"
    />
  </div>
</template>

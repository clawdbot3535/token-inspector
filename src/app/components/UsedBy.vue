<script setup lang="ts">
import type { TokenNode } from "@core/token-graph.js";

defineProps<{ nodes: readonly TokenNode[] }>();
defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div v-if="nodes.length > 0" class="space-y-1">
    <div class="text-xs text-muted">Used by ({{ nodes.length }})</div>
    <div class="flex flex-wrap gap-1 text-xs">
      <button
        v-for="node in nodes"
        :key="node.id"
        class="font-mono px-1.5 py-0.5 rounded bg-elevated hover:bg-accented"
        @click="$emit('select', node.id)"
      >
        {{ node.id }}
      </button>
    </div>
  </div>
</template>

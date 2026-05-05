<script setup lang="ts">
import type { TokenNode } from "@core/token-graph.js";

defineProps<{ chain: readonly TokenNode[]; terminal: string | undefined }>();
defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div v-if="chain.length > 1" class="space-y-1">
    <div class="text-xs text-muted">Alias chain</div>
    <div class="flex items-center gap-1 flex-wrap text-xs">
      <template v-for="(node, i) in chain" :key="node.id">
        <button
          class="font-mono px-1.5 py-0.5 rounded hover:bg-elevated"
          :class="{
            'text-primary': i === 0,
            'bg-elevated': i === chain.length - 1,
          }"
          @click="$emit('select', node.id)"
        >
          {{ node.id }}
        </button>
        <span v-if="i < chain.length - 1" class="text-muted">→</span>
      </template>
      <span v-if="terminal" class="text-muted">→ {{ terminal }}</span>
    </div>
  </div>
</template>

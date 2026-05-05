<script setup lang="ts">
import { computed } from "vue";
import type { TokenType } from "@core/token-graph.js";

const props = defineProps<{
  value: string;
  type: TokenType;
  label?: string;
}>();

const SAMPLE = "The quick brown fox jumps over the lazy dog";

const styleObj = computed<Record<string, string>>(() => {
  const v = props.value.replace(/^["']|["']$/g, ""); // strip surrounding quotes
  switch (props.type) {
    case "fontFamily":
      return { fontFamily: v };
    case "fontWeight":
      return { fontWeight: v };
    default:
      return {};
  }
});
</script>

<template>
  <div class="space-y-2">
    <div v-if="label" class="text-xs text-muted">{{ label }}</div>
    <div class="text-xl leading-tight" :style="styleObj">{{ SAMPLE }}</div>
    <div class="font-mono text-[11px] text-muted">{{ value }}</div>
  </div>
</template>

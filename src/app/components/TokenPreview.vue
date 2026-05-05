<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, TokenNode } from "@core/token-graph.js";
import { resolveCss, type Variant } from "../resolve.js";
import ColorSwatch from "./ColorSwatch.vue";
import DimensionRuler from "./DimensionRuler.vue";
import ShadowDemo from "./ShadowDemo.vue";
import TypographySample from "./TypographySample.vue";

const props = defineProps<{
  graph: TokenGraph;
  node: TokenNode;
  variant: Variant;
}>();

const resolved = computed<string | undefined>(() =>
  resolveCss(props.graph, props.node.id, props.variant),
);

const isShadowLike = computed(() => {
  if (props.node.type === "shadow") return true;
  return /(^|-)shadow(-|$)/.test(props.node.id);
});
</script>

<template>
  <div class="border border-default rounded p-3">
    <template v-if="!resolved">
      <div class="text-xs text-muted">No resolved value for variant "{{ variant }}".</div>
    </template>
    <template v-else-if="node.type === 'color'">
      <ColorSwatch :value="resolved" />
    </template>
    <template v-else-if="isShadowLike">
      <ShadowDemo :value="resolved" />
    </template>
    <template v-else-if="node.type === 'number' || node.type === 'dimension'">
      <DimensionRuler :value="resolved" />
    </template>
    <template
      v-else-if="
        node.type === 'fontFamily' || node.type === 'fontWeight' || node.type === 'string'
      "
    >
      <TypographySample :value="resolved" :type="node.type" />
    </template>
    <template v-else>
      <div class="font-mono text-xs">{{ resolved }}</div>
    </template>
  </div>
</template>

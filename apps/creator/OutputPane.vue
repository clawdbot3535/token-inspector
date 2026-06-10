<script setup lang="ts">
import { computed } from "vue";
import type { DtcgTree } from "@tg/grammar";

interface Props {
  tree: DtcgTree;
  valueStrategy: "placeholder" | "alias-semantic";
}
const props = defineProps<Props>();
const emit = defineEmits<{
  "update:valueStrategy": [value: "placeholder" | "alias-semantic"];
  download: [];
}>();

const prettyJson = computed(() => JSON.stringify(props.tree, null, 2));
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-default shrink-0">
      <span class="text-[10px] uppercase tracking-wider text-muted mr-1">Values</span>
      <div class="inline-flex rounded border border-default overflow-hidden text-[10px]">
        <button
          type="button"
          class="px-2 py-0.5 transition-colors"
          :class="
            props.valueStrategy === 'alias-semantic'
              ? 'bg-primary text-inverted'
              : 'text-muted hover:bg-elevated'
          "
          @click="emit('update:valueStrategy', 'alias-semantic')"
        >
          alias
        </button>
        <button
          type="button"
          class="px-2 py-0.5 transition-colors"
          :class="
            props.valueStrategy === 'placeholder'
              ? 'bg-primary text-inverted'
              : 'text-muted hover:bg-elevated'
          "
          @click="emit('update:valueStrategy', 'placeholder')"
        >
          raw
        </button>
      </div>
      <button
        type="button"
        class="ml-auto px-2 py-0.5 text-[10px] rounded border border-default hover:bg-elevated transition-colors"
        @click="emit('download')"
      >
        Download
      </button>
    </div>

    <!-- JSON output -->
    <pre
      data-testid="creator-output"
      class="flex-1 overflow-auto p-3 text-[11px] font-mono text-default leading-relaxed"
    >{{ prettyJson }}</pre>
  </div>
</template>

<script setup lang="ts">
// Recursive token tree renderer. Each group is collapsible; leaves are
// clickable rows visually consistent with the previous flat list (badge
// on the right, selection / highlight styling on click).
//
// State (expanded paths, selection, highlights) lives in App.vue and is
// passed down — this component is purely a renderer + event source.

import type { TreeNode } from "../token-tree.js";
import type { ClassificationKind } from "@core/classify-token.js";
import ClassificationBadge from "./ClassificationBadge.vue";

interface Props {
  nodes: readonly TreeNode[];
  selectedId: string | null;
  highlightedIds: ReadonlySet<string>;
  expandedPaths: ReadonlySet<string>;
  /** Depth — used for indent. Top-level call passes 0. */
  depth?: number;
  /** Classifier — returns the badge kind for a given token id (or undefined). */
  kindOf: (id: string) => ClassificationKind | undefined;
}

const props = withDefaults(defineProps<Props>(), { depth: 0 });

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "toggle", path: string): void;
}>();

function indentPx(): string {
  // 8px per depth step keeps the tree scannable without losing screen width.
  return `${props.depth * 8}px`;
}
</script>

<template>
  <div>
    <template v-for="node in nodes" :key="node.kind === 'leaf' ? node.id : node.path">
      <!-- Group: a collapsible header with descendant count. -->
      <template v-if="node.kind === 'group'">
        <button
          type="button"
          class="w-full text-left flex items-center gap-1 px-2 py-0.5 hover:bg-elevated transition-colors text-zinc-500"
          :style="{ paddingLeft: `calc(0.5rem + ${indentPx()})` }"
          @click="emit('toggle', node.path)"
        >
          <span
            class="inline-block w-3 text-[10px] tabular-nums select-none"
          >
            {{ expandedPaths.has(node.path) ? '▾' : '▸' }}
          </span>
          <span class="font-mono text-xs flex-1 truncate">{{ node.label }}</span>
          <span class="text-[10px] tabular-nums text-zinc-400">{{ node.count }}</span>
        </button>
        <ComponentTree
          v-if="expandedPaths.has(node.path)"
          :nodes="node.children"
          :selected-id="selectedId"
          :highlighted-ids="highlightedIds"
          :expanded-paths="expandedPaths"
          :depth="depth + 1"
          :kind-of="kindOf"
          @select="(id: string) => emit('select', id)"
          @toggle="(p: string) => emit('toggle', p)"
        />
      </template>

      <!-- Leaf: clickable token row with classification badge. -->
      <button
        v-else
        type="button"
        class="w-full text-left px-2 py-0.5 hover:bg-elevated transition-colors flex items-center gap-2"
        :class="{
          'bg-primary/10 text-primary': selectedId === node.id,
          'bg-warning/15 text-warning':
            selectedId !== node.id && highlightedIds.has(node.id),
        }"
        :style="{ paddingLeft: `calc(1.25rem + ${indentPx()})` }"
        @click="emit('select', node.id)"
      >
        <span class="font-mono text-xs flex-1 truncate">{{ node.label }}</span>
        <ClassificationBadge v-if="kindOf(node.id)" :kind="kindOf(node.id)!" />
      </button>
    </template>
  </div>
</template>

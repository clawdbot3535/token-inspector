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
  /** Classifier — returns the badge kind for a given token id (or null/undefined). */
  kindOf: (id: string) => ClassificationKind | null | undefined;
  /**
   * Component names that have a rendered live preview. Top-level groups whose
   * name is in this set get a "Live" pill so designers can see at a glance
   * which components the middle pane can visually preview.
   */
  previewComponents?: ReadonlySet<string>;
}

const props = withDefaults(defineProps<Props>(), { depth: 0 });

/**
 * A top-level group (depth 0) maps to a component; show the "Live" pill when
 * that component has a preview. Deeper groups are variant sub-paths
 * (e.g. "button/solid") and never carry the pill.
 */
function hasPreview(path: string): boolean {
  if (props.depth !== 0) return false;
  const component = path.split("/")[0] ?? path;
  return props.previewComponents?.has(component) ?? false;
}

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "toggle", path: string): void;
  /** Fired when a group label is clicked — App.vue uses this to focus
   *  the middle-pane preview on the corresponding component. */
  (e: "select-component", topLevelSegment: string): void;
}>();

function onGroupClick(path: string): void {
  emit("toggle", path);
  // Derive the top-level segment ("button" from "button/solid") so deeply
  // nested clicks still map to the right preview component.
  const topLevel = path.split("/")[0] ?? path;
  emit("select-component", topLevel);
}

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
          @click="onGroupClick(node.path)"
        >
          <span
            class="inline-block w-3 text-[10px] tabular-nums select-none"
          >
            {{ expandedPaths.has(node.path) ? '▾' : '▸' }}
          </span>
          <span class="font-mono text-xs flex-1 truncate">{{ node.label }}</span>
          <span
            v-if="hasPreview(node.path)"
            class="text-[9px] font-medium uppercase tracking-wide px-1 py-0.5 rounded bg-primary/10 text-primary select-none"
            title="Live preview available"
          >Live</span>
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
          :preview-components="previewComponents"
          @select="(id: string) => emit('select', id)"
          @toggle="(p: string) => emit('toggle', p)"
          @select-component="(name: string) => emit('select-component', name)"
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

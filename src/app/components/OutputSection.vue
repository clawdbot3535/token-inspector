<script setup lang="ts">
import { computed } from "vue";
import type { Classification } from "@core/classify-token.js";

interface Props {
  classification: Classification;
  vueTemplateClasses?: string;
}

const props = defineProps<Props>();

const heading = computed(() =>
  props.classification.kind === "skip" ? "Vue Template Usage" : "Output",
);

function copy(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}
</script>

<template>
  <section class="border-t border-zinc-200 dark:border-zinc-800 mt-4 pt-4">
    <h3 class="text-xs font-mono uppercase text-zinc-500 mb-2">
      {{ heading }}
    </h3>

    <div v-if="classification.kind === 'tailwind-default'" class="space-y-2">
      <p class="text-xs text-zinc-500">
        Tailwind has this — no custom property emitted.
      </p>
      <div class="flex items-center gap-2">
        <code class="text-lg font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800">
          {{ classification.utility }}
        </code>
        <button
          type="button"
          class="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          @click="copy(classification.utility)"
        >
          Copy
        </button>
      </div>
      <p class="text-xs text-zinc-500 font-mono">
        resolves to {{ classification.resolvedValue }}
      </p>
    </div>

    <div v-else-if="classification.kind === 'theme-static'" class="space-y-2">
      <p v-if="classification.modeInvariantHint" class="text-xs text-amber-700 dark:text-amber-400">
        mode-invariant: same value in light + dark
      </p>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-zinc-500">CSS variable</dt>
        <dd class="font-mono">{{ classification.cssName }}</dd>
        <dt class="text-zinc-500">Value</dt>
        <dd class="font-mono">{{ classification.value }}</dd>
      </dl>
      <div class="flex gap-2">
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          @click="copy(`var(${classification.cssName})`)"
        >
          Copy var()
        </button>
      </div>
      <p v-if="classification.utilityHint" class="text-xs text-zinc-500">
        ≈ <code class="font-mono">{{ classification.utilityHint.utility }}</code>
        ({{ classification.utilityHint.resolvedValue }}) — consider snapping
      </p>
    </div>

    <div v-else-if="classification.kind === 'theme-mode-variant'" class="space-y-2">
      <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-zinc-500">CSS variable</dt>
        <dd class="font-mono">{{ classification.cssName }}</dd>
        <dt class="text-zinc-500">Light</dt>
        <dd class="font-mono">{{ classification.lightValue }}</dd>
        <dt class="text-zinc-500">Dark</dt>
        <dd class="font-mono">{{ classification.darkValue }}</dd>
      </dl>
      <div class="flex gap-2">
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          @click="copy(`var(${classification.cssName})`)"
        >
          Copy var()
        </button>
      </div>
    </div>

    <div v-else-if="classification.kind === 'skip'" class="space-y-2">
      <p class="text-xs text-zinc-500">
        Component-layer token — resolved at design-system-author time.
      </p>
      <template v-if="vueTemplateClasses">
        <code class="block text-sm font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 whitespace-pre-wrap break-words">
          {{ vueTemplateClasses }}
        </code>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          @click="copy(vueTemplateClasses)"
        >
          Copy class string
        </button>
      </template>
      <p v-else class="text-xs text-zinc-500 italic">
        No Tailwind utility mapping available (token does not match any slot heuristic).
      </p>
    </div>
  </section>
</template>

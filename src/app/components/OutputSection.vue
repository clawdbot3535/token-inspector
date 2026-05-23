<script setup lang="ts">
import { computed } from "vue";
import type { Classification } from "@core/classify-token.js";
import { useCopyToClipboard } from "../composables/use-copy-to-clipboard.js";

interface Props {
  classification: Classification;
  vueTemplateClasses?: string;
  /** Stable id of the token this section describes — used for copy-feedback keys. */
  tokenId?: string;
}

const props = defineProps<Props>();

const heading = computed(() => {
  if (props.classification.kind === "skip") return "Assigned Tailwind class";
  return "Output";
});

const { copy, wasJustCopied } = useCopyToClipboard();

function key(suffix: string): string {
  return `${props.tokenId ?? "_"}-${suffix}`;
}

function copyLabel(suffix: string, fallback = "Copy"): string {
  return wasJustCopied(key(suffix)) ? "Copied!" : fallback;
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
        <code
          class="text-lg font-mono px-3 py-1.5 rounded ring-1 ring-primary/30 bg-primary/10 text-primary"
        >
          {{ classification.utility }}
        </code>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied(key('utility')) }"
          @click="copy(classification.utility, key('utility'))"
        >
          {{ copyLabel('utility') }}
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
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied(key('var')) }"
          @click="copy(`var(${classification.cssName})`, key('var'))"
        >
          {{ copyLabel('var', 'Copy var()') }}
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
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied(key('var')) }"
          @click="copy(`var(${classification.cssName})`, key('var'))"
        >
          {{ copyLabel('var', 'Copy var()') }}
        </button>
      </div>
    </div>

    <div v-else-if="classification.kind === 'skip'" class="space-y-3">
      <template v-if="vueTemplateClasses">
        <!-- The visual highlight the user asked for: this token maps to
             these Tailwind utilities. Big, colored, scannable. -->
        <div
          class="flex items-center gap-2 flex-wrap rounded-md ring-1 ring-primary/30 bg-primary/5 px-3 py-2"
        >
          <span class="text-xs text-zinc-500 font-mono">{{ tokenId ?? "this token" }}</span>
          <span class="text-zinc-400">→</span>
          <code
            class="text-base font-mono font-medium text-primary break-all"
          >
            {{ vueTemplateClasses }}
          </code>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            :class="{ 'text-success border-success/60': wasJustCopied(key('classes')) }"
            @click="copy(vueTemplateClasses, key('classes'))"
          >
            {{ copyLabel('classes', 'Copy class') }}
          </button>
          <span class="text-xs text-zinc-500">
            Component-layer token — applied via the Nuxt UI recipe, not as a CSS variable.
          </span>
        </div>
      </template>
      <p v-else class="text-xs text-zinc-500 italic">
        No Tailwind utility mapping available (token does not match any slot heuristic).
      </p>
    </div>
  </section>
</template>

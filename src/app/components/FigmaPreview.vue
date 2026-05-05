<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  matchMapping,
  toEmbedSrc,
  type FigmaComponentVariant,
  type FigmaMappingFile,
} from "../figma-mapping.js";

const props = defineProps<{
  mapping: FigmaMappingFile;
  tokenId: string;
}>();

const emit = defineEmits<{
  highlight: [ids: ReadonlySet<string>];
}>();

const match = computed(() => matchMapping(props.mapping, props.tokenId));

const embedSrc = computed<string | null>(() => {
  if (match.value) return toEmbedSrc(match.value.url);
  if (props.mapping.fileFallbackUrl) return toEmbedSrc(props.mapping.fileFallbackUrl);
  return null;
});

const headerLabel = computed<string>(() => {
  if (match.value) return `Figma · ${match.value.label}`;
  if (props.mapping.fileFallbackUrl) return "Figma · file";
  return "Figma";
});

const externalUrl = computed<string | null>(() => {
  if (match.value) return match.value.url;
  if (props.mapping.fileFallbackUrl) return props.mapping.fileFallbackUrl;
  return null;
});

const activeVariant = ref<FigmaComponentVariant | null>(null);
const variants = computed(() => match.value?.variants ?? []);

// Variants that consume the currently selected token — for reverse-highlighting.
const variantsContainingToken = computed<ReadonlySet<string>>(() => {
  const set = new Set<string>();
  if (!match.value?.variants) return set;
  for (const v of match.value.variants) {
    if (v.tokensUsed.includes(props.tokenId)) set.add(v.nodeId);
  }
  return set;
});

watch(
  () => match.value?.prefix,
  () => {
    activeVariant.value = null;
    emit("highlight", new Set());
  },
);

function pickVariant(v: FigmaComponentVariant) {
  if (activeVariant.value?.nodeId === v.nodeId) {
    activeVariant.value = null;
    emit("highlight", new Set());
  } else {
    activeVariant.value = v;
    emit("highlight", new Set(v.tokensUsed));
  }
}
</script>

<template>
  <div v-if="embedSrc" class="space-y-2">
    <div class="flex items-center justify-between text-xs">
      <span class="text-muted">{{ headerLabel }}</span>
      <a
        v-if="externalUrl"
        :href="externalUrl"
        target="_blank"
        rel="noopener"
        class="text-primary hover:underline"
      >
        Open in Figma →
      </a>
    </div>

    <div class="border border-default rounded overflow-hidden bg-elevated">
      <iframe
        :src="embedSrc"
        class="w-full h-80 border-0"
        loading="lazy"
        referrerpolicy="no-referrer"
        allow="fullscreen"
      ></iframe>
    </div>

    <div v-if="variants.length > 0" class="space-y-1">
      <div class="text-xs text-muted">
        Variants ({{ variants.length }}) — click to highlight tokens
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="v in variants"
          :key="v.nodeId"
          class="flex items-center gap-2 px-2 py-1 text-[11px] rounded font-mono border border-default hover:border-primary transition-colors"
          :class="{
            'bg-warning/20 border-warning text-warning':
              activeVariant?.nodeId === v.nodeId,
            'ring-1 ring-primary/40':
              activeVariant?.nodeId !== v.nodeId &&
              variantsContainingToken.has(v.nodeId),
          }"
          @click="pickVariant(v)"
        >
          <img
            v-if="v.screenshot"
            :src="v.screenshot"
            :alt="v.name"
            class="size-6 object-contain border border-default rounded bg-default"
            loading="lazy"
          />
          <span>{{ v.name }}</span>
          <span class="text-muted">· {{ v.tokensUsed.length }}</span>
        </button>
      </div>
      <div v-if="variantsContainingToken.size > 0" class="text-[11px] text-primary">
        ↑ {{ variantsContainingToken.size }} variant{{
          variantsContainingToken.size === 1 ? "" : "s"
        }} consume the selected token
      </div>
    </div>
  </div>
</template>

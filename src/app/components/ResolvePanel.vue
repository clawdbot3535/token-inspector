<script setup lang="ts">
import { ref } from "vue";
import type { SlotMappingEntry, UtilityType, VariantAxis } from "@tg/grammar";
import type { ResolvableDeviation } from "../resolve/heuristic-extendable.js";

const props = defineProps<{ deviation: ResolvableDeviation }>();
const emit = defineEmits<{ (e: "apply", tokenId: string, entry: SlotMappingEntry): void }>();

const UTILITY_TYPES: readonly UtilityType[] = [
  "padding-x", "padding-y", "padding", "rounded", "gap", "icon-size", "size",
  "font-weight", "text-size", "line-height", "letter-spacing", "font-family",
  "bg-color", "text-color", "border-color", "border-width", "ring-color",
  "ring-width", "underline-color", "placeholder-color", "ring-offset",
  "height", "width", "overlay-bg",
];
const AXES: readonly (VariantAxis | "none")[] = ["none", "size", "color", "variant"];

const slot = ref<string>(props.deviation.guess.slot);
const utilityType = ref<UtilityType>(props.deviation.guess.utilityType);
const axis = ref<VariantAxis | "none">(props.deviation.guess.variantAxis ?? "none");
const variantKey = ref<string>(props.deviation.guess.variantKey ?? "");
const statePrefix = ref<string>(props.deviation.guess.statePrefix ?? "");

function apply(): void {
  if (!slot.value) return;
  emit("apply", props.deviation.tokenId, {
    slot: slot.value,
    utilityType: utilityType.value,
    variantAxis: axis.value === "none" ? null : axis.value,
    variantKey: variantKey.value.trim() === "" ? null : variantKey.value.trim(),
    statePrefix: statePrefix.value.trim() === "" ? null : statePrefix.value.trim(),
  });
}
</script>

<template>
  <div class="flex flex-col gap-2 text-xs" data-testid="resolve-panel">
    <div class="font-mono text-zinc-700 dark:text-zinc-300">{{ deviation.tokenId }}</div>
    <label class="flex items-center gap-2">slot
      <USelect v-model="slot" :items="deviation.candidateSlots" data-testid="resolve-slot" />
    </label>
    <label class="flex items-center gap-2">utility
      <USelect v-model="utilityType" :items="UTILITY_TYPES" data-testid="resolve-utility" />
    </label>
    <label class="flex items-center gap-2">axis
      <USelect v-model="axis" :items="AXES" />
    </label>
    <label v-if="axis !== 'none'" class="flex items-center gap-2">variant key
      <input v-model="variantKey" class="border rounded px-1" />
    </label>
    <label class="flex items-center gap-2">state prefix
      <input v-model="statePrefix" placeholder="(none)" class="border rounded px-1" />
    </label>
    <p class="text-zinc-500">before: unmapped → after: <code>{{ slot }}</code> / <code>{{ utilityType }}</code></p>
    <div>
      <UButton size="xs" :disabled="!slot" data-testid="resolve-apply" @click="apply">Apply</UButton>
    </div>
  </div>
</template>

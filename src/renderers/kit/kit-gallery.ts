import type { TokenGraph } from "../../token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { buildComponentRecipes } from "../../recipe-engine.js";
import { COMPONENT_ALLOW_LIST } from "../app-config.js";

/** Markup per component for the gallery. The theme is GLOBAL (Vite plugin), so plain
 *  component usage is themed automatically — no per-component :ui needed. Lean: one
 *  default instance + the key variants. Overlay components (modal/dropdown) render a
 *  static trigger; chip/sidebar are custom (deferred from v1 — see kit README). */
const GALLERY_SNIPPETS: Record<string, string> = {
  button: `<UButton>Button</UButton> <UButton variant="outline">Outline</UButton> <UButton variant="soft">Soft</UButton>`,
  badge: `<UBadge>Badge</UBadge> <UBadge color="error">Error</UBadge> <UBadge color="success">Success</UBadge>`,
  input: `<UInput placeholder="Text" />`,
  textarea: `<UTextarea placeholder="Text" />`,
  card: `<UCard>Card body</UCard>`,
  kbd: `<UKbd value="K" />`,
  progress: `<UProgress :model-value="50" />`,
  switch: `<USwitch :model-value="true" /> <USwitch :model-value="false" />`,
  checkbox: `<UCheckbox :model-value="true" label="Checkbox" />`,
  radio: `<URadioGroup :model-value="'a'" :items="[{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }]" />`,
  table: `<UTable :data="[{ id: 1, name: 'Row 1' }, { id: 2, name: 'Row 2' }]" />`,
  nav: `<UNavigationMenu :items="[{ label: 'Home' }, { label: 'Docs' }]" />`,
  accordion: `<UAccordion :items="[{ label: 'Section', content: 'Body' }]" />`,
  modal: `<UModal title="Modal"><UButton>Open modal</UButton></UModal>`,
  dropdown: `<UDropdownMenu :items="[[{ label: 'Item' }]]"><UButton>Open menu</UButton></UDropdownMenu>`,
  // chip / sidebar (custom components) deferred from gallery v1.
};

export function buildKitGallery(graph: TokenGraph, slotMappingOverride?: SlotMappingOverride): string {
  const recipes = buildComponentRecipes(graph, { components: [...COMPONENT_ALLOW_LIST], slotMappingOverride });
  const present = COMPONENT_ALLOW_LIST.filter((name) => recipes[name] && GALLERY_SNIPPETS[name]);
  const sections = present
    .map(
      (name) => `      <section data-component="${name}" class="space-y-2">
        <h2 class="text-sm font-semibold capitalize">${name}</h2>
        <div class="flex flex-wrap items-center gap-3">${GALLERY_SNIPPETS[name]}</div>
      </section>`,
    )
    .join("\n");
  return `<script setup lang="ts"></script>

<template>
  <UApp>
    <main class="p-8 space-y-8 max-w-3xl mx-auto">
      <h1 class="text-lg font-bold">Design Kit</h1>
${sections}
    </main>
  </UApp>
</template>
`;
}

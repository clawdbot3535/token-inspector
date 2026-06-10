// Composable: wires scaffold + semantic-role + buildGraph together for the Creator UI.

import { ref, reactive, computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import {
  scaffold,
  loadProfile,
  flattenDtcg,
  getSlotMapping,
} from "@tg/grammar";
import type { DtcgTree, Profile } from "@tg/grammar";
import nuxtUiJson from "@tg/grammar/profiles/nuxt-ui.json";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile, TokenGraph } from "@core/token-graph.js";
import { downloadBlob } from "@/zip.js";
import { nuxtUiAliasResolver } from "./semantic-role.js";

const profile: Profile = loadProfile(nuxtUiJson);
const componentNames = Object.keys(profile.components);
const firstComponent = componentNames[0] ?? "button";

export interface CreatorSelected {
  component: string;
  slots: string[];
  states: string[];
  sizes: string[];
  valueStrategy: "placeholder" | "alias-semantic";
}

export interface CreatorComposable {
  loadedSources: Ref<SourceFile[]>;
  selected: CreatorSelected;
  profile: Profile;
  scaffoldTree: ComputedRef<DtcgTree>;
  unmappedCount: ComputedRef<number>;
  tokenCount: ComputedRef<number>;
  previewGraph: ComputedRef<TokenGraph | null>;
  download: () => void;
}

export function useCreator(): CreatorComposable {
  const loadedSources = ref<SourceFile[]>([]);

  const compProfile = profile.components[firstComponent]!;
  const selected = reactive<CreatorSelected>({
    component: firstComponent,
    slots: [...compProfile.parts],
    states: [...compProfile.states],
    sizes: [...compProfile.sizes],
    valueStrategy: "alias-semantic",
  });

  const scaffoldTree = computed(() => {
    const comp = selected.component;
    return scaffold(profile, comp, {
      parts: selected.slots.length > 0 ? selected.slots : undefined,
      states: selected.states,
      sizes: selected.sizes,
      valueStrategy: selected.valueStrategy,
      aliasResolver: nuxtUiAliasResolver,
    });
  });

  const unmappedCount = computed(() =>
    flattenDtcg(scaffoldTree.value).filter((id) => getSlotMapping(id) === null).length
  );

  const tokenCount = computed(() => flattenDtcg(scaffoldTree.value).length);

  const previewGraph = computed((): TokenGraph | null => {
    try {
      // Use "global" as the SourceLayer for the creator scaffold source —
      // buildGraph maps it to the "component" graph layer (no theme, no alias chain).
      const creatorSource: SourceFile = {
        name: "global",
        data: scaffoldTree.value as Record<string, unknown>,
      };
      return buildGraph([...loadedSources.value, creatorSource]);
    } catch {
      return null;
    }
  });

  function download(): void {
    const json = JSON.stringify(scaffoldTree.value, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, `${selected.component}.tokens.json`);
  }

  return {
    loadedSources,
    selected,
    profile,
    scaffoldTree,
    unmappedCount,
    tokenCount,
    previewGraph,
    download,
  };
}

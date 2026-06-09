<script setup lang="ts">
import { ref } from "vue";
import { defaultRenderers, appConfigRenderer } from "@core/renderers/index.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { parseGitUrl } from "../git-import.js";
import { commitFiles, type ExportFile } from "../git-export.js";

interface Props {
  graph: TokenGraph | null;
  completeness: ReadonlyArray<CompletenessScore>;
}
const props = defineProps<Props>();

const exportUrl = ref<string>(
  typeof localStorage !== "undefined" ? (localStorage.getItem("figma-tokens-export-url") ?? "") : "",
);
const commitMessage = ref<string>("chore(tokens): update from Figma");
const pat = ref<string>(
  typeof sessionStorage !== "undefined" ? (sessionStorage.getItem("git-export-pat") ?? "") : "",
);
const committing = ref(false);
const commitConfirm = ref(false);
const commitUrl = ref<string | null>(null);
const commitError = ref<string | null>(null);

function persistPat() {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem("git-export-pat", pat.value);
}

function buildExportFiles(): ExportFile[] {
  const g = props.graph;
  if (!g) return [];
  const target = parseGitUrl(exportUrl.value);
  const dir = target?.dir ?? "";
  return defaultRenderers.map((r) => ({
    path: dir ? `${dir}/${r.id}` : r.id,
    content:
      r.id === appConfigRenderer.id
        ? appConfigRenderer.render(g, { completeness: props.completeness }).text
        : r.render(g).text,
  }));
}

function requestCommit() {
  commitUrl.value = null;
  commitError.value = null;
  if (!props.graph) { commitError.value = "Load tokens first."; return; }
  if (!parseGitUrl(exportUrl.value)) { commitError.value = "Unrecognised GitHub/GitLab URL."; return; }
  if (pat.value.trim().length === 0) { commitError.value = "A write token is required."; return; }
  commitConfirm.value = true;
}

async function doCommit() {
  const target = parseGitUrl(exportUrl.value);
  if (!target) { commitError.value = "Unrecognised GitHub/GitLab URL."; commitConfirm.value = false; return; }
  committing.value = true;
  try {
    const result = await commitFiles(target, buildExportFiles(), pat.value.trim(), commitMessage.value);
    commitUrl.value = result.commitUrl;
    if (typeof localStorage !== "undefined") localStorage.setItem("figma-tokens-export-url", exportUrl.value.trim());
  } catch (e) {
    commitError.value = e instanceof Error ? e.message : "Commit failed.";
  } finally {
    committing.value = false;
    commitConfirm.value = false;
  }
}
</script>

<template>
  <div class="border-b border-default bg-elevated px-4 py-3">
    <div class="flex flex-col gap-2 max-w-md">
      <span class="text-[10px] uppercase tracking-wider text-zinc-400">Commit to Git</span>
      <input
        type="text"
        v-model="exportUrl"
        data-testid="export-url"
        placeholder="target repo: github.com/owner/nuxt-app/tree/main/app"
        class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
      />
      <input
        type="text"
        v-model="commitMessage"
        placeholder="commit message"
        class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
      />
      <input
        type="password"
        v-model="pat"
        data-testid="export-pat"
        placeholder="write PAT (kept in sessionStorage only)"
        autocomplete="off"
        class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
        @input="persistPat"
      />
      <button
        type="button"
        data-testid="commit-button"
        class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        :disabled="committing || !props.graph"
        @click="requestCommit"
      >Commit to Git…</button>

      <div
        v-if="commitConfirm"
        data-testid="commit-confirm"
        class="text-[11px] rounded border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1"
      >
        <p>Commit <code class="font-mono">tokens.css</code> + <code class="font-mono">app.config.ts</code> to:</p>
        <p class="font-mono break-all">{{ exportUrl }}</p>
        <div class="flex gap-2 pt-1">
          <button type="button" class="px-2 py-0.5 rounded bg-primary text-inverted disabled:opacity-50" :disabled="committing" @click="doCommit">{{ committing ? "Committing…" : "Confirm" }}</button>
          <button type="button" class="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700" :disabled="committing" @click="commitConfirm = false">Cancel</button>
        </div>
      </div>

      <p v-if="commitUrl" data-testid="commit-result" class="text-[11px] text-emerald-600 dark:text-emerald-400 break-all">
        Committed: <a :href="commitUrl" target="_blank" rel="noopener" class="underline">{{ commitUrl }}</a>
      </p>
      <p v-if="commitError" class="text-[11px] text-red-600 dark:text-red-400">{{ commitError }}</p>
    </div>
  </div>
</template>

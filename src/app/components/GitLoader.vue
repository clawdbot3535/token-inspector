<script setup lang="ts">
import { ref } from "vue";
import { parseGitUrl, fetchTokenFiles } from "../git-import.js";

const emit = defineEmits<{ files: [files: File[]]; error: [message: string] }>();

const repoUrl = ref<string>(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("figma-tokens-repo-url") ?? "")
    : "",
);
const repoLoading = ref(false);

async function loadFromRepo() {
  const ref_ = parseGitUrl(repoUrl.value);
  if (!ref_) {
    emit("error", "Unrecognised GitHub/GitLab URL.");
    return;
  }
  repoLoading.value = true;
  try {
    const files = await fetchTokenFiles(ref_);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("figma-tokens-repo-url", repoUrl.value.trim());
    }
    emit("files", files);
  } catch (e) {
    emit("error", e instanceof Error ? e.message : String(e));
  } finally {
    repoLoading.value = false;
  }
}
</script>

<template>
  <div class="mt-4 flex gap-2 items-center">
    <input
      v-model="repoUrl"
      type="text"
      placeholder="GitHub / GitLab folder URL…"
      class="flex-1 text-xs px-2 py-1.5 rounded border border-default bg-default focus:outline-none focus:border-primary"
      @keydown.enter="loadFromRepo"
    />
    <button
      data-testid="repo-load"
      :disabled="repoLoading || repoUrl.trim().length === 0"
      class="px-3 py-1.5 text-xs rounded-md bg-elevated border border-default hover:bg-elevated/80 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      @click="loadFromRepo"
    >{{ repoLoading ? "Loading…" : "Load from Git" }}</button>
  </div>
</template>

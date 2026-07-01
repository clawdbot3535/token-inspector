<script setup lang="ts">
import { computed } from "vue";
import type { TokenSource } from "../git-import.js";
import { relativeTime } from "../relative-time.js";

// Header provenance badge: where the loaded tokens came from (Git ref + the
// loaded commit). Renders nothing when the graph was drag-dropped (no source).
const props = defineProps<{ source: TokenSource | null }>();

const text = computed(() => {
  const s = props.source;
  if (!s) return null;
  const base = `${s.ref.repo}@${s.ref.branch}`;
  if (!s.commit?.sha) return base;
  const sha = s.commit.sha.slice(0, 7);
  const when = s.commit.date ? relativeTime(s.commit.date, Date.now()) : "";
  return when ? `${base} · ${sha} · ${when}` : `${base} · ${sha}`;
});

const title = computed(() => {
  const s = props.source;
  if (!s) return "";
  const where = `tokens: ${s.ref.owner}/${s.ref.repo}@${s.ref.branch}${s.ref.dir ? "/" + s.ref.dir : ""}`;
  return s.commit?.message ? `${where} — ${s.commit.message}` : where;
});
</script>

<template>
  <span
    v-if="text"
    data-testid="token-source"
    class="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
    :title="title"
    >{{ text }}</span
  >
</template>

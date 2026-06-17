// Browser glue for the render-vs-tokens diff: resolve the recipe's base classes to expected
// computed values via a hidden probe, read the rendered element's actual computed values, and
// diff them. Both sides go through getComputedStyle so the comparison is a plain string match.
// Browser-only (getComputedStyle); jsdom returns empty computed values, so the real verdict is /browse.

import { onMounted, ref, watch, nextTick, type Ref } from "vue";
import { extractArbitrary } from "../extract-arbitrary.js";
import { diffComputed, type RenderDelta } from "../render-diff.js";
import { ensureRuntimeTailwind } from "./use-runtime-tailwind.js";

export function computeRenderDiff(el: Element, baseClasses: string): RenderDelta[] {
  if (typeof document === "undefined") return [];
  const { style } = extractArbitrary(baseClasses);
  const keys = Object.keys(style);
  if (keys.length === 0) return [];

  const probe = document.createElement("div");
  Object.assign(probe.style, style); // camelCase CSSProperties → CSSStyleDeclaration
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const probeCs = getComputedStyle(probe) as unknown as Record<string, string>;
  const actualCs = getComputedStyle(el) as unknown as Record<string, string>;
  const expected: Record<string, string> = {};
  const actual: Record<string, string> = {};
  for (const k of keys) {
    expected[k] = String(probeCs[k] ?? "");
    actual[k] = String(actualCs[k] ?? "");
  }
  probe.remove();
  return diffComputed(expected, actual);
}

export interface SlotDiff {
  slot: string;
  deltas: RenderDelta[];
}

/** For each spec, find the sentinel-marked element within host and diff it against its recipe classes. */
export function computeSlotDiffs(
  host: ParentNode,
  specs: ReadonlyArray<{ slot: string; selector: string; classes: string }>,
): SlotDiff[] {
  return specs.map((s) => {
    const el = host.querySelector(s.selector);
    return { slot: s.slot, deltas: el ? computeRenderDiff(el, s.classes) : [] };
  });
}

export interface SentinelBuild {
  ui: Record<string, string>;
  specs: Array<{ slot: string; selector: string; classes: string }>;
}

/** For every populated recipe slot, append a sentinel class and emit its diff spec. */
export function buildSlotSentinels(slots: Readonly<Record<string, string | undefined>>): SentinelBuild {
  const ui: Record<string, string> = {};
  const specs: SentinelBuild["specs"] = [];
  for (const [slot, classes] of Object.entries(slots)) {
    if (!classes) continue;
    ui[slot] = `${classes} ti-slot-${slot}`;
    specs.push({ slot, selector: `.ti-slot-${slot}`, classes });
  }
  return { ui, specs };
}

/** Drive the per-slot diff once the runtime compiler has painted. Browser-only. */
export function useRealRender(
  hostRef: Ref<HTMLElement | null>,
  specsFn: () => ReadonlyArray<{ slot: string; selector: string; classes: string }>,
): { slotDiffs: Ref<SlotDiff[]> } {
  const slotDiffs = ref<SlotDiff[]>([]);
  async function refresh(): Promise<void> {
    await ensureRuntimeTailwind();
    await nextTick();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const host = hostRef.value;
    slotDiffs.value = host ? computeSlotDiffs(host, specsFn()) : [];
  }
  onMounted(refresh);
  watch(() => JSON.stringify(specsFn()), refresh);
  return { slotDiffs };
}

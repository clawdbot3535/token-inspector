// Browser glue for the render-vs-tokens diff: resolve the recipe's base classes to expected
// computed values via a hidden probe, read the rendered element's actual computed values, and
// diff them. Both sides go through getComputedStyle so the comparison is a plain string match.
// Browser-only (getComputedStyle); jsdom returns empty computed values, so the real verdict is /browse.

import { onMounted, ref, watch, nextTick, type Ref } from "vue";
import type { ComponentRecipe } from "@core/recipe-engine.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";
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

export interface VariantCell {
  axis: "variant" | "color";
  key: string;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
  props: Record<string, string>;
}

/**
 * Turn a recipe's `variant` and `color` axes into per-key diff cells. Each cell
 * composes the base slot classes with the variant's slot overrides, stamps the
 * sentinels (via buildSlotSentinels), and carries `{ [axis]: key }` as the real
 * Nuxt variant prop (recipe axis names equal Nuxt prop names). `size` is excluded.
 */
export function buildVariantCells(recipe: ComponentRecipe): VariantCell[] {
  const cells: VariantCell[] = [];
  const baseSlots = recipe.slots as Record<string, string | undefined>;
  for (const axis of ["variant", "color"] as const) {
    const bucket = recipe.variants[axis];
    if (!bucket) continue;
    for (const key of Object.keys(bucket)) {
      const variantSlots = bucket[key] as Record<string, string | undefined>;
      const composed: Record<string, string | undefined> = {};
      for (const slot of new Set([...Object.keys(baseSlots), ...Object.keys(variantSlots)])) {
        const merged = [baseSlots[slot], variantSlots[slot]].filter(Boolean).join(" ");
        composed[slot] = merged || undefined;
      }
      const { ui, specs } = buildSlotSentinels(composed);
      cells.push({ axis, key, ui, specs, props: { [axis]: key } });
    }
  }
  return cells;
}

const SETTABLE_STATES = ["disabled"] as const;
const STATE_PROPS: Record<string, Record<string, unknown>> = { disabled: { disabled: true } };

export interface StateCell {
  state: string;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
  props: Record<string, unknown>;
}

/**
 * One cell per supported settable state the recipe actually carries (B.1: `disabled`).
 * `ui` keeps the FULL slot classes (prefixes intact) so the state fires when the component
 * is put in it; the diff `specs` use `projectToState(classes, state)` — the promoted intent.
 */
export function buildStateCells(recipe: ComponentRecipe): StateCell[] {
  const cells: StateCell[] = [];
  const slots = recipe.slots as Record<string, string | undefined>;
  for (const state of SETTABLE_STATES) {
    const prefix = `${state}:`;
    const present = Object.values(slots).some(
      (cls) => cls?.split(/\s+/).some((c) => c.startsWith(prefix)) ?? false,
    );
    if (!present) continue;
    const ui: Record<string, string> = {};
    const specs: SentinelBuild["specs"] = [];
    for (const [slot, classes] of Object.entries(slots)) {
      if (!classes) continue;
      ui[slot] = `${classes} ti-slot-${slot}`;
      specs.push({ slot, selector: `.ti-slot-${slot}`, classes: projectToState(classes, state) });
    }
    cells.push({ state, ui, specs, props: STATE_PROPS[state] ?? {} });
  }
  return cells;
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

import { scanGraph } from "@core/scanner.js";
import type { TokenGraph } from "@core/token-graph.js";

export interface KitNote {
  text: string;
  kind: "expected" | "gap";
}

/** Curated "expected Nuxt behavior" catalog, keyed by (component → variant|state).
 *  Seeded narrow for v1 (the confirmed cases); grows during joint component review. */
export const KIT_BEHAVIORS: Readonly<
  Record<string, { variants?: Record<string, readonly KitNote[]>; states?: Record<string, readonly KitNote[]> }>
> = {
  button: {
    variants: {
      outline: [{ text: "Nuxt adds an inset ring — expected; the recipe has no inset concept.", kind: "expected" }],
      link: [{ text: "Underline shows on hover only (Nuxt default).", kind: "expected" }],
    },
  },
};

export function behaviorsFor(component: string, sel: { variant?: string; state?: string }): readonly KitNote[] {
  const entry = KIT_BEHAVIORS[component];
  if (!entry) return [];
  const out: KitNote[] = [];
  if (sel.variant && entry.variants?.[sel.variant]) out.push(...entry.variants[sel.variant]!);
  if (sel.state && entry.states?.[sel.state]) out.push(...entry.states[sel.state]!);
  return out;
}

export function allBehaviorsFor(component: string): readonly KitNote[] {
  const entry = KIT_BEHAVIORS[component];
  if (!entry) return [];
  return [...Object.values(entry.variants ?? {}).flat(), ...Object.values(entry.states ?? {}).flat()];
}

// These must stay in sync with the kind strings emitted in src/scanner.ts.
// ScanIssue.kind is typed `string` (open for extension), so a scanner-side kind
// rename will NOT surface as a compile error here — it would silently make
// scannerNotesFor() drop those issues. Keep this set aligned on any kind rename.
const CAPABILITY_DEVIATION_KINDS: ReadonlySet<string> = new Set([
  "disabled-via-opacity",
  "resting-shadowed-by-state",
  "unsupported-state",
  "state-via-prop",
  "unsupported-part",
]);

/** Capability-deviation kinds whose affected state cell is deterministic. */
const KIND_TO_STATE: Readonly<Record<string, string>> = { "disabled-via-opacity": "disabled" };

export interface ScannerNotes {
  byState: Readonly<Record<string, readonly KitNote[]>>;
  all: readonly KitNote[];
}

/** Reuse the scanner's capability-deviation warnings for `component` as KitNotes.
 *  Self-contained: runs scanGraph for the component, no app-state threading. */
export function scannerNotesFor(component: string, graph: TokenGraph | null): ScannerNotes {
  if (!graph) return { byState: {}, all: [] };
  const issues = scanGraph(graph, { components: [component] }).issues.filter(
    (i) => i.componentName === component && CAPABILITY_DEVIATION_KINDS.has(i.kind),
  );
  const byState: Record<string, KitNote[]> = {};
  const all: KitNote[] = [];
  for (const issue of issues) {
    const note: KitNote = { text: issue.message, kind: "expected" };
    all.push(note);
    const state = KIND_TO_STATE[issue.kind];
    if (state) (byState[state] ??= []).push(note);
  }
  return { byState, all };
}

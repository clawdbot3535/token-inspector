import type { ScanReport } from "@core/token-graph.js";
import type { SlotMappingEntry, UtilityType } from "@tg/grammar";
import { nuxtSlotsFor, defaultBaseSlot } from "@tg/grammar";

export const HEURISTIC_EXTENDABLE_KINDS: ReadonlySet<string> = new Set([
  "unsupported-part",
  "component-looks-custom",
]);

const SUFFIX_UTILITY: ReadonlyArray<readonly [RegExp, UtilityType]> = [
  [/padding-x$/, "padding-x"],
  [/padding-y$/, "padding-y"],
  [/padding$/, "padding"],
  [/(radius|rounded)$/, "rounded"],
  [/border-width$/, "border-width"],
  [/border(-color)?$/, "border-color"],
  [/ring-width$/, "ring-width"],
  [/ring(-color)?$/, "ring-color"],
  [/gap$/, "gap"],
  [/icon(-size)?$/, "icon-size"],
  [/(font-weight|weight)$/, "font-weight"],
  [/(text-size)$/, "text-size"],
  [/size$/, "size"],
  [/height$/, "height"],
  [/width$/, "width"],
  [/(bg|background)$/, "bg-color"],
  [/(text|fg|foreground|color)$/, "text-color"],
];

export function guessUtilityType(tokenId: string): UtilityType {
  for (const [re, ut] of SUFFIX_UTILITY) {
    if (re.test(tokenId)) return ut;
  }
  return "bg-color";
}

export type ResolvableDeviation = {
  tokenId: string;
  component: string;
  kind: string;
  candidateSlots: string[];
  guess: SlotMappingEntry;
};

export function heuristicExtendable(report: ScanReport): ResolvableDeviation[] {
  const out: ResolvableDeviation[] = [];
  const seen = new Set<string>();
  for (const issue of report.issues) {
    if (!HEURISTIC_EXTENDABLE_KINDS.has(issue.kind)) continue;
    for (const tokenId of issue.tokenIds) {
      if (seen.has(tokenId)) continue;
      seen.add(tokenId);
      const component = issue.componentName ?? tokenId.split("-")[0] ?? tokenId;
      const slots = [...(nuxtSlotsFor(component) ?? new Set<string>())];
      const candidateSlots = [...new Set([...slots, ...(issue.customParts ?? [])])];
      out.push({
        tokenId,
        component,
        kind: issue.kind,
        candidateSlots,
        guess: {
          slot: defaultBaseSlot(component),
          utilityType: guessUtilityType(tokenId),
          variantAxis: null,
          variantKey: null,
          statePrefix: null,
        },
      });
    }
  }
  return out;
}

// Pure comparison of a recipe's intended computed styles (expected) vs the rendered
// element's computed styles (actual). One delta per expected property. Both sides arrive
// already getComputedStyle-normalized (see use-render-diff), so plain string equality is sound.

export interface RenderDelta {
  property: string;
  expected: string;
  actual: string;
  match: boolean;
}

export function diffComputed(
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
): RenderDelta[] {
  return Object.keys(expected).map((property) => {
    const exp = (expected[property] ?? "").trim();
    const act = (actual[property] ?? "").trim();
    return { property, expected: exp, actual: act, match: exp === act };
  });
}

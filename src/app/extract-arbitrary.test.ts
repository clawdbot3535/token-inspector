import { describe, it, expect } from "vitest";
import { extractArbitrary } from "./extract-arbitrary.js";

describe("extractArbitrary", () => {
  it("translates arbitrary padding into inline styles, dropping the class", () => {
    const { classes, style } = extractArbitrary("px-[10px] py-[8px]");
    expect(style.paddingLeft).toBe("10px");
    expect(style.paddingRight).toBe("10px");
    expect(style.paddingTop).toBe("8px");
    expect(style.paddingBottom).toBe("8px");
    expect(classes).toBe("");
  });

  // Regression: the recipe engine emits per-size button dimensions as
  // arbitrary-value `h-[..]`/`w-[..]` classes. These were missing from the
  // prefix→CSS map, so they leaked through as class names that Tailwind JIT
  // never generates — every size collapsed to content height.
  it("translates arbitrary height/width into inline styles", () => {
    const { classes, style } = extractArbitrary("h-[44px] w-[120px]");
    expect(style.height).toBe("44px");
    expect(style.width).toBe("120px");
    expect(classes).toBe("");
  });

  // Regression: scale classes the recipe emits (py-2.5, px-1, gap-0.5,
  // rounded-sm, text-lg) only render if Tailwind JIT happened to generate
  // them from some unrelated static occurrence. `py-2.5` is the exact class
  // that silently vanished (px-2.5 ships in @nuxt/ui, py-2.5 does not), so the
  // lg button's vertical padding collapsed to 0. Resolve them to inline styles.
  it("resolves spacing scale classes to inline styles (the py-2.5 bug)", () => {
    const { classes, style } = extractArbitrary("px-1 py-1");
    expect(style.paddingLeft).toBe("0.25rem");
    expect(style.paddingTop).toBe("0.25rem");
    expect(classes).toBe("");

    const lg = extractArbitrary("px-2.5 py-2.5");
    expect(lg.style.paddingLeft).toBe("0.625rem"); // 10px
    expect(lg.style.paddingTop).toBe("0.625rem"); // 10px — was dropped before
  });

  it("resolves gap / rounded / text scale classes", () => {
    expect(extractArbitrary("gap-0.5").style.gap).toBe("0.125rem");
    expect(extractArbitrary("rounded-sm").style.borderRadius).toBe("0.25rem");
    expect(extractArbitrary("text-lg").style.fontSize).toBe("1.125rem");
  });

  // Regression: font-family and font-weight share the `font-` prefix
  // (recipe-engine emits both). An arbitrary `font-[Inter]` must land on
  // fontFamily, not fontWeight (which silently ignored the invalid value).
  it("routes arbitrary font-family to fontFamily, weight to fontWeight", () => {
    expect(extractArbitrary("font-[Inter]").style.fontFamily).toBe("Inter");
    // Tailwind v4 reads `_` as a space inside [...].
    expect(extractArbitrary("font-[Google_Sans_Flex]").style.fontFamily).toBe(
      "Google Sans Flex",
    );
    const weight = extractArbitrary("font-[600]");
    expect(weight.style.fontWeight).toBe("600");
    expect(weight.style.fontFamily).toBeUndefined();
  });

  // Regression: font-weight scale classes recur the JIT-class bug — six of
  // the nine weights never appear statically, so the JIT skips them. Resolve
  // them to inline fontWeight instead of leaking the class to the JIT.
  it("resolves font-weight scale classes to inline fontWeight", () => {
    expect(extractArbitrary("font-thin").style.fontWeight).toBe("100");
    expect(extractArbitrary("font-light").style.fontWeight).toBe("300");
    expect(extractArbitrary("font-bold").style.fontWeight).toBe("700");
    expect(extractArbitrary("font-black").style.fontWeight).toBe("900");
    expect(extractArbitrary("font-light").classes).toBe("");
  });

  it("leaves genuinely static utility classes as class names", () => {
    const { classes, style } = extractArbitrary(
      "inline-flex items-center transition-colors shrink-0",
    );
    expect(classes).toBe("inline-flex items-center transition-colors shrink-0");
    expect(Object.keys(style)).toHaveLength(0);
  });

  it("keeps state-prefixed classes as class names", () => {
    const { classes } = extractArbitrary("hover:bg-[var(--x)] py-[8px]");
    expect(classes).toBe("hover:bg-[var(--x)]");
  });

  it("disambiguates text-[..] color vs font-size", () => {
    expect(extractArbitrary("text-[#fff]").style.color).toBe("#fff");
    expect(extractArbitrary("text-[14px]").style.fontSize).toBe("14px");
  });

  it("compensates border-color with width/style so it paints", () => {
    const { style } = extractArbitrary("border-[var(--c)]");
    expect(style.borderColor).toBe("var(--c)");
    expect(style.borderWidth).toBe("1px");
    expect(style.borderStyle).toBe("solid");
  });
});

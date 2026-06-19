import { describe, it, expect } from "vitest";
import { extractArbitrary } from "./extract-arbitrary.js";

describe("extractArbitrary", () => {
  // Regression: the recipe engine emits a single padding token as the all-sides
  // shorthand `p-[..]`. ARBITRARY_TO_CSS knew px/py/pl/pr/pt/pb but not `p`, so
  // card/modal/dropdown/switch/checkbox/radio previews rendered with no padding.
  it("translates arbitrary all-sides padding (p-[..]) into inline padding", () => {
    const { classes, style } = extractArbitrary("p-[24px]");
    expect(style.padding).toBe("24px");
    expect(classes).toBe("");
  });

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

  // D2e: a ring is one boxShadow carrying both width and colour, so the preview
  // shows the token's real ring width per state (resting 1px vs focus 2px),
  // not a fixed 2px and not a competing CSS outline.
  it("composes ring width + colour into a single boxShadow", () => {
    const both = extractArbitrary("ring-[1px] ring-[#4F63D2]");
    expect(both.style.boxShadow).toBe("0 0 0 1px #4F63D2");
    expect(both.style.outlineWidth).toBeUndefined();

    const widthOnly = extractArbitrary("ring-[1px]");
    expect(widthOnly.style.boxShadow).toBe("0 0 0 1px currentColor");

    // colour only → width defaults to Tailwind v4's 1px (matches the real ring).
    const colorOnly = extractArbitrary("ring-[#4F63D2]");
    expect(colorOnly.style.boxShadow).toBe("0 0 0 1px #4F63D2");

    // order-independent: colour before width composes the same single ring.
    const reversed = extractArbitrary("ring-[#4F63D2] ring-[1px]");
    expect(reversed.style.boxShadow).toBe("0 0 0 1px #4F63D2");
  });

  it("treats ring-[var(--c)] as a color (boxShadow), not a width", () => {
    const { style } = extractArbitrary("ring-[var(--brand)]");
    expect(style.boxShadow).toBe("0 0 0 1px var(--brand)");
    expect(style.outlineWidth).toBeUndefined();
  });

  // D2c: border-[1px] is a width, border-[#hex]/border-[var(--c)] is a color.
  it("routes border-[length] to borderWidth, border-[color] to borderColor", () => {
    const width = extractArbitrary("border-[2px]");
    expect(width.style.borderWidth).toBe("2px");
    expect(width.style.borderColor).toBeUndefined();

    const color = extractArbitrary("border-[#fff]");
    expect(color.style.borderColor).toBe("#fff");
    // existing preflight compensation still applies for color-only borders:
    expect(color.style.borderWidth).toBe("1px");
  });
});

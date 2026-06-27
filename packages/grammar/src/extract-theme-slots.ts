import ts from "typescript";

/**
 * Extract the top-level `slots` object keys from a Nuxt UI theme source file.
 * Handles both `export default { slots: {...} }` and the more common
 * `export default (options) => ({ slots: {...} })`. We never evaluate the theme
 * (the option-function + Tailwind strings are irrelevant) — we read the static
 * keys of the FIRST property literally named `slots` whose initializer is an
 * object literal. Returns [] when there is no such block (slotless components).
 *
 * Node-only (imports `typescript`). Used solely by scripts/gen-nuxt-vocab.ts —
 * it is NOT re-exported from the grammar index, so it never enters the runtime
 * browser bundle.
 */
export function extractSlotKeys(source: string): string[] {
  const sf = ts.createSourceFile("theme.ts", source, ts.ScriptTarget.Latest, true);
  let slots: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (slots) return;
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "slots" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      slots = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!slots) return [];

  const keys: string[] = [];
  for (const prop of slots.properties) {
    const name =
      (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && prop.name;
    if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) keys.push(name.text);
  }
  return keys;
}

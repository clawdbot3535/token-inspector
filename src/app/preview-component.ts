// Maps a token-tree group label to the live-preview component it should focus.
// Most groups equal their component name (button, card). List components emit
// their tokens under a part prefix (accordion-item-*, nav-item-*), so the tree
// groups them as `accordion-item` / `nav-item` while the recipe engine + preview
// key them as `accordion` / `nav`. Reconcile by stripping a trailing `-item`
// when the base is preview-supported. Overlay / layout / typography groups do
// not end in `-item`, so they are never touched.

/** The preview component a tree group maps to (or the label unchanged). */
export function previewComponentForGroup(label: string, previewSet: ReadonlySet<string>): string {
  if (previewSet.has(label)) return label;
  const stripped = label.replace(/-item$/, "");
  if (stripped !== label && previewSet.has(stripped)) return stripped;
  return label;
}

/** Whether a tree group has a rendered live preview (after normalization). */
export function groupHasPreview(label: string, previewSet: ReadonlySet<string>): boolean {
  return previewSet.has(previewComponentForGroup(label, previewSet));
}

// Shared copy-to-clipboard with reactive success feedback.
//
// Each copy stamps the calling site's `key` (or the copied text when no
// key is provided) into a ref. UIs read `wasJustCopied(key)` to switch a
// button's label/icon into a "Copied!" state for ~1.5s.
//
// Falls back to a no-op when the Clipboard API is missing (older
// browsers, insecure contexts) — calls succeed but feedback is silent.

import { ref, readonly } from "vue";

const COPIED_FEEDBACK_MS = 1500;

export interface UseCopyToClipboard {
  /**
   * Copy `text` into the system clipboard and stamp `key` as the most
   * recent copy. Returns true when the write succeeded.
   */
  copy: (text: string, key?: string) => Promise<boolean>;
  /** Reactive helper: true while `key` was the most recent successful copy. */
  wasJustCopied: (key: string) => boolean;
  /** The key currently in the "just copied" state, or null. */
  copiedKey: Readonly<ReturnType<typeof ref<string | null>>>;
}

export function useCopyToClipboard(): UseCopyToClipboard {
  const copiedKey = ref<string | null>(null);
  let resetHandle: ReturnType<typeof setTimeout> | null = null;

  async function copy(text: string, key?: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    copiedKey.value = key ?? text;
    if (resetHandle !== null) clearTimeout(resetHandle);
    resetHandle = setTimeout(() => {
      copiedKey.value = null;
      resetHandle = null;
    }, COPIED_FEEDBACK_MS);
    return true;
  }

  function wasJustCopied(key: string): boolean {
    return copiedKey.value === key;
  }

  return { copy, wasJustCopied, copiedKey: readonly(copiedKey) };
}

// Drag-resize state for a single pane boundary.
//
// Usage:
//   const { width, onPointerDown } = useResizablePane({
//     storageKey: "inspector.leftPaneWidth",
//     initialWidth: 320,
//     minWidth: 240,
//     maxWidth: 640,
//   });

import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";

export interface ResizableOptions {
  storageKey: string;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  /** "grow-right" (default): right-edge handle on a left pane; rightward drag widens.
   *  "grow-left": left-edge handle on a right pane; leftward drag widens. */
  direction?: "grow-right" | "grow-left";
}

export interface ResizableHandle {
  width: Ref<number>;
  onPointerDown: (event: PointerEvent) => void;
}

export function useResizablePane(opts: ResizableOptions): ResizableHandle {
  const width = ref(opts.initialWidth);
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function load(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(opts.storageKey);
    if (raw === null) return;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    width.value = clamp(parsed, opts.minWidth, opts.maxWidth);
  }

  function persist(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(opts.storageKey, String(width.value));
  }

  function onPointerDown(event: PointerEvent): void {
    dragging = true;
    startX = event.clientX;
    startWidth = width.value;
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    const rawDelta = event.clientX - startX;
    const delta =
      (opts.direction ?? "grow-right") === "grow-right" ? rawDelta : -rawDelta;
    width.value = clamp(startWidth + delta, opts.minWidth, opts.maxWidth);
  }

  function onPointerUp(): void {
    if (!dragging) return;
    dragging = false;
    persist();
  }

  onMounted(() => {
    load();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  });

  return { width, onPointerDown };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

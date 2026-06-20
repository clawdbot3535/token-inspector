/** The execution substrate that runs the generated kit and renders it.
 *  Phase 1 = StackBlitz SDK (runs the build on stackblitz.com inside its iframe).
 *  Phase 2 (parked) = self-hosted @webcontainer/api implementing the SAME shape,
 *  so swapping substrates needs no UI change. */
export interface LiveBuildSubstrate {
  /** Embed the running project into `el` (replacing its contents with an iframe). */
  embed(el: HTMLElement, files: Record<string, string>, opts: { title: string }): Promise<void>;
  /** Open the project full-screen in the substrate's own UI (escape hatch). */
  openExternal(files: Record<string, string>, opts: { title: string }): void;
}

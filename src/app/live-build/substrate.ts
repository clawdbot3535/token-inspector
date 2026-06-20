/** Encapsulates opening the generated kit as a live, runnable build, so the
 *  panel stays free of the StackBlitz SDK and tests can inject a fake.
 *  `openExternal` opens the kit full-screen on the substrate's own (already
 *  cross-origin-isolated) domain in a new tab — no host headers required. */
export interface LiveBuildSubstrate {
  openExternal(files: Record<string, string>, opts: { title: string }): void;
}

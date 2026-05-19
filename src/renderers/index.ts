export { cssRenderer } from "./css.js";
export { LineBuilder } from "./line-builder.js";

import type { TextRenderer } from "../token-graph.js";
import { cssRenderer } from "./css.js";

/** Default renderer registry consumed by the Inspector tab bar. */
export const defaultRenderers: readonly TextRenderer[] = [cssRenderer];

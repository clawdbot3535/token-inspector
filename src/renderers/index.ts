export { cssRenderer } from "./css.js";
export { tsRenderer } from "./ts.js";
export { appConfigRenderer } from "./app-config.js";
export { LineBuilder } from "./line-builder.js";
export { tokensCssRenderer } from "./tokens-css.js";

import type { TextRenderer } from "../token-graph.js";
import { cssRenderer } from "./css.js";
import { tsRenderer } from "./ts.js";
import { appConfigRenderer } from "./app-config.js";
import { tokensCssRenderer } from "./tokens-css.js";

/** Default renderer registry consumed by the Inspector tab bar. */
export const defaultRenderers: readonly TextRenderer[] = [
  cssRenderer,
  appConfigRenderer,
  tsRenderer,
  tokensCssRenderer,
];

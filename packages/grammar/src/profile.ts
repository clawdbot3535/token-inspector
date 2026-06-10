// Profile types + loader.
// A Profile is a hand-authored declaration of which tokens a component set emits.
// scaffold() consumes a Profile to produce a DTCG tree with 0 unmapped tokens.

/** Specification for a single utility type emitted by a component. */
export interface UtilitySpec {
  /** Utility name — must match a HEURISTIC_RULES matcher (e.g. "bg", "border", "radius"). */
  utility: string;
  /** When true, also emit per-state variants using the component's `states` list. */
  states?: boolean;
  /** When true, also emit per-size variants using the component's `sizes` list. */
  sized?: boolean;
  /** When true, also emit per-variant IDs using the component's `variants` list. */
  variants?: boolean;
  /**
   * Optional override: restrict this utility to a specific subset of parts.
   * When absent, the component's top-level `parts` list (or the empty/base part) is used.
   */
  parts?: string[];
}

/** Declaration for a single component's token surface. */
export interface ComponentProfile {
  /**
   * Figma-side sub-element part names (Figma-part-segment shaped, lowercase, dash-joined).
   * An empty array means all tokens sit at the base level (no sub-element segment).
   * Each part value should be a valid Nuxt slot name for sub-element routing to work.
   */
  parts: string[];
  /** Interaction / boolean state suffixes to apply (e.g. "hover", "focus", "checked"). */
  states: string[];
  /** Size suffixes (e.g. "xs", "sm", "md", "lg", "xl"). */
  sizes: string[];
  /**
   * Visual variant keys (e.g. Nuxt UI button-style variants: "solid", "outline", "ghost").
   * Used as the 2nd ID segment when spec.variants is true.
   */
  variants: string[];
  /** Utilities this component emits. */
  utilities: UtilitySpec[];
}

/** A named profile grouping multiple component declarations. */
export interface Profile {
  name: string;
  components: Record<string, ComponentProfile>;
}

// ── Loader ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`Profile validation: ${path} must be an array`);
  return v;
}

function parseUtilitySpec(raw: unknown, path: string): UtilitySpec {
  if (!isRecord(raw)) throw new Error(`Profile validation: ${path} must be an object`);
  if (typeof raw["utility"] !== "string") throw new Error(`Profile validation: ${path}.utility must be a string`);
  const spec: UtilitySpec = { utility: raw["utility"] };
  if (raw["states"] === true) spec.states = true;
  if (raw["sized"] === true) spec.sized = true;
  if (raw["variants"] === true) spec.variants = true;
  if (Array.isArray(raw["parts"])) spec.parts = raw["parts"] as string[];
  return spec;
}

function parseComponentProfile(raw: unknown, name: string): ComponentProfile {
  if (!isRecord(raw)) throw new Error(`Profile validation: component "${name}" must be an object`);
  const parts = assertArray(raw["parts"] ?? [], `${name}.parts`).map(String);
  const states = assertArray(raw["states"] ?? [], `${name}.states`).map(String);
  const sizes = assertArray(raw["sizes"] ?? [], `${name}.sizes`).map(String);
  const variants = assertArray(raw["variants"] ?? [], `${name}.variants`).map(String);
  const utilitiesRaw = assertArray(raw["utilities"] ?? [], `${name}.utilities`);
  const utilities = utilitiesRaw.map((u, i) => parseUtilitySpec(u, `${name}.utilities[${i}]`));
  return { parts, states, sizes, variants, utilities };
}

/**
 * Load and lightly validate a Profile from a parsed JSON value.
 * Throws a descriptive error if validation fails.
 */
export function loadProfile(json: unknown): Profile {
  if (!isRecord(json)) throw new Error("Profile validation: root must be an object");
  if (typeof json["name"] !== "string") throw new Error('Profile validation: root.name must be a string');
  if (!isRecord(json["components"])) throw new Error('Profile validation: root.components must be an object');
  const components: Record<string, ComponentProfile> = {};
  for (const [compName, raw] of Object.entries(json["components"])) {
    components[compName] = parseComponentProfile(raw, compName);
  }
  return { name: json["name"] as string, components };
}

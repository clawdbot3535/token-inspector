// Registry for the generic Real-render component: maps a standard component name to the real
// Nuxt UI tag plus the minimal props (and optional default-slot text) needed to paint a resting
// state. Custom components (chip, sidebar) are intentionally absent — they have no faithful U<X>.

export interface RealSlottedEntry {
  /** Globally-registered Nuxt UI component name, e.g. "UCard". */
  tag: string;
  /** Minimal props to render the component in a resting state. */
  props: Record<string, unknown>;
  /** Optional default-slot text for components that need children. */
  slot?: string;
}

export const REAL_SLOTTED_REGISTRY: Readonly<Record<string, RealSlottedEntry>> = {
  card: { tag: "UCard", props: {}, slot: "Card body" },
  kbd: { tag: "UKbd", props: { value: "K" } },
  badge: { tag: "UBadge", props: { label: "Badge" } },
  progress: { tag: "UProgress", props: { modelValue: 50 } },
  switch: { tag: "USwitch", props: { modelValue: true } },
  checkbox: { tag: "UCheckbox", props: { modelValue: true, label: "Checkbox" } },
  radio: { tag: "URadioGroup", props: { modelValue: "a", items: [{ label: "Option", value: "a" }] } },
  input: { tag: "UInput", props: { modelValue: "Text" } },
  textarea: { tag: "UTextarea", props: { modelValue: "Text" } },
};

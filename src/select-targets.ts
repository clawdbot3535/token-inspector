// Parse the CLI's optional `--targets=<csv>` selection. Pure — the caller passes
// argv, so this stays browser-safe and unit-testable. Returns null when no
// selection is given (emit every target); otherwise the set of requested ids,
// validated against what's available with a clear, boundary-style error.

const FLAG = "--targets=";

export function parseTargetSelection(
  argv: readonly string[],
  available: readonly string[],
): ReadonlySet<string> | null {
  const arg = argv.find((a) => a.startsWith(FLAG));
  if (!arg) return null;

  const requested = arg
    .slice(FLAG.length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const unknown = requested.filter((r) => !available.includes(r));
  if (unknown.length > 0) {
    throw new Error(`Unknown target(s): ${unknown.join(", ")}. Available: ${available.join(", ")}.`);
  }
  return new Set(requested);
}

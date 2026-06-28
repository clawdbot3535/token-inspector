// Parse the CLI's optional `--out=<dir>` flag. Pure — the caller passes argv and
// resolves the returned path, so this stays browser-safe and unit-testable. Returns
// null when absent (use the default output dir); throws on an empty value.

const FLAG = "--out=";

export function parseOutDir(argv: readonly string[]): string | null {
  const arg = argv.find((a) => a.startsWith(FLAG));
  if (!arg) return null;

  const path = arg.slice(FLAG.length).trim();
  if (!path) {
    throw new Error(`--out requires a directory path (e.g. --out=./design).`);
  }
  return path;
}

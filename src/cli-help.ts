// CLI `--help` text + detection. Pure — the caller passes argv and the available
// target ids, so this stays browser-safe and unit-testable.

export function wantsHelp(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

export function buildHelpText(targetIds: readonly string[]): string {
  return `build:tokens — generate design-system output from your Figma tokens.

Reads components/*.tokens.json and writes one folder per target (plus REPORT.md +
USAGE.md). Run \`npm run build:tokens\` with no options to emit everything to output/.

Usage:
  npm run build:tokens [-- <options>]

Options:
  --targets=<csv>   Emit only these targets (default: all).
                    Available: ${targetIds.join(", ")}.
  --out=<dir>       Write output to <dir> (default: output/).
  --help, -h        Show this help.

Examples:
  npm run build:tokens
  npm run build:tokens -- --targets=shadcn
  npm run build:tokens -- --targets=shadcn,generic --out=./my-app/design
`;
}

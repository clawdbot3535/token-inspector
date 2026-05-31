import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));

describe("tailwind-defaults.generated.ts", () => {
  // The lookup tables are generated from a specific Tailwind version and
  // committed. If tailwindcss is bumped without re-running
  // `npm run extract-tailwind-defaults`, every snap match AND every inverted
  // preview value silently drifts while the unit matchers still pass. This
  // pins the generated artifact to the installed version so the drift fails loud.
  it("is stamped with the installed Tailwind version (regenerate after a bump)", () => {
    const generated = readFileSync(
      resolve(here, "tailwind-defaults.generated.ts"),
      "utf8",
    );
    const stamped = generated.match(/Tailwind version:\s*(\S+)/)?.[1];
    expect(stamped, "generated file is missing its `Tailwind version:` stamp").toBeDefined();

    const require = createRequire(import.meta.url);
    const installed = (require("tailwindcss/package.json") as { version: string })
      .version;

    expect(
      stamped,
      `generated table is stamped ${stamped} but tailwindcss ${installed} is installed — run \`npm run extract-tailwind-defaults\``,
    ).toBe(installed);
  });
});

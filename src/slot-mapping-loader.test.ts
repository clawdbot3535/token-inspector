import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadSlotMappingFile } from "./slot-mapping-loader.js";

describe("loadSlotMappingFile", () => {
  it("returns empty when the file does not exist", () => {
    const result = loadSlotMappingFile(
      resolve(tmpdir(), "nonexistent-slot-mapping.json"),
    );
    expect(result.overrides).toBeUndefined();
    expect(result.defaultSizeByComponent).toBeUndefined();
  });

  it("parses components.<name>.defaultSize into defaultSizeByComponent", () => {
    const path = resolve(tmpdir(), `slot-mapping-test-${Date.now()}-a.json`);
    writeFileSync(
      path,
      JSON.stringify({
        components: { button: { defaultSize: "lg" } },
      }),
    );
    try {
      const result = loadSlotMappingFile(path);
      expect(result.defaultSizeByComponent).toEqual({ button: "lg" });
      expect(result.overrides).toBeUndefined();
    } finally {
      unlinkSync(path);
    }
  });

  it("parses overrides and passes them through as-is", () => {
    const path = resolve(tmpdir(), `slot-mapping-test-${Date.now()}-b.json`);
    writeFileSync(
      path,
      JSON.stringify({
        overrides: { "button-shadow": null },
      }),
    );
    try {
      const result = loadSlotMappingFile(path);
      expect(result.overrides).toEqual({ "button-shadow": null });
      expect(result.defaultSizeByComponent).toBeUndefined();
    } finally {
      unlinkSync(path);
    }
  });

  it("parses both components and overrides together", () => {
    const path = resolve(tmpdir(), `slot-mapping-test-${Date.now()}-c.json`);
    writeFileSync(
      path,
      JSON.stringify({
        components: { button: { defaultSize: "md" } },
        overrides: {
          "button-custom": {
            slot: "base",
            utilityType: "rounded",
            variantAxis: null,
            variantKey: null,
          },
        },
      }),
    );
    try {
      const result = loadSlotMappingFile(path);
      expect(result.defaultSizeByComponent).toEqual({ button: "md" });
      expect(result.overrides).toBeDefined();
      expect(result.overrides?.["button-custom"]).toMatchObject({
        slot: "base",
        utilityType: "rounded",
      });
    } finally {
      unlinkSync(path);
    }
  });

  it("returns undefined defaultSizeByComponent when components map is empty", () => {
    const path = resolve(tmpdir(), `slot-mapping-test-${Date.now()}-d.json`);
    writeFileSync(path, JSON.stringify({ overrides: {} }));
    try {
      const result = loadSlotMappingFile(path);
      expect(result.defaultSizeByComponent).toBeUndefined();
    } finally {
      unlinkSync(path);
    }
  });
});

import { describe, it, expect } from "vitest";
import { buildZip } from "./zip.js";

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function readU32LE(b: Uint8Array, offset: number): number {
  return (
    ((b[offset] ?? 0) |
      ((b[offset + 1] ?? 0) << 8) |
      ((b[offset + 2] ?? 0) << 16) |
      ((b[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

describe("buildZip", () => {
  it("starts with the local file header signature 0x04034b50", async () => {
    const blob = buildZip([{ name: "a.txt", data: "hello" }]);
    const bytes = await blobToBytes(blob);
    expect(readU32LE(bytes, 0)).toBe(0x04034b50);
  });

  it("ends with the EOCD signature 0x06054b50", async () => {
    const blob = buildZip([{ name: "a.txt", data: "hello" }]);
    const bytes = await blobToBytes(blob);
    expect(readU32LE(bytes, bytes.length - 22)).toBe(0x06054b50);
  });

  it("encodes filename and data correctly", async () => {
    const blob = buildZip([{ name: "name.txt", data: "DATA" }]);
    const bytes = await blobToBytes(blob);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("name.txt");
    expect(text).toContain("DATA");
  });

  it("supports multiple entries", async () => {
    const blob = buildZip([
      { name: "a.txt", data: "AAA" },
      { name: "b.txt", data: "BBB" },
    ]);
    const bytes = await blobToBytes(blob);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("a.txt");
    expect(text).toContain("b.txt");
    expect(text).toContain("AAA");
    expect(text).toContain("BBB");
  });

  it("records the entry count in the EOCD", async () => {
    const blob = buildZip([
      { name: "a.txt", data: "AAA" },
      { name: "b.txt", data: "BBB" },
      { name: "c.txt", data: "CCC" },
    ]);
    const bytes = await blobToBytes(blob);
    const eocd = bytes.length - 22;
    const total = (bytes[eocd + 8] ?? 0) | ((bytes[eocd + 9] ?? 0) << 8);
    expect(total).toBe(3);
  });
});

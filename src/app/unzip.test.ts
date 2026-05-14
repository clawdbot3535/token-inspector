import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildZip } from "./zip.js";
import { unzip, unzipToFiles } from "./unzip.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new CompressionStream("deflate-raw"),
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("unzip", () => {
  it("round-trips a store-mode zip built by buildZip", async () => {
    const blob = buildZip([
      { name: "color.tokens.json", data: '{"a":1}' },
      { name: "dark.tokens.json", data: '{"b":2}' },
    ]);
    const entries = await unzip(await blob.arrayBuffer());
    expect(entries).toHaveLength(2);
    expect(entries[0]!.name).toBe("color.tokens.json");
    expect(decodeUtf8(entries[0]!.bytes)).toBe('{"a":1}');
    expect(entries[1]!.name).toBe("dark.tokens.json");
    expect(decodeUtf8(entries[1]!.bytes)).toBe('{"b":2}');
  });

  it("handles a deflate-compressed entry", async () => {
    const payload = "x".repeat(2048);
    const payloadBytes = new TextEncoder().encode(payload);
    const compressed = await deflateRaw(payloadBytes);
    expect(compressed.length).toBeLessThan(payloadBytes.length);

    // Craft a minimal zip by hand around the precompressed payload.
    const nameBytes = new TextEncoder().encode("blob.txt");
    // CRC32 of payload
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < payloadBytes.length; i += 1) {
      crc = (crc >>> 8) ^ (crcTable[(crc ^ payloadBytes[i]!) & 0xff] ?? 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true); // method = deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, payloadBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true); // method = deflate
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, payloadBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, 0, true);
    central.set(nameBytes, 46);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length, true);

    const full = new Uint8Array(local.length + central.length + eocd.length);
    full.set(local, 0);
    full.set(central, local.length);
    full.set(eocd, local.length + central.length);

    const entries = await unzip(full);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("blob.txt");
    expect(decodeUtf8(entries[0]!.bytes)).toBe(payload);
  });

  it("skips directory entries", async () => {
    const blob = buildZip([
      { name: "dir/", data: "" },
      { name: "file.txt", data: "hi" },
    ]);
    const entries = await unzip(await blob.arrayBuffer());
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("file.txt");
  });

  it("rejects non-zip input", async () => {
    const bytes = new TextEncoder().encode("not a zip file at all");
    await expect(unzip(bytes)).rejects.toThrow(/EOCD/);
  });

  it("reads a real Figma export zip from the repo root", async () => {
    const buf = readFileSync(resolve(repoRoot, "primitives_color.zip"));
    const entries = await unzip(buf);
    expect(entries.length).toBeGreaterThan(0);
    const colorFile = entries.find((e) => e.name.endsWith("color.tokens.json"));
    expect(colorFile).toBeDefined();
    const json = JSON.parse(decodeUtf8(colorFile!.bytes));
    expect(json).toBeTypeOf("object");
  });

  it("unzipToFiles strips nested paths to basenames", async () => {
    const blob = buildZip([
      { name: "primitives/color.tokens.json", data: '{"x":1}' },
    ]);
    const zipFile = new File([blob], "primitives_color.zip");
    const files = await unzipToFiles(zipFile);
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("color.tokens.json");
    expect(await files[0]!.text()).toBe('{"x":1}');
  });
});

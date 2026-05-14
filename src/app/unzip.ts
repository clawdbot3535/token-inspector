// Minimal ZIP reader. Parses EOCD + central directory, extracts entries.
// Supports store (method 0) and deflate (method 8) via the platform's
// DecompressionStream — no runtime dependency. Spec ref: PKZIP APPNOTE.TXT.

export interface UnzipEntry {
  name: string;
  bytes: Uint8Array;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function findEocd(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.length - (22 + 0xffff));
  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + i, 4);
    if (view.getUint32(0, true) === SIG_EOCD) return i;
  }
  throw new Error("Not a zip file (EOCD signature not found)");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available in this environment");
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function unzip(input: ArrayBuffer | Uint8Array): Promise<UnzipEntry[]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const eocd = findEocd(bytes);
  const eocdView = new DataView(bytes.buffer, bytes.byteOffset + eocd, 22);
  const totalEntries = eocdView.getUint16(10, true);
  const centralSize = eocdView.getUint32(12, true);
  const centralOffset = eocdView.getUint32(16, true);

  if (centralOffset + centralSize > bytes.length) {
    throw new Error("Corrupt zip (central directory out of range)");
  }

  const entries: UnzipEntry[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor);
    if (view.getUint32(0, true) !== SIG_CENTRAL) {
      throw new Error(`Corrupt zip (bad central header at entry ${i})`);
    }
    const method = view.getUint16(10, true);
    const compressedSize = view.getUint32(20, true);
    const uncompressedSize = view.getUint32(24, true);
    const nameLen = view.getUint16(28, true);
    const extraLen = view.getUint16(30, true);
    const commentLen = view.getUint16(32, true);
    const localOffset = view.getUint32(42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLen),
    );
    cursor += 46 + nameLen + extraLen + commentLen;

    // Directory entry (zero-length, name ends in "/"). Skip.
    if (name.endsWith("/")) continue;

    const localView = new DataView(bytes.buffer, bytes.byteOffset + localOffset);
    if (localView.getUint32(0, true) !== SIG_LOCAL) {
      throw new Error(`Corrupt zip (bad local header for ${name})`);
    }
    const localNameLen = localView.getUint16(26, true);
    const localExtraLen = localView.getUint16(28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error(`Corrupt zip (entry data out of range: ${name})`);
    }
    const raw = bytes.subarray(dataStart, dataEnd);

    let data: Uint8Array;
    if (method === 0) {
      data = new Uint8Array(raw);
    } else if (method === 8) {
      data = await inflateRaw(raw);
    } else {
      throw new Error(`Unsupported compression method ${method} for ${name}`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(
        `Size mismatch for ${name}: expected ${uncompressedSize}, got ${data.length}`,
      );
    }
    entries.push({ name, bytes: data });
  }

  return entries;
}

export async function unzipToFiles(zipFile: File): Promise<File[]> {
  const buffer = await zipFile.arrayBuffer();
  const entries = await unzip(buffer);
  return entries.map((entry) => {
    const base = entry.name.split("/").pop() ?? entry.name;
    return new File([entry.bytes as BlobPart], base, {
      type: base.endsWith(".json") ? "application/json" : "application/octet-stream",
    });
  });
}

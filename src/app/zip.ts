// Minimal ZIP writer (store-mode, no compression). Avoids a runtime
// dependency for a feature that ships ~25 KB of plain text.
// Spec ref: PKZIP APPNOTE.TXT — local file header + central directory + EOCD.

export interface ZipEntry {
  name: string;
  data: string;
}

const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ bytes[i]!) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() / 2) & 0x1f);
  const d =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: d };
}

interface Built {
  local: Uint8Array;
  central: Uint8Array;
  size: number;
}

function buildEntry(entry: ZipEntry, offset: number, when: Date): Built {
  const nameBytes = new TextEncoder().encode(entry.name);
  const dataBytes = new TextEncoder().encode(entry.data);
  const crc = crc32(dataBytes);
  const { time, date } = dosTime(when);
  const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true); // version
  localView.setUint16(6, 0, true); // flags
  localView.setUint16(8, 0, true); // method = store
  localView.setUint16(10, time, true);
  localView.setUint16(12, date, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, dataBytes.length, true);
  localView.setUint32(22, dataBytes.length, true);
  localView.setUint16(26, nameBytes.length, true);
  localView.setUint16(28, 0, true);
  local.set(nameBytes, 30);
  local.set(dataBytes, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint16(12, time, true);
  centralView.setUint16(14, date, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, dataBytes.length, true);
  centralView.setUint32(24, dataBytes.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  centralView.setUint32(42, offset, true);
  central.set(nameBytes, 46);

  return { local, central, size: local.length };
}

export function buildZip(entries: readonly ZipEntry[]): Blob {
  const when = new Date();
  const built: Built[] = [];
  let offset = 0;
  for (const e of entries) {
    const b = buildEntry(e, offset, when);
    built.push(b);
    offset += b.size;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const b of built) centralSize += b.central.length;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, built.length, true);
  eocdView.setUint16(10, built.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);
  return new Blob(
    [
      ...built.map((b) => b.local),
      ...built.map((b) => b.central),
      eocd,
    ],
    { type: "application/zip" },
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

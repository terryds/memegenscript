/** Font loading from static assets and parsing with opentype.js. */
import * as opentype from "opentype.js";
import { Font } from "../models/font";
import { DEFAULT_FONT } from "../settings";

export interface LoadedFont {
  id: string;
  font: opentype.Font;
  unitsPerEm: number;
  /** hhea ascender/descender in font units (descender negative) */
  ascender: number;
  descender: number;
}

const cache = new Map<string, Promise<LoadedFont>>();

/** Extract the first face of a TrueType Collection as a standalone font file. */
function extractFromCollection(buffer: ArrayBuffer, index = 0): ArrayBuffer {
  const view = new DataView(buffer);
  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (tag !== "ttcf") return buffer;
  const numFonts = view.getUint32(8);
  if (index >= numFonts) throw new Error(`Collection has only ${numFonts} font(s)`);
  const fontOffset = view.getUint32(12 + index * 4);

  const numTables = view.getUint16(fontOffset + 4);
  const headerSize = 12 + numTables * 16;
  let dataSize = 0;
  const tables: Array<{ record: Uint8Array; offset: number; length: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const recordOffset = fontOffset + 12 + i * 16;
    const offset = view.getUint32(recordOffset + 8);
    const length = view.getUint32(recordOffset + 12);
    tables.push({ record: new Uint8Array(buffer, recordOffset, 16), offset, length });
    dataSize += (length + 3) & ~3;
  }

  const out = new Uint8Array(headerSize + dataSize);
  out.set(new Uint8Array(buffer, fontOffset, 12), 0);
  const outView = new DataView(out.buffer);
  let dataOffset = headerSize;
  tables.forEach((table, i) => {
    const recordOffset = 12 + i * 16;
    out.set(table.record, recordOffset);
    outView.setUint32(recordOffset + 8, dataOffset);
    out.set(new Uint8Array(buffer, table.offset, table.length), dataOffset);
    dataOffset += (table.length + 3) & ~3;
  });
  return out.buffer;
}

async function fetchAsset(assets: Fetcher, path: string): Promise<ArrayBuffer> {
  const response = await assets.fetch(new Request("https://assets.local" + path));
  if (!response.ok) throw new Error(`Missing asset: ${path} (${response.status})`);
  return response.arrayBuffer();
}

export function loadFont(name: string, assets: Fetcher): Promise<LoadedFont> {
  const font = Font.get(name || DEFAULT_FONT);
  let pending = cache.get(font.id);
  if (!pending) {
    pending = (async () => {
      let buffer = await fetchAsset(assets, font.path);
      buffer = extractFromCollection(buffer);
      const parsed = opentype.parse(buffer);
      return {
        id: font.id,
        font: parsed,
        unitsPerEm: parsed.unitsPerEm,
        ascender: parsed.ascender,
        descender: parsed.descender,
      };
    })();
    cache.set(font.id, pending);
    pending.catch(() => cache.delete(font.id));
  }
  return pending;
}

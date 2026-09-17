/**
 * Animated WebP muxing: each frame is encoded as a normal WebP file, then its
 * bitstream chunks are wrapped in ANMF chunks inside a VP8X container.
 */

interface Chunk {
  fourcc: string;
  data: Uint8Array;
}

function readChunks(webp: Uint8Array): Chunk[] {
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  const chunks: Chunk[] = [];
  let offset = 12; // RIFF size WEBP
  while (offset + 8 <= webp.length) {
    const fourcc = String.fromCharCode(webp[offset], webp[offset + 1], webp[offset + 2], webp[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    const data = webp.subarray(offset + 8, offset + 8 + size);
    chunks.push({ fourcc, data });
    offset += 8 + size + (size & 1);
  }
  return chunks;
}

function chunkBytes(fourcc: string, data: Uint8Array): Uint8Array {
  const padded = data.length + (data.length & 1);
  const out = new Uint8Array(8 + padded);
  out[0] = fourcc.charCodeAt(0);
  out[1] = fourcc.charCodeAt(1);
  out[2] = fourcc.charCodeAt(2);
  out[3] = fourcc.charCodeAt(3);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function uint24(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

export interface WebpFrame {
  /** A complete (single-image) WebP file */
  bytes: Uint8Array;
  /** Duration in milliseconds */
  duration: number;
}

export function muxAnimatedWebp(frames: WebpFrame[], width: number, height: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let hasAlpha = false;

  const anmfs: Uint8Array[] = [];
  for (const frame of frames) {
    const chunks = readChunks(frame.bytes);
    const payload: Uint8Array[] = [];
    let frameWidth = width;
    let frameHeight = height;
    for (const chunk of chunks) {
      if (chunk.fourcc === "ALPH") {
        hasAlpha = true;
        payload.push(chunkBytes("ALPH", chunk.data));
      } else if (chunk.fourcc === "VP8 " || chunk.fourcc === "VP8L") {
        if (chunk.fourcc === "VP8L" && chunk.data.length >= 5) {
          const bits = chunk.data[1] | (chunk.data[2] << 8) | (chunk.data[3] << 16) | (chunk.data[4] << 24);
          frameWidth = (bits & 0x3fff) + 1;
          frameHeight = ((bits >>> 14) & 0x3fff) + 1;
          if (((bits >>> 28) & 1) === 1) hasAlpha = true;
        } else if (chunk.fourcc === "VP8 " && chunk.data.length >= 10) {
          frameWidth = (chunk.data[6] | (chunk.data[7] << 8)) & 0x3fff;
          frameHeight = (chunk.data[8] | (chunk.data[9] << 8)) & 0x3fff;
        }
        payload.push(chunkBytes(chunk.fourcc, chunk.data));
      } else if (chunk.fourcc === "VP8X") {
        if (chunk.data[0] & 0x10) hasAlpha = true;
      }
    }
    const header = new Uint8Array([
      ...uint24(0), // X offset / 2
      ...uint24(0), // Y offset / 2
      ...uint24(frameWidth - 1),
      ...uint24(frameHeight - 1),
      ...uint24(Math.max(1, Math.round(frame.duration))),
      0x00, // reserved | blending (0 = alpha blend) | disposal (0 = keep)
    ]);
    const payloadLength = payload.reduce((n, p) => n + p.length, 0);
    const body = new Uint8Array(header.length + payloadLength);
    body.set(header, 0);
    let offset = header.length;
    for (const p of payload) {
      body.set(p, offset);
      offset += p.length;
    }
    anmfs.push(chunkBytes("ANMF", body));
  }

  const vp8x = new Uint8Array([
    0x02 | (hasAlpha ? 0x10 : 0), // animation (+ alpha) flags
    0, 0, 0, // reserved
    ...uint24(width - 1),
    ...uint24(height - 1),
  ]);
  parts.push(chunkBytes("VP8X", vp8x));

  const anim = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0]); // background BGRA, loop count 0 = infinite
  parts.push(chunkBytes("ANIM", anim));
  parts.push(...anmfs);

  const bodyLength = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(12 + bodyLength);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  new DataView(out.buffer).setUint32(4, 4 + bodyLength, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  let offset = 12;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

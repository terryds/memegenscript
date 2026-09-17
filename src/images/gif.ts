/** GIF decoding (gifuct-js) and encoding (gifenc). */
import { parseGIF, decompressFrame, type ParsedFrame } from "gifuct-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { DecodedImage } from "./codecs";
import { createRaster, type Raster } from "./raster";

type GifFrameRecord = Parameters<typeof decompressFrame>[0];

function isImageFrame(frame: unknown): frame is GifFrameRecord {
  return typeof frame === "object" && frame !== null && "image" in frame;
}

export function decodeGif(bytes: Uint8Array): DecodedImage {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const parsed = parseGIF(buffer);
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  const records = parsed.frames.filter(isImageFrame);
  if (!records.length) throw new Error("GIF has no frames");

  const delayOf = (frame: ParsedFrame) => (frame.delay && frame.delay > 0 ? frame.delay : 100);

  async function* frames() {
    let canvas = createRaster(width, height);
    let previous: Raster | null = null;
    let lastFrame: ParsedFrame | null = null;
    for (const record of records) {
      const frame = decompressFrame(record, parsed.gct, true);

      // Dispose of the previous frame per its disposal method
      if (lastFrame) {
        if (lastFrame.disposalType === 2) {
          const { left, top, width: w, height: h } = lastFrame.dims;
          for (let y = top; y < top + h && y < height; y++) {
            canvas.data.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + w)) * 4);
          }
        } else if (lastFrame.disposalType === 3 && previous) {
          canvas = previous;
        }
      }
      if (frame.disposalType === 3) {
        previous = { width, height, data: new Uint8ClampedArray(canvas.data) };
      }

      // Draw the patch (transparent pixels leave the canvas untouched)
      const { left, top, width: w, height: h } = frame.dims;
      const patch = frame.patch;
      for (let y = 0; y < h; y++) {
        const cy = top + y;
        if (cy < 0 || cy >= height) continue;
        for (let x = 0; x < w; x++) {
          const cx = left + x;
          if (cx < 0 || cx >= width) continue;
          const pi = (y * w + x) * 4;
          if (patch[pi + 3] === 0) continue;
          const ci = (cy * width + cx) * 4;
          canvas.data[ci] = patch[pi];
          canvas.data[ci + 1] = patch[pi + 1];
          canvas.data[ci + 2] = patch[pi + 2];
          canvas.data[ci + 3] = 255;
        }
      }
      lastFrame = frame;
      yield { raster: { width, height, data: new Uint8ClampedArray(canvas.data) }, delay: delayOf(frame) };
    }
  }

  const firstRecord = records[0];
  const firstDelay = delayOf(decompressFrame(firstRecord, parsed.gct, false) as ParsedFrame);

  return {
    format: "gif",
    width,
    height,
    frameCount: records.length,
    duration: firstDelay,
    frames,
    first: async () => {
      for await (const frame of frames()) return frame.raster;
      throw new Error("GIF has no frames");
    },
  };
}

/** Pixels used to build a palette: photos are subsampled to bound quantization cost. */
function paletteSample(image: Raster): Uint8ClampedArray {
  const budget = 120_000;
  const pixels = image.width * image.height;
  if (pixels <= budget) return image.data;
  const step = Math.ceil(Math.sqrt(pixels / budget));
  const cols = Math.ceil(image.width / step);
  const rows = Math.ceil(image.height / step);
  const out = new Uint8ClampedArray(cols * rows * 4);
  let o = 0;
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const i = (y * image.width + x) * 4;
      out[o++] = image.data[i];
      out[o++] = image.data[i + 1];
      out[o++] = image.data[i + 2];
      out[o++] = image.data[i + 3];
    }
  }
  return out;
}

/** Streaming GIF writer: frames are quantized and appended one at a time. */
export class GifWriter {
  private encoder = GIFEncoder();
  private count = 0;
  private palettes = new Map<string, ReturnType<typeof quantize>>();

  constructor(private delay: number) {}

  set frameDelay(value: number) {
    this.delay = value;
  }

  /**
   * @param key identifies frames with identical content (still background and
   *   the same text state) so their palette is computed only once
   */
  addFrame(image: Raster, key?: string): void {
    const rgba = image.data;
    let palette = key ? this.palettes.get(key) : undefined;
    if (!palette) {
      palette = quantize(paletteSample(image), 256, { format: "rgb565" });
      if (key) this.palettes.set(key, palette);
    }
    const index = applyPalette(rgba, palette, "rgb565");
    this.encoder.writeFrame(index, image.width, image.height, {
      palette,
      delay: this.delay,
      repeat: 0,
      first: this.count === 0,
    });
    this.count += 1;
  }

  finish(): Uint8Array {
    this.encoder.finish();
    return this.encoder.bytes();
  }

  get frames(): number {
    return this.count;
  }
}

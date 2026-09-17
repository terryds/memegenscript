/**
 * WASM image codecs (jSquash) and the resvg SVG rasterizer, initialized from
 * the `.wasm` modules wrangler bundles alongside the Worker.
 */
import { initWasm as initResvg, Resvg, type ResvgRenderOptions } from "@resvg/resvg-wasm";
import RESVG_WASM from "@resvg/resvg-wasm/index_bg.wasm";
import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode";
import encodeJpeg, { init as initJpegEncode } from "@jsquash/jpeg/encode";
import JPEG_DEC_WASM from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import JPEG_ENC_WASM from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import decodePng, { init as initPngDecode } from "@jsquash/png/decode";
import encodePng, { init as initPngEncode } from "@jsquash/png/encode";
// @ts-expect-error wasm-bindgen ships a .wasm.d.ts without a default export
import PNG_WASM from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode";
import webpEncoderFactory from "@jsquash/webp/codec/enc/webp_enc.js";
import { initEmscriptenModule } from "@jsquash/webp/utils.js";
import type { WebPModule } from "@jsquash/webp/codec/enc/webp_enc.js";
import WEBP_DEC_WASM from "@jsquash/webp/codec/dec/webp_dec.wasm";
import WEBP_ENC_WASM from "@jsquash/webp/codec/enc/webp_enc.wasm";
import { defaultOptions as webpDefaultOptions } from "@jsquash/webp/meta";
import type { Raster } from "./raster";
import { sniffFormat, type ImageFormat } from "./format";
import { decodeGif } from "./gif";

// The codecs return browser `ImageData`; Workers don't define it.
if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
  (globalThis as { ImageData?: unknown }).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = "srgb";
    constructor(data: Uint8ClampedArray | number, width: number, height?: number) {
      if (typeof data === "number") {
        this.width = data;
        this.height = width;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = data;
        this.width = width;
        this.height = height ?? data.length / 4 / width;
      }
    }
  };
}

const ready = {
  resvg: null as Promise<void> | null,
  jpegDecode: null as Promise<void> | null,
  jpegEncode: null as Promise<void> | null,
  png: null as Promise<unknown> | null,
  webpDecode: null as Promise<void> | null,
  webpEncode: null as Promise<WebPModule> | null,
};

function ensureResvg(): Promise<void> {
  ready.resvg ??= initResvg(RESVG_WASM).catch((error: unknown) => {
    if (error instanceof Error && /already/i.test(error.message)) return;
    ready.resvg = null;
    throw error;
  });
  return ready.resvg;
}

function ensurePng(): Promise<unknown> {
  ready.png ??= Promise.all([initPngDecode(PNG_WASM), initPngEncode(PNG_WASM)]);
  return ready.png;
}

function ensureJpegDecode(): Promise<void> {
  ready.jpegDecode ??= initJpegDecode(JPEG_DEC_WASM);
  return ready.jpegDecode;
}

function ensureJpegEncode(): Promise<void> {
  ready.jpegEncode ??= initJpegEncode(JPEG_ENC_WASM);
  return ready.jpegEncode;
}

function ensureWebpDecode(): Promise<void> {
  ready.webpDecode ??= initWebpDecode(WEBP_DEC_WASM);
  return ready.webpDecode;
}

function ensureWebpEncode(): Promise<WebPModule> {
  ready.webpEncode ??= initEmscriptenModule(webpEncoderFactory, WEBP_ENC_WASM) as Promise<WebPModule>;
  return ready.webpEncode;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toRaster(image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }): Raster {
  return {
    width: image.width,
    height: image.height,
    data: image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength),
  };
}

export interface DecodedFrame {
  raster: Raster;
  /** Frame delay in milliseconds */
  delay: number;
}

export interface DecodedImage {
  format: ImageFormat;
  width: number;
  height: number;
  /** Total frame count (1 for still images) */
  frameCount: number;
  /** Delay of the first frame in ms (GIF `duration` in Pillow terms) */
  duration: number;
  /** Lazily iterate frames so large animations never sit fully in memory */
  frames: () => AsyncIterable<DecodedFrame>;
  /** The first frame (still image) */
  first: () => Promise<Raster>;
}

export class ImageDecodeError extends Error {}

/** Decode any supported image container into RGBA frames. */
export async function decodeImage(bytes: Uint8Array): Promise<DecodedImage> {
  const format = sniffFormat(bytes);
  if (!format) throw new ImageDecodeError("Unidentified image format");

  if (format === "gif") {
    return decodeGif(bytes);
  }

  let raster: Raster;
  try {
    if (format === "png") {
      await ensurePng();
      raster = toRaster(await decodePng(toArrayBuffer(bytes)));
    } else if (format === "jpeg") {
      await ensureJpegDecode();
      raster = toRaster(await decodeJpeg(toArrayBuffer(bytes), { preserveOrientation: false }));
    } else {
      await ensureWebpDecode();
      raster = toRaster(await decodeWebp(toArrayBuffer(bytes)));
    }
  } catch (error) {
    throw new ImageDecodeError(`Unable to decode ${format}: ${(error as Error).message}`);
  }

  return {
    format,
    width: raster.width,
    height: raster.height,
    frameCount: 1,
    duration: 100,
    frames: async function* () {
      yield { raster, delay: 100 };
    },
    first: async () => raster,
  };
}

type Bytes = Uint8ClampedArray<ArrayBuffer>;

function toImageData(image: Raster): ImageData {
  return new ImageData(image.data as Bytes, image.width, image.height);
}

export async function encodeToPng(image: Raster): Promise<Uint8Array> {
  await ensurePng();
  return new Uint8Array(await encodePng(toImageData(image)));
}

export async function encodeToJpeg(image: Raster, quality: number): Promise<Uint8Array> {
  await ensureJpegEncode();
  return new Uint8Array(await encodeJpeg(toImageData(image), { quality, baseline: true, progressive: false }));
}

export async function encodeToWebp(image: Raster, quality = 75, { fast = false } = {}): Promise<Uint8Array> {
  const module = await ensureWebpEncode();
  const options = { ...webpDefaultOptions, quality, method: fast ? 2 : webpDefaultOptions.method };
  const result = module.encode(image.data as Bytes, image.width, image.height, options);
  if (!result) throw new Error("WebP encoding error");
  return result;
}

let premultipliedProbe: Promise<boolean> | null = null;

/** Does `RenderedImage.pixels` return premultiplied alpha? Determined empirically once. */
function resvgIsPremultiplied(): Promise<boolean> {
  premultipliedProbe ??= (async () => {
    await ensureResvg();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="rgb(255,255,255)" fill-opacity="0.5"/></svg>`;
    const resvg = new Resvg(svg, { fitTo: { mode: "original" } });
    const rendered = resvg.render();
    const pixels = rendered.pixels;
    rendered.free();
    resvg.free();
    return pixels[0] < 200;
  })();
  return premultipliedProbe;
}

/** Rasterize an SVG document to a straight-alpha RGBA raster. */
export async function renderSvg(svg: string, options: ResvgRenderOptions = {}): Promise<Raster> {
  await ensureResvg();
  const premultiplied = await resvgIsPremultiplied();
  const resvg = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false }, ...options });
  const rendered = resvg.render();
  const width = rendered.width;
  const height = rendered.height;
  const data = new Uint8ClampedArray(rendered.pixels);
  rendered.free();
  resvg.free();
  if (premultiplied) {
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a !== 0 && a !== 255) {
        data[i] = (data[i] * 255) / a;
        data[i + 1] = (data[i + 1] * 255) / a;
        data[i + 2] = (data[i + 2] * 255) / a;
      }
    }
  }
  return { width, height, data };
}

/** Pre-warm every codec (used on the first request of an isolate). */
export async function warmCodecs(): Promise<void> {
  await Promise.all([ensureResvg(), ensurePng(), ensureJpegDecode(), ensureJpegEncode(), ensureWebpDecode(), ensureWebpEncode()]);
}

/**
 * Port of the rendering entry points in `app/utils/images.py`: `preview`,
 * `save` (here `renderMeme`), `render_image`, and `render_animation`.
 */
import type { ImageRef, Template } from "../models/template";
import type { Dimensions } from "../models/overlay";
import { DEFAULT_SIZE, MAXIMUM_FRAMES, MINIMUM_FRAMES, PREVIEW_SIZE } from "../settings";
import { decodeImage, encodeToJpeg, encodeToPng, encodeToWebp, ImageDecodeError, type DecodedImage } from "./codecs";
import { MIME_TYPES } from "./format";
import { GifWriter } from "./gif";
import { getImageElements, renderForegroundLayer, renderWatermarkStrip, visibilityKey, type WatermarkStrip } from "./layer";
import {
  addBlurredBackground,
  cloneRaster,
  compositeOver,
  fitImage,
  flattenAlpha,
  padTop,
  resizeImage,
  type Raster,
} from "./raster";
import { muxAnimatedWebp, type WebpFrame } from "./webp";

export interface RenderContext {
  assets: Fetcher;
  debug: boolean;
}

export class MissingBackgroundError extends Error {}

async function loadBytes(ref: ImageRef, assets: Fetcher): Promise<Uint8Array> {
  if (ref.kind === "custom") return ref.bytes;
  if (ref.kind === "placeholder") throw new MissingBackgroundError("Template has no background image");
  const response = await assets.fetch(new Request("https://assets.local" + ref.path));
  if (!response.ok) throw new MissingBackgroundError(`Missing background asset: ${ref.path}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Load and decode the background for a style, applying `layout=top` padding. */
async function loadBackground(template: Template, style: string, animated: boolean, assets: Fetcher): Promise<DecodedImage> {
  const ref = template.getImage(style, animated);
  const bytes = await loadBytes(ref, assets);
  const decoded = await decodeImage(bytes);
  if (template.layout !== "top") return decoded;

  const extra = Math.trunc(decoded.height * 0.25);
  return {
    ...decoded,
    height: decoded.height + extra,
    frames: async function* () {
      for await (const frame of decoded.frames()) yield { raster: padTop(frame.raster), delay: frame.delay };
    },
    first: async () => padTop(await decoded.first()),
  };
}

function watermarkDisabledForSize(size: Dimensions, isPreview: boolean, debug: boolean): boolean {
  const small = (size[0] > 0 && size[0] <= PREVIEW_SIZE[0]) || (size[1] > 0 && size[1] <= PREVIEW_SIZE[1]);
  return small && !(isPreview || debug);
}

export interface RenderImageOptions {
  template: Template;
  style: string;
  lines: string[];
  size: Dimensions;
  fontName?: string;
  pad?: boolean | null;
  isPreview?: boolean;
  watermark?: string;
}

/** Port of `render_image`: a single still frame. */
export async function renderImage(options: RenderImageOptions, context: RenderContext): Promise<Raster> {
  const { template, style, lines, size, fontName = "", isPreview = false } = options;
  let watermark = options.watermark ?? "";
  const pad = options.pad ?? (size[0] > 0 && size[1] > 0);

  const decoded = await loadBackground(template, style, false, context.assets);
  const background = await decoded.first();
  const image = resizeImage(background, size[0], size[1], pad, { expand: true });
  const imageSize: Dimensions = [image.width, image.height];

  if (watermarkDisabledForSize(size, isPreview, context.debug)) watermark = "";

  const elements = await getImageElements({
    template,
    lines,
    fontName,
    watermark,
    imageSize,
    isPreview,
    assets: context.assets,
  });
  const layer = await renderForegroundLayer({ template, elements, imageSize, debug: context.debug });
  compositeOver(image, layer);

  let result = image;
  if (pad) result = addBlurredBackground(image, background, size[0], size[1]);

  if (watermark) {
    const strip = await renderWatermarkStrip([result.width, result.height], watermark, isPreview, context.assets);
    compositeOver(result, strip.raster, 0, strip.y);
  }
  return result;
}

export interface RenderAnimationOptions extends RenderImageOptions {
  maximumFrames?: number;
}

export interface AnimationFrame {
  raster: Raster;
  index: number;
  total: number;
  /** Identifies frames with identical pixels (still background + same layer), if any */
  key?: string;
}

export interface Animation {
  /** Frame delay in milliseconds (after Pillow's duration adjustment) */
  duration: number;
  /** Number of frames that will be produced */
  count: number;
  frames: () => AsyncIterable<AnimationFrame>;
}

/** Port of `render_animation`, streaming frames instead of collecting them. */
export async function renderAnimation(options: RenderAnimationOptions, context: RenderContext): Promise<Animation> {
  const { template, style, lines, size, fontName = "", isPreview = false, maximumFrames = 0 } = options;
  let watermark = options.watermark ?? "";
  const pad = options.pad ?? (size[0] > 0 && size[1] > 0);

  const source = await loadBackground(template, style, true, context.assets);
  let duration = source.duration;
  let total = source.frameCount;
  let sources: () => AsyncIterable<Raster>;

  if (total > 1) {
    sources = async function* () {
      for await (const frame of source.frames()) yield frame.raster;
    };
  } else if (template.animatedText) {
    const still = await source.first();
    sources = async function* () {
      for (let i = 0; i < MAXIMUM_FRAMES; i++) yield still;
    };
    duration = 250;
    total = MAXIMUM_FRAMES;
  } else if (lines.filter((line) => line.trim()).length === 2) {
    template.animate();
    const still = await source.first();
    sources = async function* () {
      for (let i = 0; i < MINIMUM_FRAMES; i++) yield still;
    };
    duration = 1200;
    total = MINIMUM_FRAMES;
  } else {
    const still = await source.first();
    sources = async function* () {
      yield still;
    };
    total = 1;
  }

  let modulus: number;
  if (maximumFrames >= total) {
    modulus = 1.0;
  } else if (maximumFrames) {
    modulus = Math.max(1.0, Math.round((total / maximumFrames) * 10) / 10);
  } else {
    const scale = Math.min(2.0, size[1] ? DEFAULT_SIZE[1] / size[1] : 1.0);
    modulus = Math.max(1.0, Math.round((total / (MAXIMUM_FRAMES * scale)) * 10) / 10);
  }

  const selected: number[] = [];
  for (let index = 0; index < total; index++) {
    if (index % modulus >= 1) continue;
    selected.push(index);
  }

  if (selected.length > MINIMUM_FRAMES) {
    const ratio = selected.length / Math.max(total, MAXIMUM_FRAMES);
    const oldDuration = duration;
    duration = Math.min(250, Math.floor(duration / ratio));
    if (duration !== oldDuration) console.info(`Adjusted duration of ${oldDuration} to ${duration}`);
  }

  if (watermarkDisabledForSize(size, isPreview, context.debug)) watermark = "";

  const layers = new Map<string, Raster>();
  let watermarkStrip: WatermarkStrip | null = null;
  let dotStrip: WatermarkStrip | null = null;

  // Still backgrounds are repeated for every frame: resize them only once.
  const resized = new WeakMap<Raster, Raster>();
  const frames = async function* (): AsyncIterable<AnimationFrame> {
    let index = -1;
    for await (const background of sources()) {
      index += 1;
      if (index % modulus >= 1) continue;

      let base = resized.get(background);
      if (!base) {
        base = resizeImage(background, size[0], size[1], pad, { expand: false });
        if (total > 1 && source.frameCount > 1) resized.delete(background);
        else resized.set(background, base);
      }
      const image = cloneRaster(base);
      const imageSize: Dimensions = [image.width, image.height];
      const percentRendered = total === 1 ? 1.0 : index / total;

      const overlayKey = [...template.foregrounds.keys()]
        .map((i) => {
          const overlay = template.overlay[Math.min(i, template.overlay.length - 1)];
          return overlay.timed ? (overlay.visibleAt(percentRendered) ? "1" : "0") : "1";
        })
        .join("");
      const key = `${imageSize.join("x")}|${visibilityKey(template, percentRendered)}|${overlayKey}`;
      let layer = layers.get(key);
      if (!layer) {
        const elements = await getImageElements({
          template,
          lines,
          fontName,
          watermark,
          imageSize,
          isPreview,
          percentRendered,
          assets: context.assets,
        });
        layer = await renderForegroundLayer({ template, elements, imageSize, percentRendered, debug: context.debug });
        layers.set(key, layer);
      }
      compositeOver(image, layer);

      let result = image;
      if (pad) result = addBlurredBackground(image, background, size[0], size[1]);

      let fuzz = 0;
      if (total === 1 || total >= MAXIMUM_FRAMES) fuzz = 0;
      else if (index / total < 0.5) fuzz = index;
      else fuzz = total - index - 1;

      if (watermark) {
        watermarkStrip ??= await renderWatermarkStrip([result.width, result.height], watermark, isPreview, context.assets);
        compositeOver(result, watermarkStrip.raster, fuzz, watermarkStrip.y);
      } else if (1 < total && total <= 5) {
        dotStrip ??= await renderWatermarkStrip([result.width, result.height], ".", isPreview, context.assets);
        compositeOver(result, dotStrip.raster, fuzz, dotStrip.y);
      }

      const still = source.frameCount === 1;
      yield { raster: result, index, total, key: still ? `${key}|${fuzz}` : undefined };
    }
  };

  return { duration, count: selected.length, frames };
}

export interface RenderedMeme {
  bytes: Uint8Array;
  mimeType: string;
}

export interface RenderMemeOptions {
  template: Template;
  lines: string[];
  watermark?: string;
  fontName?: string;
  extension: string;
  style?: string;
  size?: Dimensions;
  maximumFrames?: number;
}

/** Port of `save`: render a meme in the requested format. */
export async function renderMeme(options: RenderMemeOptions, context: RenderContext): Promise<RenderedMeme> {
  const { template, lines, watermark = "", fontName = "", extension, style = "default", maximumFrames = 0 } = options;
  const size = fitImage(...(options.size ?? [0, 0]));
  const common = { template, style, lines, size, fontName, watermark };

  if (extension === "gif") {
    const animation = await renderAnimation({ ...common, maximumFrames }, context);
    const writer = new GifWriter(animation.duration);
    for await (const frame of animation.frames()) writer.addFrame(frame.raster, frame.key);
    console.info(`Saved ${writer.frames} frames as GIF at ${animation.duration} ms/frame`);
    return { bytes: writer.finish(), mimeType: MIME_TYPES.gif };
  }

  if (extension === "webp") {
    const animation = await renderAnimation({ ...common, maximumFrames: maximumFrames || MAXIMUM_FRAMES * 4 }, context);
    const frames: WebpFrame[] = [];
    let width = 0;
    let height = 0;
    for await (const frame of animation.frames()) {
      width = frame.raster.width;
      height = frame.raster.height;
      const fast = animation.count > 1; // animations trade a little compression for speed
      frames.push({ bytes: await encodeToWebp(flattenAlpha(frame.raster), 75, { fast }), duration: animation.duration });
    }
    console.info(`Saved ${frames.length} frames as WebP at ${animation.duration} ms/frame`);
    if (frames.length === 1) return { bytes: frames[0].bytes, mimeType: MIME_TYPES.webp };
    return { bytes: muxAnimatedWebp(frames, width, height), mimeType: MIME_TYPES.webp };
  }

  const image = flattenAlpha(await renderImage(common, context));
  if (extension === "jpg" || extension === "jpeg") {
    return { bytes: await encodeToJpeg(image, 95), mimeType: MIME_TYPES.jpg };
  }
  return { bytes: await encodeToPng(image), mimeType: MIME_TYPES.png };
}

/** Port of `preview`: a small, low-quality JPEG for typeahead previews. */
export async function renderPreview(
  template: Template,
  lines: string[],
  { style = "default", watermark = "" }: { style?: string; watermark?: string },
  context: RenderContext,
): Promise<RenderedMeme> {
  const image = await renderImage(
    { template, style, lines, size: PREVIEW_SIZE, pad: false, isPreview: true, watermark },
    context,
  );
  return { bytes: await encodeToJpeg(flattenAlpha(image), 50), mimeType: MIME_TYPES.jpg };
}

export { ImageDecodeError };

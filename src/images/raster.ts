/**
 * Pure-TypeScript raster operations on straight-alpha RGBA buffers, replacing
 * the parts of Pillow the meme renderer needs (resize, blur, paste, pad).
 */
import { DEFAULT_SIZE, MAXIMUM_PIXELS } from "../settings";
import type { Dimensions } from "../models/overlay";

export interface Raster {
  width: number;
  height: number;
  /** RGBA, straight (non-premultiplied) alpha, row-major */
  data: Uint8ClampedArray;
}

export function createRaster(width: number, height: number, fill?: [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    const [r, g, b, a] = fill;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

export function cloneRaster(image: Raster): Raster {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

/** Port of `fit_image`: shrink dimensions until under the pixel budget. */
export function fitImage(width: number, height: number): Dimensions {
  while (width * height > MAXIMUM_PIXELS) {
    width *= 0.75;
    height *= 0.75;
  }
  return [Math.trunc(width), Math.trunc(height)];
}

/** Port of `resize_image`: the size rules for backgrounds. */
export function resizeImage(image: Raster, width: number, height: number, pad = true, { expand }: { expand: boolean }): Raster {
  const ratio = image.width / image.height;
  const [defaultWidth, defaultHeight] = DEFAULT_SIZE;
  let size: Dimensions;

  if (pad) {
    if (width < height * ratio) {
      size = [width, Math.trunc(width / ratio)];
    } else {
      size = [Math.trunc(height * ratio), height];
    }
  } else if (width) {
    size = [width, Math.trunc(width / ratio)];
  } else if (height) {
    size = [Math.trunc(height * ratio), height];
  } else if (ratio < 1.0) {
    size = expand ? [defaultWidth, Math.trunc(defaultHeight / ratio)] : [Math.trunc(defaultWidth * ratio), defaultHeight];
  } else {
    size = expand ? [Math.trunc(defaultWidth * ratio), defaultHeight] : [defaultWidth, Math.trunc(defaultHeight / ratio)];
  }

  return resample(image, Math.max(1, size[0]), Math.max(1, size[1]));
}

// --- Lanczos resampling (separable), matching Pillow's LANCZOS filter --------

function lanczos3(x: number): number {
  if (x === 0) return 1;
  if (x <= -3 || x >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

interface Weights {
  starts: Int32Array;
  counts: Int32Array;
  weights: Float32Array;
  maxCount: number;
}

function computeWeights(inSize: number, outSize: number): Weights {
  const scale = inSize / outSize;
  const filterScale = Math.max(scale, 1);
  const support = 3 * filterScale;
  const maxCount = Math.ceil(support * 2) + 1;
  const starts = new Int32Array(outSize);
  const counts = new Int32Array(outSize);
  const weights = new Float32Array(outSize * maxCount);

  for (let out = 0; out < outSize; out++) {
    const center = (out + 0.5) * scale;
    let start = Math.floor(center - support);
    let end = Math.ceil(center + support);
    if (start < 0) start = 0;
    if (end > inSize) end = inSize;
    let total = 0;
    const count = end - start;
    for (let i = 0; i < count; i++) {
      const w = lanczos3((start + i + 0.5 - center) / filterScale);
      weights[out * maxCount + i] = w;
      total += w;
    }
    if (total !== 0) {
      for (let i = 0; i < count; i++) weights[out * maxCount + i] /= total;
    }
    starts[out] = start;
    counts[out] = count;
  }
  return { starts, counts, weights, maxCount };
}

/** Resample to exact dimensions with a Lanczos3 filter (premultiplied internally). */
export function resample(image: Raster, width: number, height: number): Raster {
  if (width === image.width && height === image.height) return cloneRaster(image);
  const src = image.data;
  const sw = image.width;
  const sh = image.height;

  // Horizontal pass into premultiplied float rows
  const hw = computeWeights(sw, width);
  const temp = new Float32Array(width * sh * 4);
  for (let y = 0; y < sh; y++) {
    const rowOffset = y * sw * 4;
    for (let x = 0; x < width; x++) {
      const start = hw.starts[x];
      const count = hw.counts[x];
      const wOffset = x * hw.maxCount;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = 0; i < count; i++) {
        const w = hw.weights[wOffset + i];
        const p = rowOffset + (start + i) * 4;
        const alpha = src[p + 3] * w;
        r += src[p] * alpha;
        g += src[p + 1] * alpha;
        b += src[p + 2] * alpha;
        a += alpha;
      }
      const o = (y * width + x) * 4;
      temp[o] = r;
      temp[o + 1] = g;
      temp[o + 2] = b;
      temp[o + 3] = a;
    }
  }

  // Vertical pass
  const vw = computeWeights(sh, height);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const start = vw.starts[y];
      const count = vw.counts[y];
      const wOffset = y * vw.maxCount;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = 0; i < count; i++) {
        const w = vw.weights[wOffset + i];
        const p = ((start + i) * width + x) * 4;
        r += temp[p] * w;
        g += temp[p + 1] * w;
        b += temp[p + 2] * w;
        a += temp[p + 3] * w;
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
        out[o + 3] = a;
      }
    }
  }
  return { width, height, data: out };
}

/** Fast bilinear resample (used for the blurred backdrop). */
export function resampleBilinear(image: Raster, width: number, height: number): Raster {
  const out = new Uint8ClampedArray(width * height * 4);
  const src = image.data;
  const sw = image.width;
  const sh = image.height;
  const xRatio = sw / width;
  const yRatio = sh / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sh - 1, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sw - 1, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c];
        const p10 = src[(y0 * sw + x1) * 4 + c];
        const p01 = src[(y1 * sw + x0) * 4 + c];
        const p11 = src[(y1 * sw + x1) * 4 + c];
        out[o + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
    }
  }
  return { width, height, data: out };
}

// --- Blur --------------------------------------------------------------------

function boxBlurPass(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, horizontal: boolean) {
  const len = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const norm = 1 / (radius * 2 + 1);
  for (let line = 0; line < lines; line++) {
    for (let c = 0; c < 4; c++) {
      const idx = (i: number) => (horizontal ? (line * width + i) * 4 + c : (i * width + line) * 4 + c);
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += src[idx(Math.min(len - 1, Math.max(0, i)))];
      for (let i = 0; i < len; i++) {
        dst[idx(i)] = sum * norm;
        const addIndex = Math.min(len - 1, i + radius + 1);
        const removeIndex = Math.max(0, i - radius);
        sum += src[idx(addIndex)] - src[idx(removeIndex)];
      }
    }
  }
}

/** Approximate Gaussian blur (three box blurs), like `ImageFilter.GaussianBlur`. */
export function gaussianBlur(image: Raster, sigma: number): Raster {
  const { width, height } = image;
  // Box sizes for 3 passes approximating a Gaussian of the given sigma
  const wIdeal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes = [0, 1, 2].map((i) => (i < m ? wl : wu));

  let a = Float32Array.from(image.data);
  let b = new Float32Array(a.length);
  for (const size of sizes) {
    const radius = (size - 1) / 2;
    boxBlurPass(a, b, width, height, radius, true);
    boxBlurPass(b, a, width, height, radius, false);
  }
  void b;
  return { width, height, data: Uint8ClampedArray.from(a) };
}

// --- Compositing -------------------------------------------------------------

/** Alpha-composite `layer` over `base` at (x, y) in place ("over" operator). */
export function compositeOver(base: Raster, layer: Raster, x = 0, y = 0): void {
  const bw = base.width;
  const bh = base.height;
  const bd = base.data;
  const ld = layer.data;
  for (let ly = 0; ly < layer.height; ly++) {
    const by = y + ly;
    if (by < 0 || by >= bh) continue;
    for (let lx = 0; lx < layer.width; lx++) {
      const bx = x + lx;
      if (bx < 0 || bx >= bw) continue;
      const li = (ly * layer.width + lx) * 4;
      const sa = ld[li + 3];
      if (sa === 0) continue;
      const bi = (by * bw + bx) * 4;
      const da = bd[bi + 3];
      if (sa === 255 || da === 0) {
        bd[bi] = ld[li];
        bd[bi + 1] = ld[li + 1];
        bd[bi + 2] = ld[li + 2];
        bd[bi + 3] = sa;
        continue;
      }
      const a = sa / 255;
      const b = (da / 255) * (1 - a);
      const outA = a + b;
      bd[bi] = (ld[li] * a + bd[bi] * b) / outA;
      bd[bi + 1] = (ld[li + 1] * a + bd[bi + 1] * b) / outA;
      bd[bi + 2] = (ld[li + 2] * a + bd[bi + 2] * b) / outA;
      bd[bi + 3] = outA * 255;
    }
  }
}

/** Copy `source` onto `target` at (x, y) without blending (Pillow `paste` sans mask). */
export function paste(target: Raster, source: Raster, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy++) {
    const ty = y + sy;
    if (ty < 0 || ty >= target.height) continue;
    const sx0 = Math.max(0, -x);
    const sx1 = Math.min(source.width, target.width - x);
    if (sx1 <= sx0) continue;
    target.data.set(
      source.data.subarray((sy * source.width + sx0) * 4, (sy * source.width + sx1) * 4),
      (ty * target.width + x + sx0) * 4,
    );
  }
}

/** Port of `pad_top`: add 25% white space above the image for `layout=top`. */
export function padTop(image: Raster): Raster {
  const extra = Math.trunc(image.height * 0.25);
  const out = createRaster(image.width, image.height + extra, [255, 255, 255, 255]);
  paste(out, image, 0, extra);
  return out;
}

/** Force full opacity (equivalent of `.convert("RGB")` before saving). */
export function flattenAlpha(image: Raster): Raster {
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      const a = data[i] / 255;
      data[i - 3] *= a;
      data[i - 2] *= a;
      data[i - 1] *= a;
      data[i] = 255;
    }
  }
  return image;
}

/** Port of `add_blurred_background`: center the image on a darkened, blurred, stretched copy. */
export function addBlurredBackground(foreground: Raster, background: Raster, width: number, height: number): Raster {
  const baseWidth = foreground.width;
  const baseHeight = foreground.height;

  const borderWidth = Math.min(width, baseWidth + 2);
  const borderHeight = Math.min(height, baseHeight + 2);
  const border = createRaster(borderWidth, borderHeight, [0, 0, 0, 255]);
  paste(border, foreground, Math.trunc((borderWidth - baseWidth) / 2), Math.trunc((borderHeight - baseHeight) / 2));

  // Blur at reduced resolution: visually identical, several times cheaper.
  const factor = 4;
  const smallW = Math.max(1, Math.round(width / factor));
  const smallH = Math.max(1, Math.round(height / factor));
  const small = resampleBilinear(background, smallW, smallH);
  const d = small.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.trunc(d[i] * 0.4);
    d[i + 1] = Math.trunc(d[i + 1] * 0.4);
    d[i + 2] = Math.trunc(d[i + 2] * 0.4);
    d[i + 3] = 255;
  }
  const blurredSmall = gaussianBlur(small, 5 / factor);
  const blurred = resampleBilinear(blurredSmall, width, height);

  paste(blurred, border, Math.trunc((width - borderWidth) / 2), Math.trunc((height - borderHeight) / 2));
  return blurred;
}

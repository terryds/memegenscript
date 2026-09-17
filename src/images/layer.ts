/**
 * Builds the foreground of a meme (overlay images, text, preview stamp, and
 * watermark) as SVG and rasterizes it with resvg. Glyphs are emitted as paths
 * from opentype.js so measurement and rendering always agree.
 */
import type { Foreground, Template } from "../models/template";
import { Text, type Align, type Point } from "../models/text";
import type { Dimensions } from "../models/overlay";
import { PREVIEW_TEXT, WATERMARK_HEIGHT } from "../settings";
import { parseColor, toSvgFill } from "../utils/colors";
import { segment, twemojiUrl } from "../utils/emoji";
import { download } from "../utils/http";
import { decodeImage, encodeToPng, renderSvg } from "./codecs";
import { loadFont, type LoadedFont } from "./fonts";
import {
  EMOJI_SCALE,
  getFont,
  getStrokeWidth,
  getTextOffset,
  lineSpacing,
  textLength,
  wrap,
  type Offset,
  type SizedFont,
} from "./layout";
import { resample, type Raster } from "./raster";

// --- Encoding helpers --------------------------------------------------------

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function fillAttrs(color: string): string {
  const parsed = parseColor(color) ?? { r: 255, g: 255, b: 255, a: 255 };
  const { fill, opacity } = toSvgFill(parsed);
  return `fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity.toFixed(3)}"` : ""}`;
}

function strokeAttrs(color: string, width: number): string {
  if (width <= 0) return "";
  const parsed = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 255 };
  const { fill, opacity } = toSvgFill(parsed);
  return ` stroke="${fill}" stroke-width="${width * 2}" stroke-linejoin="round"${opacity < 1 ? ` stroke-opacity="${opacity.toFixed(3)}"` : ""} paint-order="stroke"`;
}

// --- Emoji images -----------------------------------------------------------

const emojiCache = new Map<string, Promise<string | null>>();

/** Data URI of the Twemoji PNG for an emoji grapheme (or null if unavailable). */
function emojiDataUri(grapheme: string): Promise<string | null> {
  let pending = emojiCache.get(grapheme);
  if (!pending) {
    pending = download(twemojiUrl(grapheme)).then((result) =>
      result ? `data:image/png;base64,${base64(result.bytes)}` : null,
    );
    emojiCache.set(grapheme, pending);
    if (emojiCache.size > 500) emojiCache.clear();
  }
  return pending;
}

// --- Overlay images ---------------------------------------------------------

export interface PreparedForeground {
  dataUri: string;
  width: number;
  height: number;
}

const foregroundCache = new Map<string, Promise<PreparedForeground>>();
const MAX_FOREGROUND_SIDE = 1024;

/** Decode an overlay image, cap its size, and re-encode as PNG for embedding. */
export function prepareForeground(foreground: Foreground): Promise<PreparedForeground> {
  let pending = foregroundCache.get(foreground.url);
  if (!pending) {
    pending = (async () => {
      const decoded = await decodeImage(foreground.bytes);
      let raster = await decoded.first();
      const longest = Math.max(raster.width, raster.height);
      if (longest > MAX_FOREGROUND_SIDE) {
        const scale = MAX_FOREGROUND_SIDE / longest;
        raster = resample(raster, Math.max(1, Math.round(raster.width * scale)), Math.max(1, Math.round(raster.height * scale)));
      }
      const png = await encodeToPng(raster);
      return { dataUri: `data:image/png;base64,${base64(png)}`, width: raster.width, height: raster.height };
    })();
    foregroundCache.set(foreground.url, pending);
    pending.catch(() => foregroundCache.delete(foreground.url));
    if (foregroundCache.size > 64) {
      const oldest = foregroundCache.keys().next().value;
      if (oldest !== undefined && oldest !== foreground.url) foregroundCache.delete(oldest);
    }
  }
  return pending;
}

// --- Text elements ----------------------------------------------------------

/** Port of the tuple yielded by `get_image_element`. */
export interface TextElement {
  point: Point;
  offset: Offset;
  text: string;
  maxTextSize: Dimensions;
  color: string;
  font: SizedFont;
  align: Align;
  strokeWidth: number;
  strokeFill: string;
  angle: number;
  isPreview: boolean;
}

export interface ElementOptions {
  template: Template;
  lines: string[];
  fontName: string;
  watermark: string;
  imageSize: Dimensions;
  isPreview?: boolean;
  percentRendered?: number;
  assets: Fetcher;
}

/** Port of `get_image_elements`. */
export async function getImageElements(options: ElementOptions): Promise<TextElement[]> {
  const { template, lines, fontName, watermark, imageSize, isPreview = false, percentRendered = 1.0, assets } = options;
  const elements: TextElement[] = [];
  for (const [index, text] of template.text.entries()) {
    let visible: boolean;
    if (percentRendered === 1.0) {
      visible = true;
    } else {
      visible = (text.start <= percentRendered && percentRendered < text.stop) || !text.stop;
    }
    elements.push(await getImageElement(visible ? lines : [], index, text, fontName, imageSize, watermark, assets));
  }
  if (isPreview) {
    const element = await getImageElement([PREVIEW_TEXT], 0, Text.getPreview(), "", imageSize, watermark, assets);
    element.isPreview = true;
    elements.push(element);
  }
  return elements;
}

/** Port of `get_image_element`. */
async function getImageElement(
  lines: string[],
  index: number,
  text: Text,
  fontName: string,
  imageSize: Dimensions,
  watermark: string,
  assets: Fetcher,
): Promise<TextElement> {
  const point = text.getAnchor(imageSize, watermark);
  const maxTextSize = text.getSize(imageSize);
  const maxFontSize = Math.trunc(imageSize[1] / (text.angle ? 4 : 9));

  const loaded = await loadFont(fontName || text.font, assets);

  let line: string;
  if (index >= lines.length) {
    line = "";
  } else {
    line = text.stylize(wrap(loaded, lines[index], maxTextSize, maxFontSize), { lines });
  }

  const font = getFont(loaded, line, maxTextSize, maxFontSize);
  const offset = getTextOffset(line, font, maxTextSize, text.align);
  const [strokeWidth, strokeFill] = text.getStroke(getStrokeWidth(font));

  return {
    point,
    offset,
    text: line,
    maxTextSize,
    color: text.color,
    font,
    align: text.align as Align,
    strokeWidth,
    strokeFill,
    angle: text.angle,
    isPreview: false,
  };
}

/** Which text elements are visible, as a cache key for animation frames. */
export function visibilityKey(template: Template, percentRendered: number): string {
  if (percentRendered === 1.0) return "all";
  return template.text
    .map((text) => ((text.start <= percentRendered && percentRendered < text.stop) || !text.stop ? "1" : "0"))
    .join("");
}

// --- SVG generation ---------------------------------------------------------

let clipCounter = 0;

/** SVG for one text box: mirrors `draw.text(...)` into a box pasted at `point`. */
async function textElementSvg(element: TextElement, debug: boolean): Promise<string> {
  const [boxWidth, boxHeight] = element.maxTextSize;
  if (boxWidth <= 0 || boxHeight <= 0) return "";
  const { font, offset, text, angle } = element;
  const { loaded, size, ascent } = font;

  const rows = text.split("\n");
  const spacing = -offset[1] / (rows.length * 2);
  const step = lineSpacing(font, spacing, element.strokeWidth);
  const widths = rows.map((row) => textLength(font, row));
  const maxWidth = Math.max(...widths);

  const parts: string[] = [];
  const fill = fillAttrs(element.color);
  const stroke = strokeAttrs(element.strokeFill, element.strokeWidth);

  for (const [i, row] of rows.entries()) {
    if (!row) continue;
    let shift = 0;
    if (element.align === "center") shift = (maxWidth - widths[i]) / 2;
    else if (element.align === "right") shift = maxWidth - widths[i];
    const top = -offset[1] + i * step;
    const baseline = top + ascent;
    let pen = -offset[0] + shift;
    for (const run of segment(row)) {
      if (run.emoji) {
        const side = size * EMOJI_SCALE;
        const uri = await emojiDataUri(run.text);
        if (uri) {
          parts.push(
            `<image x="${pen.toFixed(2)}" y="${top.toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" href="${uri}"/>`,
          );
        }
        pen += side + size * 0.1;
        continue;
      }
      const path = loaded.font.getPath(run.text, pen, baseline, size);
      const d = path.toPathData(2);
      if (d) parts.push(`<path d="${d}" ${fill}${stroke}/>`);
      pen += textLength(font, run.text);
    }
  }

  if (debug) {
    const outline = element.isPreview ? "orange" : "lime";
    parts.push(`<rect x="0.5" y="0.5" width="${boxWidth - 1}" height="${boxHeight - 1}" fill="none" stroke="${outline}"/>`);
  }
  if (!parts.length) return "";

  const [px, py] = element.point;
  let transform: string;
  if (angle) {
    const rad = (angle * Math.PI) / 180;
    const expandedWidth = Math.ceil(Math.abs(boxWidth * Math.cos(rad)) + Math.abs(boxHeight * Math.sin(rad)));
    const expandedHeight = Math.ceil(Math.abs(boxWidth * Math.sin(rad)) + Math.abs(boxHeight * Math.cos(rad)));
    transform = `translate(${px + expandedWidth / 2} ${py + expandedHeight / 2}) rotate(${-angle}) translate(${-boxWidth / 2} ${-boxHeight / 2})`;
  } else {
    transform = `translate(${px} ${py})`;
  }
  const clipId = `clip${++clipCounter}`;
  return (
    `<clipPath id="${clipId}"><rect x="0" y="0" width="${boxWidth}" height="${boxHeight}"/></clipPath>` +
    `<g transform="${transform}" clip-path="url(#${clipId})">${parts.join("")}</g>`
  );
}

/** SVG for a custom overlay image placed per the template's overlay slot. */
function overlaySvg(template: Template, index: number, prepared: PreparedForeground, imageSize: Dimensions, timed: boolean): string {
  const overlay = template.overlay[Math.min(index, template.overlay.length - 1)];
  const [slotWidth, slotHeight] = overlay.getSize(imageSize);
  if (slotWidth <= 0 || slotHeight <= 0) return "";

  // Non-timed overlays are "embedded" with resize_image (may enlarge);
  // timed overlays use Image.thumbnail (shrink only).
  const ratio = prepared.width / prepared.height;
  let chipWidth: number;
  let chipHeight: number;
  if (slotWidth < slotHeight * ratio) {
    chipWidth = slotWidth;
    chipHeight = Math.trunc(slotWidth / ratio);
  } else {
    chipWidth = Math.trunc(slotHeight * ratio);
    chipHeight = slotHeight;
  }
  if (timed && (prepared.width < chipWidth || prepared.height < chipHeight)) {
    chipWidth = prepared.width;
    chipHeight = prepared.height;
  }

  const cx = imageSize[0] * overlay.center_x;
  const cy = imageSize[1] * overlay.center_y;
  return (
    `<g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${-overlay.angle})">` +
    `<image x="${(-chipWidth / 2).toFixed(2)}" y="${(-chipHeight / 2).toFixed(2)}" width="${chipWidth}" height="${chipHeight}" preserveAspectRatio="none" href="${escapeAttr(prepared.dataUri)}"/>` +
    `</g>`
  );
}

export interface ForegroundLayerOptions {
  template: Template;
  elements: TextElement[];
  imageSize: Dimensions;
  percentRendered?: number;
  debug?: boolean;
}

/** Render overlays + text for one frame state into an RGBA layer. */
export async function renderForegroundLayer(options: ForegroundLayerOptions): Promise<Raster> {
  const { template, elements, imageSize, percentRendered = 1.0, debug = false } = options;
  const [width, height] = imageSize;
  const parts: string[] = [];

  for (const [index, foreground] of template.foregrounds) {
    const overlay = template.overlay[Math.min(index, template.overlay.length - 1)];
    if (overlay.timed && !overlay.visibleAt(percentRendered)) continue;
    const prepared = await prepareForeground(foreground);
    parts.push(overlaySvg(template, index, prepared, imageSize, overlay.timed));
  }

  for (const element of elements) {
    parts.push(await textElementSvg(element, debug));
  }

  if (debug) {
    for (const overlay of template.overlay) {
      const [w, h] = overlay.getSize(imageSize);
      const cx = imageSize[0] * overlay.center_x;
      const cy = imageSize[1] * overlay.center_y;
      parts.push(
        `<g transform="translate(${cx} ${cy}) rotate(${-overlay.angle})"><rect x="${-w / 2}" y="${-h / 2}" width="${w - 1}" height="${h - 1}" fill="none" stroke="fuchsia"/></g>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  return renderSvg(svg);
}

// --- Watermark --------------------------------------------------------------

export interface WatermarkStrip {
  raster: Raster;
  /** Composite the strip at (fuzz, y) */
  y: number;
}

/** Port of `add_watermark`, rendered once as a strip along the bottom edge. */
export async function renderWatermarkStrip(
  imageSize: Dimensions,
  label: string,
  isPreview: boolean,
  assets: Fetcher,
): Promise<WatermarkStrip> {
  const [imageWidth, imageHeight] = imageSize;
  let text: Text;
  let thick: boolean;
  let size: Dimensions;
  if (isPreview) {
    text = Text.getMessage();
    thick = true;
    size = [imageWidth, Math.trunc(WATERMARK_HEIGHT * 0.8)];
  } else {
    text = Text.getWatermark();
    thick = false;
    size = label.length === 1 ? [imageWidth, 1] : [imageWidth, WATERMARK_HEIGHT];
  }

  const loaded: LoadedFont = await loadFont("tiny", assets);
  const font = getFont(loaded, label, size, 99);
  const offset = getTextOffset(label, font, size, "center", isPreview);
  const [strokeWidth, strokeFill] = text.getStroke(getStrokeWidth(font), thick);

  const stripHeight = Math.min(imageHeight, Math.max(WATERMARK_HEIGHT * 3, font.ascent + font.descent + 8));
  const y = imageHeight - stripHeight;
  const textTop = imageHeight - size[1] - offset[1] - y;
  const baseline = textTop + font.ascent;

  const path = loaded.font.getPath(label, 3, baseline, font.size);
  const d = path.toPathData(2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${stripHeight}" viewBox="0 0 ${imageWidth} ${stripHeight}">` +
    (d ? `<path d="${d}" ${fillAttrs(text.color)}${strokeAttrs(strokeFill, strokeWidth)}/>` : "") +
    `</svg>`;
  return { raster: await renderSvg(svg), y };
}

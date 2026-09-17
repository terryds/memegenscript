/**
 * Port of the text measurement and fitting logic from `app/utils/images.py`
 * (`wrap`, `split_2`, `split_3`, `get_font`, `get_text_offset`, `get_text_size`,
 * `get_stroke_width`) on top of opentype.js instead of Pillow/FreeType.
 *
 * Coordinates follow Pillow's "la" anchor: (0, 0) is the left edge of the
 * ascender line; y grows downward.
 */
import type { Dimensions } from "../models/overlay";
import { MINIMUM_FONT_SIZE } from "../settings";
import { emojiCount, replaceEmoji, segment } from "../utils/emoji";
import type { LoadedFont } from "./fonts";

/** How large emoji images are relative to the font size (pilmoji default). */
export const EMOJI_SCALE = 0.8;

/** A font at a specific pixel size, mirroring `ImageFont.FreeTypeFont`. */
export interface SizedFont {
  loaded: LoadedFont;
  size: number;
  /** Pixel ascent/descent as FreeType rounds them */
  ascent: number;
  descent: number;
}

export function sizedFont(loaded: LoadedFont, size: number): SizedFont {
  const scale = size / loaded.unitsPerEm;
  return {
    loaded,
    size,
    ascent: Math.ceil(loaded.ascender * scale),
    descent: Math.ceil(-loaded.descender * scale),
  };
}

interface InkBox {
  xMin: number;
  xMax: number;
  /** distance from the ascender line down to the top of the ink */
  top: number;
  /** distance from the ascender line down to the bottom of the ink */
  bottom: number;
  advance: number;
}

const bboxCache = new WeakMap<LoadedFont, Map<number, { x1: number; y1: number; x2: number; y2: number; adv: number }>>();

function glyphMetrics(loaded: LoadedFont, glyphIndex: number, glyph: opentype.Glyph) {
  let map = bboxCache.get(loaded);
  if (!map) {
    map = new Map();
    bboxCache.set(loaded, map);
  }
  let m = map.get(glyphIndex);
  if (!m) {
    const box = glyph.getBoundingBox();
    m = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, adv: glyph.advanceWidth ?? 0 };
    map.set(glyphIndex, m);
  }
  return m;
}

/** Ink box and advance for a single line of text (emoji count as em squares). */
export function measureLine(font: SizedFont, line: string): InkBox {
  const { loaded, size, ascent } = font;
  const scale = size / loaded.unitsPerEm;
  let pen = 0; // font units
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  let yMin = Infinity;
  let any = false;

  for (const run of segment(line)) {
    if (run.emoji) {
      const em = loaded.unitsPerEm;
      const side = em * EMOJI_SCALE;
      xMin = Math.min(xMin, pen);
      xMax = Math.max(xMax, pen + side);
      yMax = Math.max(yMax, loaded.ascender);
      yMin = Math.min(yMin, loaded.ascender - side);
      pen += em * EMOJI_SCALE + em * 0.1;
      any = true;
      continue;
    }
    const glyphs = loaded.font.stringToGlyphs(run.text);
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i];
      const m = glyphMetrics(loaded, glyph.index, glyph);
      if (m.x2 > m.x1 && m.y2 > m.y1) {
        xMin = Math.min(xMin, pen + m.x1);
        xMax = Math.max(xMax, pen + m.x2);
        yMax = Math.max(yMax, m.y2);
        yMin = Math.min(yMin, m.y1);
        any = true;
      }
      pen += m.adv;
      if (i < glyphs.length - 1) {
        pen += loaded.font.getKerningValue(glyph, glyphs[i + 1]);
      }
    }
  }

  if (!any) {
    return { xMin: 0, xMax: 0, top: 0, bottom: 0, advance: pen * scale };
  }
  return {
    xMin: xMin * scale,
    xMax: xMax * scale,
    top: ascent - yMax * scale,
    bottom: ascent - yMin * scale,
    advance: pen * scale,
  };
}

/** Advance width of a line (Pillow `textlength`). */
export function textLength(font: SizedFont, line: string): number {
  return measureLine(font, line).advance;
}

export function getStrokeWidth(font: SizedFont): number {
  return Math.min(3, Math.max(1, Math.trunc(font.size / 12)));
}

/** Pillow's `_multiline_spacing`: distance between the tops of consecutive lines. */
export function lineSpacing(font: SizedFont, spacing: number, strokeWidth: number): number {
  return font.ascent + strokeWidth + strokeWidth + spacing;
}

/** `font.getbbox(text)` treating the whole (possibly multi-line) string as one run. */
function getBBox(font: SizedFont, text: string): [number, number, number, number] {
  const lines = text.split("\n");
  let xMin = Infinity;
  let top = Infinity;
  let xMax = -Infinity;
  let bottom = -Infinity;
  let any = false;
  let pen = 0;
  for (const line of lines) {
    const box = measureLine(font, line);
    if (box.xMax > box.xMin || box.bottom > box.top) {
      xMin = Math.min(xMin, pen + box.xMin);
      xMax = Math.max(xMax, pen + box.xMax);
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
      any = true;
    }
    pen += box.advance;
  }
  if (!any) return [0, 0, 0, 0];
  return [xMin, top, xMax, bottom];
}

/** `draw.textbbox((0, 0), text, font)` right/bottom plus the stroke width. */
export function getTextSize(font: SizedFont, text: string): Dimensions {
  const lines = text.split("\n");
  const spacing = lineSpacing(font, 4, 0);
  let right = 0;
  let bottom = 0;
  const widths = lines.map((line) => textLength(font, line));
  const maxWidth = Math.max(...widths);
  lines.forEach((line, index) => {
    const box = measureLine(font, line);
    const shift = (maxWidth - widths[index]) / 2; // center alignment, like Pillow's default
    right = Math.max(right, shift + box.xMax);
    bottom = Math.max(bottom, index * spacing + box.bottom);
  });
  const strokeWidth = getStrokeWidth(font);
  return [right + strokeWidth, bottom + strokeWidth];
}

export function getTextSizeMinusFontOffset(font: SizedFont, text: string): Dimensions {
  const [width, height] = getTextSize(font, text);
  const [xOffset, yOffset] = getBBox(font, text);
  return [width - xOffset, height - yOffset];
}

/** Port of `get_font`: the largest size at which the text fits the box. */
export function getFont(loaded: LoadedFont, text: string, maxTextSize: Dimensions, maxFontSize: number): SizedFont {
  const maxTextWidth = maxTextSize[0] - maxTextSize[0] / 35;
  const maxTextHeight = maxTextSize[1] - maxTextSize[1] / 10;
  let font = sizedFont(loaded, Math.max(MINIMUM_FONT_SIZE, maxFontSize));
  for (let size = Math.max(MINIMUM_FONT_SIZE, maxFontSize); size > 6; size--) {
    font = sizedFont(loaded, size);
    const [textWidth, textHeight] = getTextSizeMinusFontOffset(font, text);
    if (textWidth <= maxTextWidth && textHeight <= maxTextHeight) break;
  }
  return font;
}

export type Offset = [number, number];

/** Port of `get_text_offset`. */
export function getTextOffset(
  text: string,
  font: SizedFont,
  maxTextSize: Dimensions,
  align = "center",
  isWatermark = false,
): Offset {
  const textSize = getTextSize(font, text);
  const strokeWidth = getStrokeWidth(font);

  let [xOffset, yOffset] = getBBox(font, text);
  xOffset -= strokeWidth;
  yOffset -= strokeWidth;

  const lines = text.split("\n");
  const rows = lines.length;
  let yAdjust: number;
  if (rows >= 3) {
    yAdjust = 1.1;
  } else if (rows === 2 && font.loaded.id === "impact") {
    yAdjust = 1.1;
  } else {
    yAdjust = 1 + (3 - rows) * 0.25;
  }

  if (align !== "left") {
    xOffset -= (maxTextSize[0] - textSize[0]) / 2;
  }
  yOffset -= (maxTextSize[1] - textSize[1] / yAdjust) / 2;

  if (/[gjpqy]/.test(lines[lines.length - 1])) {
    yOffset += Math.trunc(textSize[1] / 20);
  } else if (isWatermark) {
    yOffset += 2;
  }

  return [xOffset, yOffset];
}

function unsafeWrap(text: string): boolean {
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped && emojiCount(stripped) && !replaceEmoji(stripped, "").trim()) return true;
  }
  return false;
}

/** Port of `wrap`: choose between 1, 2 and 3 lines to maximize font size. */
export function wrap(loaded: LoadedFont, line: string, maxTextSize: Dimensions, maxFontSize: number): string {
  const lines1 = line;
  const lines2 = split2(line);
  const lines3 = split3(line);

  const font1 = getFont(loaded, lines1, maxTextSize, maxFontSize);
  const font2 = getFont(loaded, lines2, maxTextSize, maxFontSize);
  const font3 = getFont(loaded, lines3, maxTextSize, maxFontSize);

  if (font1.size === font2.size && font2.size <= MINIMUM_FONT_SIZE) return lines2;
  if (font1.size >= font2.size) return lines1;

  if (!unsafeWrap(lines3) && getTextSize(font3, lines3)[0] >= maxTextSize[0] * 0.6) return lines3;
  if (getTextSize(font2, lines2)[0] >= maxTextSize[0] * 0.6) return lines2;

  return lines1;
}

export function split2(line: string): string {
  const midpoint = Math.trunc(line.length / 2) - 1;
  for (let offset = 0; offset < Math.trunc(line.length / 4); offset++) {
    for (const index of [midpoint - offset, midpoint + offset]) {
      if (line[index] === " ") {
        return line.slice(0, index).trim() + "\n" + line.slice(index).trim();
      }
    }
  }
  return line;
}

export function split3(line: string): string {
  const maxLen = line.length / 3;
  const words = line.split(" ");
  const lines = ["", "", ""];
  let index = 0;
  for (const word of words) {
    const currentLen = lines[index].length;
    const nextLen = currentLen + word.length * 0.7;
    if (nextLen > maxLen && index < 2) index += 1;
    lines[index] += word + " ";
  }
  return lines.join("\n").trim();
}

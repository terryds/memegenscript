/** Port of `app/models/text.py`. */
import { DEFAULT_FONT, WATERMARK_ALPHA, WATERMARK_HEIGHT } from "../settings";
import { emojize } from "../utils/emoji";
import { spongemock } from "../utils/mt19937";
import { capitalize, islower, STRING_METHODS } from "../utils/pystr";
import type { Dimensions } from "./overlay";

export type Point = [number, number];
export type Align = "left" | "center" | "right";

export function alpha(value: number): string {
  return Math.trunc(255 * value).toString(16).toUpperCase().padStart(2, "0");
}

export interface TextData {
  style: string;
  color: string;
  font: string;
  anchor_x: number;
  anchor_y: number;
  angle: number;
  scale_x: number;
  scale_y: number;
  align: string;
  start: number;
  stop: number;
}

export class Text implements TextData {
  style = "upper";
  color = "white";
  font = DEFAULT_FONT;
  anchor_x = 0.0;
  anchor_y = 0.0;
  angle = 0;
  scale_x = 1.0;
  scale_y = 0.2;
  align = "center";
  start = 0.0;
  stop = 1.0;

  constructor(data: Partial<TextData> = {}) {
    Object.assign(this, data);
  }

  clone(): Text {
    return new Text(this.toJSON());
  }

  toJSON(): TextData {
    const { style, color, font, anchor_x, anchor_y, angle, scale_x, scale_y, align, start, stop } = this;
    return { style, color, font, anchor_x, anchor_y, angle, scale_x, scale_y, align, start, stop };
  }

  /** Python `str(Text(...))` — used inside cache fingerprints. */
  toString(): string {
    const d = this.toJSON();
    return `Text(style='${d.style}', color='${d.color}', font='${d.font}', anchor_x=${d.anchor_x}, anchor_y=${d.anchor_y}, angle=${d.angle}, scale_x=${d.scale_x}, scale_y=${d.scale_y}, align='${d.align}', start=${d.start}, stop=${d.stop})`;
  }

  static getPreview(): Text {
    return new Text({
      color: "#808080" + alpha(0.375),
      anchor_x: 0.075,
      anchor_y: 0.05,
      angle: 10,
      scale_x: 0.75,
      scale_y: 0.75,
    });
  }

  static getMessage(): Text {
    return new Text({ color: "#FFC107", anchor_x: 0.5 });
  }

  static getWatermark(): Text {
    return new Text({ color: "#FFFFFF" + alpha(WATERMARK_ALPHA) });
  }

  get animated(): boolean {
    return !(this.start === 0.0 && this.stop === 1.0);
  }

  getAnchor(imageSize: Dimensions, watermark = ""): Point {
    const [imageWidth, imageHeight] = imageSize;
    let anchor: Point = [Math.trunc(imageWidth * this.anchor_x), Math.trunc(imageHeight * this.anchor_y)];
    if (watermark && this.anchor_x <= 0.1 && this.anchor_y >= 0.8) {
      anchor = [anchor[0], anchor[1] - Math.trunc(WATERMARK_HEIGHT / 2)];
    }
    return anchor;
  }

  getSize(imageSize: Dimensions): Dimensions {
    const [imageWidth, imageHeight] = imageSize;
    return [Math.trunc(imageWidth * this.scale_x), Math.trunc(imageHeight * this.scale_y)];
  }

  getStroke(width: number, thick = false): [number, string] {
    let color: string;
    if (this.color === "black") {
      width = 1;
      color = "#FFFFFF" + alpha(0.5);
    } else if (this.color.includes("#")) {
      width = thick ? 2 : 1;
      color = "#000000";
      if (this.color.length >= color.length + 2) {
        color += this.color.slice(-2);
      }
    } else {
      color = "black";
    }
    return [width, color];
  }

  normalize(text: string | null | undefined): string {
    if (text === null || text === undefined) return "";
    if (!["none", "default", "mock"].includes(this.style)) return text.toLowerCase();
    return text;
  }

  stylize(text: string, { lines }: { lines?: string[] } = {}): string {
    text = emojize(text);
    const candidates = (lines ?? [text]).filter((line) => line.trim());

    if (this.style === "none") return text;

    if (this.style === "default") {
      const allLower = candidates.every((line) => islower(line));
      const includesSentence = candidates.some((line) => /[.?!]$/.test(line));
      if (islower(text) && (allLower || includesSentence)) {
        text = capitalize(text);
      }
      text = text.replace(/\bi\b/g, "I");
      return text;
    }

    if (this.style === "mock") {
      return spongemock(text, 0.75, 0);
    }

    const method = STRING_METHODS[this.style || "upper"];
    if (method) return method(text);

    console.warn(`Unsupported text style: ${this.style}`);
    return text;
  }
}

/** Port of `app/models/font.py`. Font files live in the static assets. */
import { DEFAULT_FONT } from "../settings";

export class Font {
  constructor(
    public filename: string,
    public id: string,
    public alias = "",
  ) {}

  /** Path of the font file within the static assets. */
  get path(): string {
    return "/fonts/" + encodeURIComponent(this.filename);
  }

  toJSON(baseUrl: string) {
    return {
      id: this.id,
      alias: this.alias || null,
      filename: this.filename,
      _self: this.buildSelfUrl(baseUrl),
    };
  }

  buildSelfUrl(baseUrl: string): string {
    return `${baseUrl}/fonts/${this.id}`;
  }

  static get(name: string): Font {
    name = name || DEFAULT_FONT;
    for (const font of FONTS) {
      if (name === font.id || name === font.alias) return font;
    }
    throw new Error(`Unknown font: ${name}`);
  }

  static getOrNull(name: string): Font | null {
    try {
      return Font.get(name);
    } catch {
      return null;
    }
  }

  static all(): Font[] {
    return FONTS;
  }
}

export const FONTS = [
  new Font("TitilliumWeb-Black.ttf", "titilliumweb", "thick"),
  new Font("NotoSans-Bold.ttf", "notosans"),
  new Font("Kalam-Regular.ttf", "kalam", "comic"),
  new Font("Impact.ttf", "impact"),
  new Font("TitilliumWeb-SemiBold.ttf", "titilliumweb-thin", "thin"),
  new Font("Segoe UI Bold.ttf", "segoe", "tiny"),
  new Font("HG-Mincho-B.ttc", "hgminchob", "jp"),
  new Font("NotoSansHebrew-Bold.ttf", "notosanshebrew", "he"),
];

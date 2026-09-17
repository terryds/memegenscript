/**
 * Emoji support: `:alias:` expansion (like Python's `emoji.emojize`) and
 * grapheme segmentation so emoji can be rendered from Twemoji images (like
 * `pilmoji`), since the meme fonts have no color emoji glyphs.
 */
import emojilib from "emojilib";

/**
 * `:shortcode:` → emoji, approximating Python's `emoji.emojize(..., language="alias")`.
 * Names come from emojilib (GitHub-style shortcodes such as `:+1:`) plus its
 * keywords (which cover aliases like `:thumbsup:`).
 */
const ALIASES: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const lib = emojilib.lib;
  for (const [name, entry] of Object.entries(lib)) {
    if (!map.has(name)) map.set(name, entry.char);
  }
  for (const entry of Object.values(lib)) {
    for (const keyword of entry.keywords ?? []) {
      if (!keyword.includes(" ") && !map.has(keyword)) map.set(keyword, entry.char);
    }
  }
  return map;
})();

const SHORTCODE_RE = /:([a-zA-Z0-9_\-+]+):/g;

function lookupAlias(name: string): string | undefined {
  return (
    ALIASES.get(name) ??
    ALIASES.get(name.toLowerCase()) ??
    ALIASES.get(name.replace(/_/g, "")) ??
    ALIASES.get(name.replace(/-/g, "_"))
  );
}

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{20E3}/u;
const KEYCAP_BASE = /^[0-9#*]$/;

let segmenter: Intl.Segmenter | null = null;

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

export function emojize(text: string): string {
  return text.replace(SHORTCODE_RE, (match, name: string) => lookupAlias(name) ?? match);
}

export function isEmoji(grapheme: string): boolean {
  if (!EMOJI_RE.test(grapheme)) return false;
  // Plain digits/symbols are only emoji with a keycap (U+20E3)
  if (KEYCAP_BASE.test(grapheme[0]) && !grapheme.includes("⃣")) return false;
  // A bare text-presentation symbol like © or ™ shouldn't become an image
  const cp = grapheme.codePointAt(0) ?? 0;
  if (cp < 0x2100 && !grapheme.includes("️")) return false;
  return true;
}

export interface Run {
  text: string;
  emoji: boolean;
}

/** Split text into alternating runs of plain text and single emoji. */
export function segment(text: string): Run[] {
  const runs: Run[] = [];
  let buffer = "";
  for (const g of graphemes(text)) {
    if (isEmoji(g)) {
      if (buffer) runs.push({ text: buffer, emoji: false });
      buffer = "";
      runs.push({ text: g, emoji: true });
    } else {
      buffer += g;
    }
  }
  if (buffer) runs.push({ text: buffer, emoji: false });
  return runs;
}

export function emojiCount(text: string): number {
  return segment(text).filter((r) => r.emoji).length;
}

export function replaceEmoji(text: string, replacement = ""): string {
  return segment(text)
    .map((r) => (r.emoji ? replacement : r.text))
    .join("");
}

/** Twemoji asset file name for an emoji grapheme. */
export function twemojiCode(emoji: string): string {
  const raw = emoji.includes("‍") ? emoji : emoji.replace(/️/g, "");
  return Array.from(raw)
    .map((c) => (c.codePointAt(0) ?? 0).toString(16))
    .join("-");
}

export const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/";

export function twemojiUrl(emoji: string): string {
  return TWEMOJI_BASE + twemojiCode(emoji) + ".png";
}

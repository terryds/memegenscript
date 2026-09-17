/** Python `str` method semantics that differ from JavaScript's. */

const isCased = (ch: string) => ch.toLowerCase() !== ch.toUpperCase();
const isUpperChar = (ch: string) => isCased(ch) && ch === ch.toUpperCase();
const isLowerChar = (ch: string) => isCased(ch) && ch === ch.toLowerCase();

/** `str.islower()`: all cased characters are lowercase and there is at least one. */
export function islower(text: string): boolean {
  let cased = false;
  for (const ch of text) {
    if (isUpperChar(ch)) return false;
    if (isLowerChar(ch)) cased = true;
  }
  return cased;
}

/** `str.isupper()` */
export function isupper(text: string): boolean {
  let cased = false;
  for (const ch of text) {
    if (isLowerChar(ch)) return false;
    if (isUpperChar(ch)) cased = true;
  }
  return cased;
}

/** `str.capitalize()`: first character upper, the rest lower. */
export function capitalize(text: string): string {
  if (!text) return text;
  const chars = Array.from(text);
  return chars[0].toUpperCase() + chars.slice(1).join("").toLowerCase();
}

/** `str.title()`: uppercase after any uncased character, lowercase otherwise. */
export function title(text: string): string {
  let out = "";
  let previousCased = false;
  for (const ch of text) {
    if (isCased(ch)) {
      out += previousCased ? ch.toLowerCase() : ch.toUpperCase();
      previousCased = true;
    } else {
      out += ch;
      previousCased = false;
    }
  }
  return out;
}

/** `str.swapcase()` */
export function swapcase(text: string): string {
  let out = "";
  for (const ch of text) {
    out += isUpperChar(ch) ? ch.toLowerCase() : isLowerChar(ch) ? ch.toUpperCase() : ch;
  }
  return out;
}

/** The subset of `str` methods `Text.stylize` can dispatch to by name. */
export const STRING_METHODS: Record<string, (text: string) => string> = {
  upper: (t) => t.toUpperCase(),
  lower: (t) => t.toLowerCase(),
  title,
  capitalize,
  swapcase,
  casefold: (t) => t.toLowerCase(),
  strip: (t) => t.trim(),
};

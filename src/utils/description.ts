/** Meta-description helpers shared by the template and character pages. */

/** Words whose trailing period doesn't end a sentence ("Dr. Evil", "Mr. Bean"). */
const ABBREVIATIONS = new Set(["dr", "mr", "mrs", "ms", "st", "jr", "sr", "vs", "lt", "sgt", "prof", "gen", "capt", "no", "e.g", "i.e", "etc"]);

/** First sentence of a text (used for meta descriptions). */
export function firstSentence(text: string, max = 160): string {
  text = text.trim();
  let sentence = text;
  // A stop ends the sentence when whitespace (or the end) follows it, keeping
  // a closing quote/bracket: `catchphrase "Absolute Cinema."`. Skip the stop
  // after an abbreviation or an initial ("Mr. Krabs", "D.W. Read").
  for (const match of text.matchAll(/[.!?]+["'”’)]*(?=\s|$)/g)) {
    const before = /([\p{L}.]+)$/u.exec(text.slice(0, match.index))?.[1] ?? "";
    const word = before.replace(/^\.+/, "").toLowerCase();
    if (match[0].startsWith(".") && (ABBREVIATIONS.has(word) || /^(\p{L}\.)*\p{L}$/u.test(word))) continue;
    sentence = text.slice(0, match.index + match[0].length);
    break;
  }
  return truncate(sentence, max);
}

/** Cut at a word boundary with an ellipsis so the result is at most `max` characters. */
export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "") + "…" : text;
}

/** Search engines show roughly this many characters of a meta description. */
export const DESCRIPTION_MAX = 160;

/**
 * `lead`, then the first sentence of `about` (shortened to fit) or `fallback`,
 * then "Also known as …" if it fits. Google cuts descriptions off at ~160
 * characters, so later parts give way rather than the lead getting cut.
 */
export function composeDescription(lead: string, parts: { about?: string; fallback?: string; aka?: string[] }): string {
  let description = lead;
  const add = (part: string): boolean => {
    if (description.length + 1 + part.length > DESCRIPTION_MAX) return false;
    description += ` ${part}`;
    return true;
  };
  const room = () => DESCRIPTION_MAX - description.length - 1;
  if (parts.about) {
    if (room() >= 40) description += ` ${firstSentence(parts.about, room())}`;
  } else if (parts.fallback && room() >= 20) {
    description += ` ${truncate(parts.fallback, room())}`;
  }
  const aka = parts.aka ?? [];
  if (aka.length) add(`Also known as ${aka.slice(0, 2).join(", ")}.`) || add(`Also known as ${aka[0]}.`);
  return description;
}

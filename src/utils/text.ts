/** Port of `app/utils/text.py`: the URL slug encoding for meme text lines. */
import { sha1Hex } from "./sha1";

/** Lenient `urllib.parse.unquote`: invalid escapes are left untouched. */
export function unquote(value: string): string {
  return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
    const bytes = new Uint8Array(match.length / 3);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number.parseInt(match.slice(i * 3 + 1, i * 3 + 3), 16);
    }
    return new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
  });
}

export function encode(lines: string[]): string {
  const encodedLines: string[] = [];
  for (const line of lines) {
    if (line === "/") {
      encodedLines.push("_");
    } else if (line) {
      encodedLines.push(encodeLine(line));
    } else {
      encodedLines.push("_");
    }
  }
  const slug = encodedLines.join("/");
  return slug || "_";
}

function encodeLine(line: string): string {
  const hasTrailingUnder = line.includes("_ ");

  let encoded = unquote(line);

  for (const [before, after] of [
    ["_", "__"],
    ["-", "--"],
    [" ", "_"],
    ["?", "~q"],
    ["%", "~p"],
    ["#", "~h"],
    ['"', "''"],
    ["/", "~s"],
    ["\\", "~b"],
    ["\n", "~n"],
    ["&", "~a"],
    ["<", "~l"],
    [">", "~g"],
    ["‘", "'"],
    ["’", "'"],
    ["“", '"'],
    ["”", '"'],
    ["–", "-"],
  ] as const) {
    encoded = encoded.split(before).join(after);
  }

  if (hasTrailingUnder) {
    encoded = encoded.split("___").join("__-");
  }

  return encoded;
}

export function decode(slug: string): string[] {
  const hasDash = slug.includes("_----");
  const hasFlag = slug.includes("_--");
  const hasArrow = slug.includes("_--~g");
  const hasUnder = slug.includes("___");

  slug = slug.split("_").join(" ").split("  ").join("_");
  slug = slug.split("-").join(" ").split("  ").join("-");
  slug = slug.split("''").join('"');

  if (hasDash) {
    slug = slug.split("-- ").join(" --");
  } else if (hasFlag) {
    slug = slug.split("- ").join(" -");
  }

  if (hasArrow) {
    slug = slug.split("- ~g").join(" -~g");
  }

  if (hasUnder) {
    slug = slug.split("_ ").join(" _");
  }

  for (const [before, after] of [
    ["~q", "?"],
    ["~p", "%"],
    ["~h", "#"],
    ["~n", "\n"],
    ["~a", "&"],
    ["~l", "<"],
    ["~g", ">"],
    ["~b", "\\"],
  ] as const) {
    slug = slug.split(before).join(after);
  }

  return slug.split("/").map((line) => line.split("~s").join("/"));
}

export function normalize(slug: string): [string, boolean] {
  slug = unquote(slug);
  const normalizedSlug = encode(decode(slug));
  return [normalizedSlug, slug !== normalizedSlug];
}

export function fingerprint(value: string, { prefix = "_custom-", suffix = "" } = {}): string {
  if (!value.trim()) return "";
  return prefix + sha1Hex(value) + suffix;
}

export function slugify(value: string): string {
  return value.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

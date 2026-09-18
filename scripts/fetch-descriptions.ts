/**
 * Fetch a short description, origin, tags and alternate names for every
 * template whose `source` is a Know Your Meme entry, into
 * `data/descriptions.json`. Re-runs only fetch templates that are missing or
 * failed unless `--force` is given. Hand-written entries live in
 * `data/descriptions.manual.json` and are merged by the template build.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const MANIFEST = join(ROOT, "src", "generated", "templates.json");
const OUTPUT = join(ROOT, "data", "descriptions.json");
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

interface Entry {
  source: string;
  title?: string;
  aka?: string[];
  about?: string;
  origin?: string;
  tags?: string[];
  fetchedAt?: string;
  error?: string;
}

type Manifest = Record<string, { id: string; name: string; source: string | null }>;

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
const existing: Record<string, Entry> = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")) : {};

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));

const stripTags = (s: string) =>
  decodeEntities(
    s
      .replace(/<sup[^>]*>.*?<\/sup>/gs, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

// Periods after these don't end a sentence ("Mr. Incredible", "Dr. Evil", "vs. People")
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Lt|Gen|Capt|Sgt|vs|Vol|No|Mt|Ft|etc|e\.g|i\.e)\.$/i;

/** Split text into sentences, keeping closing quotes/brackets attached. */
function sentences(text: string): string[] {
  const out: string[] = [];
  const boundary = /[.!?]+["\u201d\u2019')\]]*(?:\s+|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text))) {
    if (match.index + match[0].length < text.length && ABBREVIATION.test(text.slice(last, match.index + 1))) continue;
    out.push(text.slice(last, match.index + match[0].length).trim());
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last).trim());
  return out.filter(Boolean);
}

/** First `max` sentences of a text, capped at `chars` characters. */
function excerpt(text: string, max: number, chars: number): string {
  let out = "";
  let count = 0;
  for (const sentence of sentences(text)) {
    if (out && (out + " " + sentence).length > chars) break;
    out = out ? out + " " + sentence : sentence;
    if (++count >= max) break;
  }
  if (!out) out = text.slice(0, chars);
  return out.length > chars ? out.slice(0, chars - 1).replace(/\s+\S*$/, "") + "\u2026" : out;
}

/** Paragraphs following an `<h2 id="...">` until the next heading. */
function section(html: string, id: string): string[] {
  const heading = `<h2 id="${id}">`;
  const start = html.indexOf(heading);
  if (start === -1) return [];
  const rest = html.slice(start + heading.length);
  const end = rest.search(/<h2 |<h3 |<div id="entry_footer|<section /);
  const chunk = end === -1 ? rest : rest.slice(0, end);
  return Array.from(chunk.matchAll(/<p>(.*?)<\/p>/gs), (m) => stripTags(m[1])).filter((p) => p.length > 20);
}

function parse(html: string, source: string): Entry {
  const meta = (name: string) =>
    new RegExp(`property=['"]${name}['"] content='([^']*)'`).exec(html)?.[1] ??
    new RegExp(`property=['"]${name}['"] content="([^"]*)"`).exec(html)?.[1];
  const ogTitle = meta("og:title");
  const ogDescription = meta("og:description");
  const title = ogTitle ? decodeEntities(ogTitle).replace(/\s*\|\s*Know Your Meme\s*$/i, "").trim() : undefined;
  const aka = title ? title.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean) : [];
  const about = section(html, "about");
  const origin = section(html, "origin");
  const tags = Array.from(html.matchAll(/data-tag="([^"]+)"/g), (m) => decodeEntities(m[1]).toLowerCase())
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 15);
  const aboutText = about.length ? about.join(" ") : ogDescription ? decodeEntities(ogDescription) : "";
  return {
    source,
    title,
    aka,
    about: aboutText ? excerpt(aboutText, 2, 420) : undefined,
    origin: origin.length ? excerpt(origin[0], 1, 300) : undefined,
    tags,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchEntry(url: string): Promise<Entry> {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${response.status}`;
        await new Promise((r) => setTimeout(r, 5000 * attempt));
        continue;
      }
      if (!response.ok) return { source: url, error: `HTTP ${response.status}` };
      const html = await response.text();
      const entry = parse(html, url);
      if (!entry.about || entry.about.length < 60) entry.error = "No description found";
      return entry;
    } catch (error) {
      lastError = String((error as Error).message || error);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  return { source: url, error: lastError || "failed" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ids = Object.keys(manifest)
  .filter((id) => !id.startsWith("_"))
  .filter((id) => /knowyourmeme\.com/.test(manifest[id].source ?? ""))
  .filter((id) => !ONLY || ONLY.includes(id));

let done = 0;
let failures = 0;
for (const id of ids) {
  const source = manifest[id].source as string;
  const previous = existing[id];
  if (!FORCE && previous && !previous.error && previous.source === source) {
    done++;
    continue;
  }
  const entry = await fetchEntry(source);
  existing[id] = entry;
  done++;
  if (entry.error) {
    failures++;
    console.log(`[${done}/${ids.length}] ${id}: FAILED ${entry.error}`);
  } else {
    console.log(`[${done}/${ids.length}] ${id}: ${entry.title} (${entry.about?.length} chars, ${entry.tags?.length} tags)`);
  }
  writeFileSync(OUTPUT, JSON.stringify(existing, null, 2) + "\n");
  await sleep(1200);
}
writeFileSync(OUTPUT, JSON.stringify(existing, null, 2) + "\n");
console.log(`Done: ${ids.length} templates, ${failures} failures`);

/**
 * Validate the original template content in `data/content/<id>.json`:
 * shape and lengths, one caption-idea line per text box, and that nothing is
 * lifted from the fetched Know Your Meme text (`data/descriptions.json`) or
 * repeated as boilerplate across templates. A full run also requires every live
 * (non-archived) template to have one. Exits non-zero on any problem.
 *
 *   tsx scripts/check-content.ts            # every content file
 *   tsx scripts/check-content.ts cinema ... # just these templates (boilerplate check still uses all)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CONTENT = join(ROOT, "data", "content");
const TEMPLATES = join(ROOT, "assets", "templates");
const fetched: Record<string, { about?: string; origin?: string }> = JSON.parse(
  readFileSync(join(ROOT, "data", "descriptions.json"), "utf8"),
);

const ALLOWED = new Set(["about", "origin", "usage", "ideas", "aka", "tags"]);
const SHINGLE = 7; // words in a row that count as copied
const BOILERPLATE_LIMIT = 3; // the same 8-word run in more files than this is boilerplate

const words = (text: string) =>
  text.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);
function shingles(text: string, size: number): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(" "));
  return out;
}

function boxCount(id: string): number {
  try {
    const config = parse(readFileSync(join(TEMPLATES, id, "config.yml"), "utf8")) as { text?: unknown[] };
    return Array.isArray(config?.text) && config.text.length ? config.text.length : 2;
  } catch {
    return 2;
  }
}

const all = existsSync(CONTENT) ? readdirSync(CONTENT).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
const only = process.argv.slice(2);
const ids = only.length ? only : all;
const errors: string[] = [];
const fail = (id: string, msg: string) => errors.push(`${id}: ${msg}`);
const entries = new Map<string, Record<string, unknown>>();

for (const id of all) {
  try {
    entries.set(id, JSON.parse(readFileSync(join(CONTENT, `${id}.json`), "utf8")));
  } catch (e) {
    if (ids.includes(id)) fail(id, `invalid JSON (${(e as Error).message})`);
  }
}

for (const id of ids) {
  const entry = entries.get(id);
  if (!entry) {
    if (!errors.some((e) => e.startsWith(`${id}:`))) fail(id, "no data/content file");
    continue;
  }
  if (!existsSync(join(TEMPLATES, id))) fail(id, "no such template in assets/templates");
  for (const key of Object.keys(entry)) if (!ALLOWED.has(key)) fail(id, `unknown field "${key}"`);

  const text = (key: string, min: number, max: number, required = true) => {
    const value = entry[key];
    if (value === undefined && !required) return "";
    if (typeof value !== "string") return fail(id, `"${key}" must be a string`), "";
    if (value.length < min || value.length > max) fail(id, `"${key}" is ${value.length} chars (want ${min}-${max})`);
    return value;
  };
  const about = text("about", 350, 900);
  const usage = text("usage", 250, 1100);
  const origin = text("origin", 60, 600, false);

  const ideas = entry.ideas;
  const boxes = boxCount(id);
  if (!Array.isArray(ideas) || ideas.length < 4 || ideas.length > 8) {
    fail(id, `"ideas" must be 4-8 captions`);
  } else {
    ideas.forEach((idea, i) => {
      if (!Array.isArray(idea) || idea.length !== boxes || idea.some((l) => typeof l !== "string"))
        fail(id, `idea ${i + 1} must be ${boxes} string(s), one per text box`);
      else if (idea.some((l) => l.length > 90)) fail(id, `idea ${i + 1} has a line over 90 chars`);
    });
  }
  for (const key of ["aka", "tags"]) {
    const v = entry[key];
    if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) fail(id, `"${key}" must be a list of strings`);
  }

  const source = `${fetched[id]?.about ?? ""} ${fetched[id]?.origin ?? ""}`;
  if (source.trim()) {
    const theirs = shingles(source, SHINGLE);
    const copied = [...shingles(`${about} ${origin} ${usage}`, SHINGLE)].filter((s) => theirs.has(s));
    if (copied.length) fail(id, `copies Know Your Meme wording: "${copied[0]}…"`);
  }
}

// Every live template needs original content (new templates included); see docs/template-content.md
if (!only.length) {
  for (const id of readdirSync(TEMPLATES).sort()) {
    if (id.startsWith("_") || id.startsWith(".") || !existsSync(join(TEMPLATES, id, "config.yml"))) continue;
    const config = parse(readFileSync(join(TEMPLATES, id, "config.yml"), "utf8")) as { archived?: boolean } | null;
    if (config?.archived === true) continue;
    if (!entries.has(id)) fail(id, "new template without original content: write data/content/" + id + ".json (docs/template-content.md)");
  }
}

// Boilerplate: an 8-word run shared by many files reads as template filler to search engines.
const seen = new Map<string, Set<string>>();
for (const [id, entry] of entries) {
  const body = [entry.about, entry.origin, entry.usage].filter((v) => typeof v === "string").join(" ");
  for (const s of shingles(body, 8)) {
    if (!seen.has(s)) seen.set(s, new Set());
    seen.get(s)!.add(id);
  }
}
for (const [s, owners] of seen) {
  if (owners.size > BOILERPLATE_LIMIT && [...owners].some((o) => ids.includes(o)))
    fail([...owners].filter((o) => ids.includes(o)).join(","), `boilerplate phrase in ${owners.size} files: "${s}"`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} problem(s) in data/content.`);
  process.exit(1);
}
console.log(`data/content OK (${ids.length} checked, ${all.length} total).`);

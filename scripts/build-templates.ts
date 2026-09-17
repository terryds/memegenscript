/**
 * Compile `assets/templates/<id>/config.yml` (plus the directory listing, which
 * determines the available styles) into a single JSON manifest that is bundled
 * into the Worker. Workers cannot list static assets at runtime, so this runs
 * before `wrangler dev` / `wrangler deploy` / tests.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const TEMPLATES = join(ROOT, "assets", "templates");
const OUTPUT = join(ROOT, "src", "generated", "templates.json");
const DESCRIPTIONS = join(ROOT, "data", "descriptions.json");
const MANUAL = join(ROOT, "data", "descriptions.manual.json");
const FEATURED = join(ROOT, "data", "featured.json");

const TEXT_DEFAULTS = {
  style: "upper",
  color: "white",
  font: "thick",
  anchor_x: 0.0,
  anchor_y: 0.0,
  angle: 0.0,
  scale_x: 1.0,
  scale_y: 0.2,
  align: "center",
  start: 0.0,
  stop: 1.0,
};

const OVERLAY_DEFAULTS = {
  center_x: 0.5,
  center_y: 0.5,
  angle: 0.0,
  scale: 0.25,
  start: 0.0,
  stop: 1.0,
};

type Raw = Record<string, unknown>;

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  return value === undefined || value === null ? fallback : String(value);
}

function buildText(raw: Raw | undefined) {
  const r = raw ?? {};
  return {
    style: str(r.style, TEXT_DEFAULTS.style),
    color: str(r.color, TEXT_DEFAULTS.color),
    font: str(r.font, TEXT_DEFAULTS.font),
    anchor_x: num(r.anchor_x, TEXT_DEFAULTS.anchor_x),
    anchor_y: num(r.anchor_y, TEXT_DEFAULTS.anchor_y),
    angle: num(r.angle, TEXT_DEFAULTS.angle),
    scale_x: num(r.scale_x, TEXT_DEFAULTS.scale_x),
    scale_y: num(r.scale_y, TEXT_DEFAULTS.scale_y),
    align: str(r.align, TEXT_DEFAULTS.align),
    start: num(r.start, TEXT_DEFAULTS.start),
    stop: num(r.stop, TEXT_DEFAULTS.stop),
  };
}

function buildOverlay(raw: Raw | undefined) {
  const r = raw ?? {};
  return {
    center_x: num(r.center_x, OVERLAY_DEFAULTS.center_x),
    center_y: num(r.center_y, OVERLAY_DEFAULTS.center_y),
    angle: num(r.angle, OVERLAY_DEFAULTS.angle),
    scale: num(r.scale, OVERLAY_DEFAULTS.scale),
    start: num(r.start, OVERLAY_DEFAULTS.start),
    stop: num(r.stop, OVERLAY_DEFAULTS.stop),
  };
}

interface Description {
  about?: string;
  origin?: string;
  tags?: string[];
  aka?: string[];
  title?: string;
  error?: string;
}

function readJson<T>(path: string): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : ({} as T);
}

const fetched = readJson<Record<string, Description>>(DESCRIPTIONS);
const featuredIds: string[] = readJson<{ featured?: string[] }>(FEATURED).featured ?? [];
const manual = readJson<Record<string, Description>>(MANUAL);

/** Hand-written entries win; otherwise use the fetched Know Your Meme summary. */
function describe(id: string, name: string) {
  const entry = manual[id] ?? (fetched[id] && !fetched[id].error ? fetched[id] : undefined);
  const source = manual[id] ? "manual" : entry ? "knowyourmeme" : "none";
  const aka = (entry?.aka ?? []).filter((alias) => alias.toLowerCase() !== name.toLowerCase());
  // Know Your Meme tags include contributor usernames and yearly lists; keep only readable topics.
  const tags = (entry?.tags ?? []).filter(
    (tag) => !/[_#\d]/.test(tag) && !/^(notables?|people|entries) of\b/i.test(tag) && tag.length >= 3 && tag.length <= 40,
  );
  return {
    about: entry?.about ?? "",
    origin: entry?.origin ?? "",
    tags,
    aka,
    descriptionSource: source,
  };
}

let missing = 0;
const manifest: Record<string, unknown> = {};

for (const id of readdirSync(TEMPLATES).sort()) {
  const directory = join(TEMPLATES, id);
  if (!statSync(directory).isDirectory()) continue;
  if (id.startsWith(".") || id.startsWith("_custom")) continue;

  let raw: Raw = {};
  try {
    raw = (parse(readFileSync(join(directory, "config.yml"), "utf8")) as Raw) ?? {};
  } catch {
    // A template directory without a config is still a template with defaults
  }

  const files = readdirSync(directory)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_") && name !== "config.yml")
    .filter((name) => !/\.\w+\.\w+$/.test(name)) // ignore generated `<stem>.<hash>.<ext>` files
    .sort();

  const text = Array.isArray(raw.text) && raw.text.length
    ? (raw.text as Raw[]).map(buildText)
    : [buildText(undefined), buildText({ anchor_x: 0.0, anchor_y: 0.8 })];

  const overlay = Array.isArray(raw.overlay) && raw.overlay.length
    ? (raw.overlay as Raw[]).map(buildOverlay)
    : [buildOverlay(undefined)];

  const example = Array.isArray(raw.example)
    ? (raw.example as unknown[]).map((line) => (line === null || line === undefined ? "" : String(line)))
    : ["Top Line", "Bottom Line"];

  const keywords = Array.isArray(raw.keywords)
    ? (raw.keywords as unknown[]).filter((k) => k !== null && k !== undefined && String(k).trim()).map(String)
    : [];

  const name = str(raw.name, "");
  const description = describe(id, name);
  if (!description.about && !id.startsWith("_")) {
    missing++;
    console.warn(`No description for template: ${id}`);
  }

  manifest[id] = {
    id,
    name,
    source: raw.source === undefined || raw.source === null ? null : String(raw.source).trim(),
    keywords,
    text,
    example,
    overlay,
    files,
    ...description,
    featured: featuredIds.indexOf(id) === -1 ? null : featuredIds.indexOf(id) + 1,
  };
}
const unknownFeatured = featuredIds.filter((id) => !manifest[id]);
if (unknownFeatured.length) console.warn(`Unknown featured template IDs: ${unknownFeatured.join(", ")}`);
if (missing) console.warn(`${missing} template(s) have no description`);

mkdirSync(join(ROOT, "src", "generated"), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(manifest));
console.log(`Wrote ${Object.keys(manifest).length} templates to ${OUTPUT}`);

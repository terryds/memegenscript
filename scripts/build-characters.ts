/**
 * Compile `assets/characters/<id>/config.yml` plus each cutout's dimensions into
 * the JSON manifest bundled into the Worker (Workers cannot list static assets
 * at runtime). Every `default.png` must be a real cutout: 8-bit RGBA with both
 * fully transparent and fully opaque pixels, or the build fails.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { parse } from "yaml";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CHARACTERS = join(ROOT, "assets", "characters");
const TEMPLATES = join(ROOT, "src", "generated", "templates.json");
const OUTPUT = join(ROOT, "src", "generated", "characters.json");

type Raw = Record<string, unknown>;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => v !== null && v !== undefined && String(v).trim()).map(String) : [];
}

// --- PNG inspection ------------------------------------------------------------

interface PngInfo {
  width: number;
  height: number;
  /** Share of pixels that are fully transparent / fully opaque */
  transparent: number;
  opaque: number;
}

/** Read an 8-bit RGBA PNG far enough to measure its alpha channel. */
function inspectPng(bytes: Buffer): PngInfo {
  const signature = "\x89PNG\r\n\x1a\n";
  if (bytes.subarray(0, 8).toString("latin1") !== signature) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      if (depth !== 8 || color !== 6) throw new Error(`must be 8-bit RGBA (found bit depth ${depth}, color type ${color})`);
      if (data[12] !== 0) throw new Error("interlaced PNGs are not supported");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let transparent = 0;
  let opaque = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0;
      const b = previous[i];
      const c = i >= 4 ? previous[i - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + predictor) & 0xff;
    }
    for (let i = 3; i < stride; i += 4) {
      if (line[i] === 0) transparent++;
      else if (line[i] === 255) opaque++;
    }
    previous = line;
  }
  const pixels = width * height;
  return { width, height, transparent: transparent / pixels, opaque: opaque / pixels };
}

// --- manifest ------------------------------------------------------------------

const templates = existsSync(TEMPLATES) ? (JSON.parse(readFileSync(TEMPLATES, "utf8")) as Record<string, unknown>) : {};
const manifest: Record<string, unknown> = {};
const problems: string[] = [];

for (const id of readdirSync(CHARACTERS).sort()) {
  const directory = join(CHARACTERS, id);
  if (!statSync(directory).isDirectory() || id.startsWith(".")) continue;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    problems.push(`${id}: directory name must be a lowercase slug`);
    continue;
  }

  let raw: Raw = {};
  try {
    raw = (parse(readFileSync(join(directory, "config.yml"), "utf8")) as Raw) ?? {};
  } catch {
    problems.push(`${id}: missing or invalid config.yml`);
    continue;
  }

  const image = join(directory, "default.png");
  if (!existsSync(image)) {
    problems.push(`${id}: missing default.png`);
    continue;
  }
  let info: PngInfo;
  try {
    info = inspectPng(readFileSync(image));
  } catch (e) {
    problems.push(`${id}: default.png ${(e as Error).message}`);
    continue;
  }
  // A cutout has a see-through background (not a tiny fringe) and solid content.
  if (info.transparent < 0.02 || info.opaque < 0.04) {
    problems.push(
      `${id}: default.png is not a transparent cutout (${Math.round(info.transparent * 100)}% transparent, ${Math.round(info.opaque * 100)}% opaque)`,
    );
    continue;
  }

  const name = String(raw.name ?? "").trim();
  if (!name) problems.push(`${id}: config.yml has no name`);
  const linked = strings(raw.templates);
  for (const templateId of linked) {
    if (!templates[templateId]) problems.push(`${id}: unknown template "${templateId}"`);
  }

  manifest[id] = {
    id,
    name,
    source: raw.source === undefined || raw.source === null ? null : String(raw.source).trim(),
    aka: strings(raw.aka).filter((alias) => alias.toLowerCase() !== name.toLowerCase()),
    keywords: strings(raw.keywords),
    about: String(raw.about ?? "").trim(),
    templates: linked,
    width: info.width,
    height: info.height,
  };
}

if (problems.length) {
  console.error(`Character build failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

mkdirSync(join(ROOT, "src", "generated"), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(manifest));
console.log(`Wrote ${Object.keys(manifest).length} characters to ${OUTPUT}`);

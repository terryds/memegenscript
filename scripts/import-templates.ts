/**
 * Import templates from a spec file: resolve the blank image on imgflip (by
 * template id or search), download and resize it, resolve the Know Your Meme
 * source, and write `assets/templates/<id>/config.yml`.
 *
 *   npx tsx scripts/import-templates.ts data/imports/batch-2026-09.json [--only=id,id] [--force]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const specPath = process.argv[2];
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const REKYM = process.argv.includes("--rekym");

type Box = [number, number, number, number, string?, string?, string?, string?];
interface Spec {
  id: string;
  name: string;
  imgflip: number | string;
  kym?: string;
  keywords?: string[];
  example: string[];
  boxes?: Box[];
  /** Explicit Know Your Meme URL ("" for none); skips resolution */
  source?: string;
}

const spec = JSON.parse(readFileSync(specPath, "utf8")) as { templates: Spec[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

let apiMemes: Array<{ id: string; name: string; url: string }> | null = null;
async function imgflipApi() {
  apiMemes ??= (JSON.parse(await get("https://api.imgflip.com/get_memes")) as { data: { memes: typeof apiMemes } }).data.memes!;
  return apiMemes;
}

/** Direct blank-image URL for an imgflip template id or search query. */
async function resolveImage(imgflip: number | string): Promise<{ url: string; page: string }> {
  let id = typeof imgflip === "number" ? String(imgflip) : "";
  let slug = "";
  if (id) {
    const hit = (await imgflipApi()).find((m) => m.id === id);
    if (hit) return { url: hit.url, page: `https://imgflip.com/memetemplate/${id}` };
  } else {
    const html = await get(`https://imgflip.com/memesearch?q=${encodeURIComponent(String(imgflip))}`);
    const match = /href="\/meme\/(\d+)\/([^"]+)"/.exec(html) ?? /href="\/memetemplate\/(\d+)\/([^"]+)"/.exec(html);
    if (!match) {
      // Results without ids link to /meme/<slug>; that page links the template with its id
      const slugOnly = /href="\/meme\/([^"/]+)"/.exec(html);
      if (!slugOnly) throw new Error(`No imgflip result for "${imgflip}"`);
      const page = await get(`https://imgflip.com/meme/${slugOnly[1]}`);
      const idMatch = /\/memetemplate\/(\d+)\/([^"']+)/.exec(page) ?? /"templateId":\s*"?(\d+)"?/.exec(page);
      if (!idMatch) throw new Error(`No template id for "${imgflip}"`);
      id = idMatch[1];
      slug = idMatch[2] ?? "";
    } else {
      id = match[1];
      slug = match[2];
    }
  }
  const page = `https://imgflip.com/memetemplate/${id}/${slug}`;
  const html = await get(page);
  const img = /i\.imgflip\.com\/([a-z0-9]+)\.(jpg|png|gif)/i.exec(html);
  if (!img) throw new Error(`No blank image on ${page}`);
  return { url: `https://i.imgflip.com/${img[1]}.${img[2]}`, page };
}

/** Resolve a Know Your Meme entry URL from a slug or a search query. */
async function resolveKym(kym: string | undefined, name: string): Promise<string> {
  const candidates = [kym, name].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const slugLike = /^[a-z0-9-]+$/.test(candidate);
    if (slugLike) {
      const url = `https://knowyourmeme.com/memes/${candidate}`;
      const response = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
      if (response.ok && /<h2 id="about">/.test(await response.text())) return response.url;
    }
    const html = await get(`https://knowyourmeme.com/search?q=${encodeURIComponent(candidate.replace(/-/g, " "))}&context=entries`);
    // Real results live in <section class="gallery">; links before it are trending/sidebar cards.
    const gallery = html.slice(html.indexOf('<section class="gallery"'));
    const match = /data-comments-link="(\/(?:sensitive\/)?memes\/(?!subcultures|cultures|people|sites|events)[a-z0-9-]+)#comments"/.exec(gallery);
    if (match) return `https://knowyourmeme.com${match[1]}`;
    await sleep(800);
  }
  return "";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function configFor(t: Spec, source: string): string {
  const boxes: Box[] = t.boxes ?? [
    [0, 0, 1, 0.2],
    [0, 0.8, 1, 0.2],
  ];
  const text = boxes
    .map(([x, y, w, h, style = "upper", color = "white", align = "center", font = "thick"]) =>
      [
        `  - style: ${style}`,
        `    color: ${color}`,
        `    font: ${font}`,
        `    anchor_x: ${x}`,
        `    anchor_y: ${y}`,
        `    angle: 0.0`,
        `    scale_x: ${w}`,
        `    scale_y: ${h}`,
        `    align: ${align}`,
        `    start: 0.0`,
        `    stop: 1.0`,
      ].join("\n"),
    )
    .join("\n");
  const keywords = (t.keywords ?? []).map((k) => `  - ${yamlString(k)}`).join("\n") || "  -";
  const example = t.example.map((e) => `  - ${yamlString(e)}`).join("\n");
  return `name: ${yamlString(t.name)}
source: ${source ? yamlString(source) : ""}
keywords:
${keywords}
text:
${text}
example:
${example}
overlay:
  - center_x: 0.5
    center_y: 0.5
    angle: 0.0
    scale: 0.25
    start: 0.0
    stop: 1.0
`;
}

const report: string[] = [];
for (const t of spec.templates) {
  if (ONLY && !ONLY.includes(t.id)) continue;
  const dir = join(ROOT, "assets", "templates", t.id);
  const configPath = join(dir, "config.yml");
  try {
    mkdirSync(dir, { recursive: true });
    let imageNote = "kept";
    const hasImage = ["jpg", "png", "gif"].some((ext) => existsSync(join(dir, `default.${ext}`)));
    if (!hasImage || FORCE) {
      const { url, page } = await resolveImage(t.imgflip);
      const bytes = new Uint8Array(await (await fetch(url, { headers: { "user-agent": UA } })).arrayBuffer());
      const ext = url.endsWith(".png") ? "png" : url.endsWith(".gif") ? "gif" : "jpg";
      const raw = join(dir, `default.${ext}`);
      writeFileSync(raw, bytes);
      if (ext !== "gif") {
        // Cap at 1000px wide, re-encode JPEG photos at quality 85
        const info = execFileSync("sips", ["-g", "pixelWidth", raw]).toString();
        const width = Number(/pixelWidth: (\d+)/.exec(info)?.[1] ?? 0);
        if (width > 1000) execFileSync("sips", ["--resampleWidth", "1000", raw]);
        if (ext === "jpg") execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", raw, "--out", raw]);
      }
      imageNote = `${url} (${page})`;
    }
    let source = "";
    if (t.source !== undefined) {
      source = t.source;
    } else {
      if (existsSync(configPath) && !FORCE && !REKYM) {
        source = /^source: "?([^"\n]*)"?/m.exec(readFileSync(configPath, "utf8"))?.[1] ?? "";
      }
      if (!source) source = await resolveKym(t.kym, t.name);
    }
    writeFileSync(configPath, configFor(t, source));
    report.push(`${t.id}: OK image=${imageNote} kym=${source || "NONE"}`);
    console.log(report[report.length - 1]);
  } catch (error) {
    report.push(`${t.id}: FAILED ${(error as Error).message}`);
    console.log(report[report.length - 1]);
  }
  await sleep(1000);
}
writeFileSync(join(ROOT, "data", "imports", "last-import.log"), report.join("\n") + "\n");

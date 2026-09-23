/**
 * Meme characters: the JSON API (`/characters`, `/characters/{id}`), the PNG
 * cutouts (`/characters/{id}.png`), and the HTML pages (`/meme-characters`,
 * `/meme-characters/{id}`).
 */
import type { AppContext } from "../context";
import { decodeImage, encodeToPng } from "../images/codecs";
import { resample, type Raster } from "../images/raster";
import { Character, CHARACTERS_PATH } from "../models/character";
import { assetVersion } from "../pages/assets";
import { characterCard, editorPath, page, templateCard, websiteJsonLd } from "../pages/cards";
import { escapeHtml, layout, notFoundPage, siteName } from "../pages/html";
import { error, image, json } from "../response";
import { cacheKeyFor, edgeCache } from "./helpers";

// --- JSON API ------------------------------------------------------------------

export async function index(app: AppContext): Promise<Response> {
  const search = (app.params.get("q") ?? "").trim();
  const characters = search ? Character.all().filter((c) => c.matchesText(search)) : Character.all();
  return json(characters.map((c) => c.toJSON(app.settings)));
}

export async function detail(app: AppContext, id: string): Promise<Response> {
  const character = Character.getOrNull(id);
  if (character) return json(character.toJSON(app.settings));
  return error(404, `Character not found: ${id}`);
}

// --- GET /characters/{id}.png ----------------------------------------------------

const MAXIMUM_SIZE = 2048;

/** Lanczos on straight alpha bleeds the (black) transparent pixels into the edges; premultiply first. */
function resizeCutout(raster: Raster, width: number, height: number): Raster {
  const premultiplied = { width: raster.width, height: raster.height, data: new Uint8ClampedArray(raster.data) };
  const src = premultiplied.data;
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255;
    src[i] *= a;
    src[i + 1] *= a;
    src[i + 2] *= a;
  }
  const resized = resample(premultiplied, width, height);
  const out = resized.data;
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a === 0) {
      out[i] = out[i + 1] = out[i + 2] = 0;
    } else if (a < 255) {
      out[i] = Math.min(255, Math.round((out[i] * 255) / a));
      out[i + 1] = Math.min(255, Math.round((out[i + 1] * 255) / a));
      out[i + 2] = Math.min(255, Math.round((out[i + 2] * 255) / a));
    }
  }
  return resized;
}

/** Parse `?width=`/`?height=`: 0 means "not set"; anything else outside 10..2048 is invalid. */
function parseSize(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  if (raw === null || raw === "") return 0;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return value === 0 || (value >= 10 && value <= MAXIMUM_SIZE) ? value : null;
}

export async function png(app: AppContext, id: string): Promise<Response> {
  const character = Character.getOrNull(id);
  if (!character) return error(404, `Character not found: ${id}`);
  const width = parseSize(app.params, "width");
  const height = parseSize(app.params, "height");
  if (width === null || height === null) return error(422, `width and height must be between 10 and ${MAXIMUM_SIZE}`);

  const { settings } = app;
  const cacheable = settings.CACHE_TTL > 0 && !settings.DEBUG;
  const cache = cacheable ? edgeCache() : null;
  const cacheKey = cacheKeyFor(app);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const asset = await app.env.ASSETS.fetch(new Request("https://assets.local" + character.path));
  if (!asset.ok) return error(404, `Character image not found: ${id}`);
  let bytes: Uint8Array = new Uint8Array(await asset.arrayBuffer());

  if (width || height) {
    // Fit inside the box while keeping the aspect ratio (a cutout is never padded or cropped)
    const ratio = character.width / character.height;
    let [w, h] = width && height ? (width / height > ratio ? [Math.round(height * ratio), height] : [width, Math.round(width / ratio)]) : width ? [width, Math.round(width / ratio)] : [Math.round(height * ratio), height];
    w = Math.max(1, w);
    h = Math.max(1, h);
    if (w !== character.width || h !== character.height) {
      const decoded = await decodeImage(bytes);
      bytes = await encodeToPng(resizeCutout(await decoded.first(), w, h));
    }
  }

  const headers: Record<string, string> = {
    "cache-control": cacheable ? `public, max-age=${settings.CACHE_TTL}` : "no-store",
  };
  if (app.params.has("download")) headers["content-disposition"] = `attachment; filename="${character.id}.png"`;
  const response = image(bytes, "image/png", 200, headers);
  if (cache) app.ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((e) => console.error(e)));
  return response;
}

// --- GET /meme-characters --------------------------------------------------------

function describeCharacter(character: Character): string {
  const parts = [`Download the ${character.name} meme character as a transparent PNG, free.`];
  if (character.about) parts.push(character.about);
  if (character.aka.length) parts.push(`Also known as ${character.aka.slice(0, 2).join(", ")}.`);
  return parts.join(" ").slice(0, 300);
}

export async function listPage(app: AppContext): Promise<Response> {
  const { settings } = app;
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  const query = (app.params.get("q") ?? "").trim().toLowerCase();
  const all = Character.all();
  const characters = query ? all.filter((c) => c.matchesText(query)) : all;
  const site = siteName(settings);
  const canonicalPath = query ? `${CHARACTERS_PATH}?q=${encodeURIComponent(query)}` : CHARACTERS_PATH;

  const title = query
    ? `"${query}" meme characters | ${site}`
    : `Meme Characters: ${all.length} Transparent PNG Cutouts to Download | ${site}`;
  const description = query
    ? `${characters.length} meme characters matching "${query}". Free transparent PNGs.`
    : `Download ${all.length} classic meme characters (Doge, Wojak, Pepe, Trollface, Gigachad and more) as free transparent PNG cutouts. No signup, no watermark. Also available through the API.`;

  const structuredData: unknown[] = [websiteJsonLd(settings)];
  if (!query) {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: settings.BASE_URL + CHARACTERS_PATH,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Meme templates", item: settings.BASE_URL + "/" },
          { "@type": "ListItem", position: 2, name: "Meme characters", item: settings.BASE_URL + CHARACTERS_PATH },
        ],
      },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: all.length,
        itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: c.buildPageUrl(settings) })),
      },
    });
  }

  const body = `<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Meme templates</a></li>
    <li aria-current="page">Meme characters</li>
  </ol>
</nav>
<section class="hero">
  ${query ? "" : `<span class="badge">${all.length} characters · transparent PNG</span>`}
  <h1>${query ? `Characters matching “${escapeHtml(query)}”` : "Meme characters.<br>Cut out. Ready to paste."}</h1>
  <p class="lede">${
    query
      ? `<a href="${CHARACTERS_PATH}">Browse all ${all.length} characters</a> or refine your search.`
      : `Doge, Wojak, Pepe, Trollface, Gigachad and friends as <strong>transparent PNGs</strong>. Download one, drop it into your own meme, sticker, or slide deck. Free, no signup, no watermark. Building something? They are in the <a href="/docs">API</a> too.`
  }</p>
  <form class="filter" action="${CHARACTERS_PATH}" method="get" role="search">
    <label class="visually-hidden" for="q">Filter characters</label>
    <input id="q" type="search" name="q" value="${escapeHtml(query)}" placeholder="Filter by name, alias or keyword…" autocomplete="off">
    <span class="filter-count" id="count" aria-live="polite" data-noun="character" data-noun-plural="characters">${characters.length} characters</span>
  </form>
</section>
<section aria-labelledby="all-title">
  <h2 id="all-title">${query ? "Results" : "All meme characters"}</h2>
  <ul class="grid" id="grid">
${characters.map((c, i) => characterCard(settings, c, { lazy: i > 11 })).join("\n")}
  </ul>
  <p class="empty" id="empty" ${characters.length ? "hidden" : ""}>Nothing matches. Try a name like “wojak” or a word like “frog”. <a href="${CHARACTERS_PATH}">Show all characters</a>.</p>
</section>
<section class="about">
  <h2>About these meme characters</h2>
  <p>Each character is a PNG with a transparent background, trimmed to the figure, so it drops cleanly onto any image or colour. They come from the same classic templates as the <a href="/">meme generator</a>; where a character has a template here, the two pages link to each other. Images belong to their respective owners.</p>
  <p>From code, list them with <code>GET /characters</code>, search with <code>GET /characters?q=frog</code>, and fetch any cutout at <code>/characters/{id}.png?width=400</code>. See the <a href="/docs">API docs</a> or the <a href="/agents">guide for AI agents</a>.</p>
</section>`;

  return page(
    settings,
    layout(
      settings,
      {
        title,
        description,
        canonical: settings.BASE_URL + canonicalPath,
        image: all.length ? all[0].buildImageUrl(settings, { width: 600 }) : undefined,
        robots: query ? "noindex, follow" : undefined,
        structuredData,
        scripts: ["index.js"],
        assetVersion: version,
      },
      body,
    ),
  );
}

// --- GET /meme-characters/{id} ---------------------------------------------------

/** Other characters to show: same templates first, then shared keywords, then alphabetical neighbours. */
function relatedCharacters(character: Character, all: Character[]): Character[] {
  const related = new Map<string, Character>();
  const add = (c: Character | undefined) => {
    if (c && c.id !== character.id && related.size < 8) related.set(c.id, c);
  };
  const words = new Set([...character.keywords, ...character.aka, character.name].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  for (const other of all) if (other.templateIds.some((t) => character.templateIds.includes(t))) add(other);
  for (const other of all) {
    const otherWords = [...other.keywords, ...other.aka, other.name].join(" ").toLowerCase().split(/[^a-z0-9]+/);
    if (otherWords.some((w) => words.has(w))) add(other);
  }
  const index = all.findIndex((c) => c.id === character.id);
  for (let step = 1; related.size < 8 && step < all.length; step++) {
    add(all[(index + step) % all.length]);
    add(all[(index - step + all.length) % all.length]);
  }
  return [...related.values()];
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function detailPage(app: AppContext, id: string): Promise<Response> {
  const { settings } = app;
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  const character = Character.getOrNull(id);
  if (!character) {
    return page(settings, notFoundPage(settings, `There is no meme character called "${id}".`, version), 404);
  }

  const site = siteName(settings);
  const all = Character.all();
  const canonical = character.buildPageUrl(settings);
  const imageUrl = character.buildImageUrl(settings);
  // Never upscale: small cutouts are served at their native size
  const previewWidth = Math.min(600, character.width);
  const previewUrl = character.buildImageUrl(settings, { width: previewWidth });
  const title = `${character.name} PNG: Transparent Meme Character | ${site}`;
  const description = describeCharacter(character);
  const templates = character.templates;
  const related = relatedCharacters(character, all);
  const source = character.source && /^https?:\/\//.test(character.source) ? character.source : "";
  const keywords = [character.name, ...character.aka, ...character.keywords, "meme character", "transparent png"].filter((k, i, arr) => arr.indexOf(k) === i);

  const structuredData = [
    websiteJsonLd(settings),
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: canonical,
      isPartOf: { "@type": "WebSite", name: site, url: settings.BASE_URL + "/" },
      primaryImageOfPage: {
        "@type": "ImageObject",
        contentUrl: imageUrl,
        url: imageUrl,
        name: `${character.name} meme character`,
        description: character.about || `${character.name} with a transparent background`,
        encodingFormat: "image/png",
        width: character.width,
        height: character.height,
      },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Meme templates", item: settings.BASE_URL + "/" },
          { "@type": "ListItem", position: 2, name: "Meme characters", item: settings.BASE_URL + CHARACTERS_PATH },
          { "@type": "ListItem", position: 3, name: character.name, item: canonical },
        ],
      },
      ...(source ? { citation: source } : {}),
      ...(character.aka.length ? { alternateName: character.aka } : {}),
      keywords: keywords.join(", "),
    },
  ];

  const keywordLinks = [...character.keywords, ...character.aka]
    .filter((k, i, arr) => arr.findIndex((o) => o.toLowerCase() === k.toLowerCase()) === i)
    .slice(0, 12)
    .map((k) => `<a class="tag" href="${CHARACTERS_PATH}?q=${encodeURIComponent(k.toLowerCase())}">${escapeHtml(k)}</a>`)
    .join(" ");

  const body = `<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Meme templates</a></li>
    <li><a href="${CHARACTERS_PATH}">Meme characters</a></li>
    <li aria-current="page">${escapeHtml(character.name)}</li>
  </ol>
</nav>
<article class="character" data-character="${escapeHtml(character.id)}">
  <header class="editor-header">
    <h1>${escapeHtml(character.name)} PNG</h1>
    <p class="lede">The ${escapeHtml(character.name)} meme character with a <strong>transparent background</strong>, ${character.width}×${character.height} px. Download it, copy it, or use it straight from the API.</p>
  </header>

  <div class="character-layout">
    <figure class="character-preview cutout">
      <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(character.name)} meme character PNG with transparent background" width="${previewWidth}" height="${Math.round(previewWidth * (character.height / character.width))}" decoding="async">
      <figcaption>Checkerboard shows the transparent area. It is not part of the download.</figcaption>
    </figure>
    <aside class="character-actions" aria-label="Download">
      <a class="button primary" href="/characters/${escapeHtml(character.id)}.png?download=1" download="${escapeHtml(character.id)}.png" data-action="download" data-method="download_png">Download PNG</a>
      <button type="button" class="button secondary" data-action="copy-image" data-method="copy_image">Copy image</button>
      <button type="button" class="button secondary" data-action="copy-link" data-method="copy_link">Copy image URL</button>
      <p class="me-hint" id="character-status" aria-live="polite"></p>
      <dl class="character-facts">
        <dt>Size</dt><dd>${character.width} × ${character.height} px</dd>
        <dt>Format</dt><dd>PNG, transparent background</dd>
        ${character.aka.length ? `<dt>Also known as</dt><dd>${character.aka.map(escapeHtml).join(", ")}</dd>` : ""}
        ${source ? `<dt>Source</dt><dd><a href="${escapeHtml(source)}" rel="nofollow noopener" target="_blank">${escapeHtml(hostname(source))}</a></dd>` : ""}
      </dl>
    </aside>
  </div>

  <section class="about">
    ${character.about ? `<h2>Who is ${escapeHtml(character.name)}?</h2>\n    <p>${escapeHtml(character.about)}</p>` : ""}
    <h2>Using the ${escapeHtml(character.name)} cutout</h2>
    <p>The PNG is trimmed to the figure, so it sits cleanly on any background: paste it into a meme, a chat, a slide, or a video. ${templates.length ? `To caption the original image instead, open the ${templates.map((t) => `<a href="${editorPath(t)}">${escapeHtml(t.name)}</a>`).join(" or ")} template in the meme generator.` : ""}</p>
    ${keywordLinks ? `<p class="tags">Related: ${keywordLinks}</p>` : ""}
    <h3>Use it from the API</h3>
    <p>Fetch the cutout at any size with <code>width</code> or <code>height</code>; the aspect ratio is kept:</p>
    <pre><code>${escapeHtml(character.buildImageUrl(settings, { width: 400 }))}</code></pre>
    <p><a href="/docs">Read the API documentation</a> · <a href="/characters/${escapeHtml(character.id)}">Character metadata (JSON)</a></p>
  </section>
${
  templates.length
    ? `
  <section class="related">
    <h2>${escapeHtml(character.name)} meme templates</h2>
    <p class="section-lede">Add your own caption to the original image.</p>
    <ul class="grid small">
${templates.map((t) => templateCard(settings, t)).join("\n")}
    </ul>
  </section>`
    : ""
}
  <section class="related">
    <h2>More meme characters</h2>
    <ul class="grid small">
${related.map((c) => characterCard(settings, c)).join("\n")}
    </ul>
    <p><a href="${CHARACTERS_PATH}">Browse all ${all.length} characters</a></p>
  </section>
</article>`;

  return page(
    settings,
    layout(
      settings,
      {
        title,
        description,
        canonical,
        image: previewUrl,
        imageAlt: `${character.name} meme character with a transparent background`,
        type: "article",
        structuredData,
        head: `<link rel="alternate" type="application/json" href="/characters/${escapeHtml(character.id)}">\n<link rel="preload" as="image" href="${escapeHtml(previewUrl)}">`,
        scripts: ["characters.js"],
        assetVersion: version,
      },
      body,
    ),
  );
}

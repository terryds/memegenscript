/**
 * Server-rendered pages: the template index (`/`), one meme editor per
 * template (`/memes/{slug}`; `/memes/{id}` redirects there), `sitemap.xml`, and `robots.txt`.
 */
import type { AppContext } from "../context";
import { Font } from "../models/font";
import { Template } from "../models/template";
import { assetVersion } from "../pages/assets";
import { escapeHtml, jsonForScript, layout, notFoundPage, siteName, templateRequestButtons, templateRequestLinks } from "../pages/html";
import { error, html, redirect } from "../response";
import { ALLOWED_EXTENSIONS, type Settings } from "../settings";
import { sha1Hex } from "../utils/sha1";
import { encode } from "../utils/text";
import { clean } from "../utils/urls";
import { download } from "../utils/http";
import { MIME_TYPES, sniffFormat } from "../images/format";

const PAGE_CACHE = "public, max-age=600, s-maxage=3600";

/** Pages are cacheable in production; locally always serve the current code. */
function pageCacheControl(settings: Settings): string {
  return settings.DEPLOYED ? PAGE_CACHE : "no-cache";
}

function page(settings: Settings, content: string, status = 200): Response {
  const response = html(content, status);
  response.headers.set("cache-control", pageCacheControl(settings));
  return response;
}

function editorPath(template: Template): string {
  return `/memes/${template.slug}`;
}

function editorUrl(settings: Settings, template: Template): string {
  return settings.BASE_URL + editorPath(template);
}

/** Static thumbnail (PNG, 300px) of the template's example meme. */
function thumbnailUrl(settings: Settings, template: Template, width = 300): string {
  return clean(`${settings.BASE_URL}/images/${template.id}/${encode(template.example)}.png?width=${width}`);
}

function exampleText(template: Template): string {
  return template.example.filter(Boolean).join(" / ");
}

/** First sentence of a text (used for meta descriptions). */
function firstSentence(text: string, max = 160): string {
  const match = /^[^.!?]+[.!?]+/.exec(text.trim());
  const sentence = (match ? match[0] : text).trim();
  return sentence.length > max ? sentence.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : sentence;
}

function describe(template: Template): string {
  const parts = [`Make your own "${template.name}" meme online for free.`];
  if (template.about) {
    parts.push(firstSentence(template.about, 200));
  } else {
    const example = exampleText(template);
    if (example) parts.push(`Example: "${example}".`);
  }
  if (template.aka.length) parts.push(`Also known as ${template.aka.slice(0, 2).join(", ")}.`);
  return parts.join(" ").slice(0, 300);
}

/** Deterministic set of related templates: alphabetical neighbours plus a stable sample. */
function relatedTemplates(template: Template, all: Template[]): Template[] {
  const index = all.findIndex((t) => t.id === template.id);
  const related = new Map<string, Template>();
  const add = (t: Template | undefined) => {
    if (t && t.id !== template.id) related.set(t.id, t);
  };
  add(all[(index - 1 + all.length) % all.length]);
  add(all[(index + 1) % all.length]);

  const words = new Set(
    [template.name, ...template.keywords, ...template.tags, ...template.aka]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
  for (const other of all) {
    if (related.size >= 8) break;
    const otherWords = [other.name, ...other.keywords, ...other.tags, ...other.aka].join(" ").toLowerCase().split(/[^a-z0-9]+/);
    if (otherWords.some((w) => words.has(w))) add(other);
  }

  for (const featured of Template.featured()) {
    if (related.size >= 8) break;
    add(featured);
  }
  let seed = Number.parseInt(sha1Hex(template.id).slice(0, 8), 16);
  while (related.size < 8 && all.length > related.size + 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    add(all[seed % all.length]);
  }
  return [...related.values()];
}

function templateCard(settings: Settings, template: Template, { lazy = true } = {}): string {
  const keywords = template.searchText.slice(0, 600);
  return `<li class="card" data-id="${escapeHtml(template.id)}" data-search="${escapeHtml(keywords)}">
  <a href="${editorPath(template)}">
    <img src="${escapeHtml(thumbnailUrl(settings, template))}" alt="${escapeHtml(template.name)} meme template" width="300" height="300"${lazy ? ' loading="lazy" decoding="async"' : ""}>
    <span class="card-title">${escapeHtml(template.name)}</span>
  </a>
</li>`;
}

function websiteJsonLd(settings: Settings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName(settings),
    url: settings.BASE_URL + "/",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${settings.BASE_URL}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

// --- GET / --------------------------------------------------------------------

export async function index(app: AppContext): Promise<Response> {
  const { settings } = app;
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  const query = (app.params.get("q") ?? "").trim().toLowerCase();
  const all = Template.browsable();
  const templates = query ? all.filter((t) => t.matchesText(query)) : all;
  const site = siteName(settings);
  const request = templateRequestLinks(settings);
  const requestButtons = templateRequestButtons(settings);

  const title = query
    ? `"${query}" meme templates | ${site}`
    : `Meme Generator: ${all.length} Free Meme Templates | ${site}`;
  const description = query
    ? `${templates.length} meme templates matching "${query}". Pick one and add your own text.`
    : `Create memes online for free. Choose from ${all.length} popular meme templates, add your text, and download or share the image. Also available as an API.`;

  const structuredData: unknown[] = [websiteJsonLd(settings)];
  if (!query) {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: settings.BASE_URL + "/",
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: all.length,
        itemListElement: all.map((t, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: t.name,
          url: editorUrl(settings, t),
        })),
      },
    });
  }

  const featured = query ? [] : Template.featured();
  const featuredSection = featured.length
    ? `<section class="featured" aria-labelledby="featured-title">
  <h2 id="featured-title">Featured memes</h2>
  <p class="section-lede">Certified bangers. Pick one and start typing.</p>
  <ul class="grid featured-grid">
${featured.map((t, i) => templateCard(settings, t, { lazy: i > 5 })).join("\n")}
  </ul>
</section>
`
    : "";

  const body = `<section class="hero">
  ${query ? "" : `<span class="badge">${all.length} templates · free · no signup</span>`}
  <h1>${query ? `Memes matching “${escapeHtml(query)}”` : "Make a meme.<br>Post it. Regret nothing."}</h1>
  <p class="lede">${
    query
      ? `<a href="/">Browse all ${all.length} templates</a> or refine your search.`
      : `Pick a template, smash in your text, drag it wherever you want, download. <strong>No signup, no watermark on downloads, no talent required.</strong> Not a human? Read the <a href="/agents">guide for AI agents</a>.`
  }</p>
  <form class="filter" action="/" method="get" role="search">
    <label class="visually-hidden" for="q">Filter templates</label>
    <input id="q" type="search" name="q" value="${escapeHtml(query)}" placeholder="Filter by name, keyword or example text…" autocomplete="off">
    <span class="filter-count" id="count" aria-live="polite">${templates.length} templates</span>
  </form>
  ${requestButtons ? `<div class="request">
    <span>Can’t find your meme?</span>
    ${requestButtons}
  </div>` : ""}
</section>
${featuredSection}<section aria-labelledby="all-title">
  <h2 id="all-title">${query ? "Results" : "All meme templates"}</h2>
  <ul class="grid" id="grid">
${templates.map((t, i) => templateCard(settings, t, { lazy: i > 11 })).join("\n")}
  </ul>
  <p class="empty" id="empty" ${templates.length ? "hidden" : ""}>Nothing matches. Try describing the meme, like “dog burning room”. <a href="/">Show all templates</a>.${request.form ? ` Still missing? <a href="${escapeHtml(request.form)}" rel="noopener" target="_blank">Request it</a> and we’ll add it.` : ""}</p>
</section>
<section class="about">
  <h2>About this meme generator</h2>
  <p>${escapeHtml(site)} is a free, open source meme generator. Each template page lets you add your own text, choose a font, style, and layout, and preview the result live. The same images are available programmatically through the <a href="/docs">meme API</a>: every meme is just a URL like <code>/images/buzz/memes/memes_everywhere.png</code>.</p>
</section>`;

  return page(
    settings,
    layout(
      settings,
      {
        title,
        description,
        canonical: settings.BASE_URL + (query ? `/?q=${encodeURIComponent(query)}` : "/"),
        robots: query ? "noindex, follow" : undefined,
        structuredData,
        scripts: ["index.js"],
        assetVersion: version,
      },
      body,
    ),
  );
}

export async function memesIndex(): Promise<Response> {
  return redirect("/", 301);
}

// --- GET /memes/{slug} ---------------------------------------------------------

export async function detail(app: AppContext, slug: string): Promise<Response> {
  const { settings } = app;
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  let template = Template.getBySlug(slug);
  if (!template) {
    // Old id-based URLs (/memes/kittens) and slugs from before a rename (/memes/roll-safe)
    // live on as permanent redirects to the current name-based page
    const moved = Template.getByFormerSlug(slug) ?? Template.getOrNull(slug);
    if (moved && moved.valid && moved.slug !== slug) {
      const url = new URL(app.request.url);
      return redirect(editorPath(moved) + url.search, 301);
    }
    template = moved;
  }
  if (!template || !template.valid) {
    return page(settings, notFoundPage(settings, `There is no meme template called "${slug}".`, version), 404);
  }

  const site = siteName(settings);
  const all = Template.browsable();
  const canonical = editorUrl(settings, template);
  const exampleUrl = template.buildExampleUrl(settings);
  const exampleStill = clean(`${settings.BASE_URL}/images/${template.id}/${encode(template.example)}.png`);
  const title = `${template.name} Meme Generator | ${site}`;
  const description = describe(template);
  const lines = template.text.length;
  const styles = template.styles.length ? template.styles : ["default"];
  const fonts = Font.all();
  const defaultExtension = template.defaultExtension(settings);
  const related = relatedTemplates(template, all);
  const source = template.source && /^https?:\/\//.test(template.source) ? template.source : "";

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
        contentUrl: exampleStill,
        url: exampleStill,
        name: `${template.name} meme example`,
        caption: exampleText(template),
      },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Meme templates", item: settings.BASE_URL + "/" },
          { "@type": "ListItem", position: 2, name: template.name, item: canonical },
        ],
      },
      potentialAction: {
        "@type": "CreateAction",
        name: `Create a ${template.name} meme`,
        target: canonical,
      },
      ...(source ? { citation: source } : {}),
      ...(template.aka.length ? { alternateName: template.aka } : {}),
      keywords: [template.name, ...template.aka, ...template.keywords, ...template.tags, "meme", "meme generator"]
        .filter((k, i, arr) => arr.indexOf(k) === i)
        .join(", "),
    },
  ];

  const fontMap: Record<string, string> = { thick: "titilliumweb", thin: "titilliumweb-thin", comic: "kalam" };
  const images = template.files
    .filter((file) => /\.(png|jpe?g|gif|webp)$/i.test(file))
    .map((file) => ({ style: file.replace(/\.[^.]+$/, ""), url: `/assets/templates/${template.id}/${file}` }))
    .sort((a, b) => (a.style === "default" ? -1 : b.style === "default" ? 1 : a.style.localeCompare(b.style)));
  const config = {
    id: template.id,
    name: template.name,
    images,
    example: template.example,
    boxes: template.text.map((text, index) => ({
      x: text.anchor_x,
      y: text.anchor_y,
      w: text.scale_x,
      h: text.scale_y,
      font: fontMap[text.font] ?? text.font,
      color: text.color,
      align: text.align,
      angle: text.angle,
      uppercase: text.style === "upper",
      placeholder: template.example[index] ?? `Text ${index + 1}`,
    })),
    fonts: fonts.map((f) => ({ id: f.id, label: f.alias ? `${f.id} (${f.alias})` : f.id, url: `/assets/fonts/${encodeURIComponent(f.filename)}` })),
  };

  const textInputs = Array.from({ length: lines }, (_, i) => {
    const placeholder = template.example[i] ?? "";
    return `<label class="field"><span>Line ${i + 1}</span><input type="text" name="text[]" placeholder="${escapeHtml(placeholder)}" maxlength="200"></label>`;
  }).join("\n");

  const tagList = [...template.keywords, ...template.tags].filter((k, i, arr) => arr.findIndex((o) => o.toLowerCase() === k.toLowerCase()) === i).slice(0, 14);
  const keywordLinks = tagList
    .map((k) => `<a class="tag" href="/?q=${encodeURIComponent(k.toLowerCase())}">${escapeHtml(k)}</a>`)
    .join(" ");
  const attribution =
    template.descriptionSource === "knowyourmeme" && source
      ? ` <span class="attribution">(summary via <a href="${escapeHtml(source)}" rel="nofollow noopener" target="_blank">Know Your Meme</a>)</span>`
      : "";
  const aboutSection = template.about
    ? `<h2>What is the ${escapeHtml(template.name)} meme?</h2>
    <p>${escapeHtml(template.about)}${attribution}</p>
    ${template.origin ? `<p><strong>Origin:</strong> ${escapeHtml(template.origin)}</p>` : ""}
    ${template.aka.length ? `<p><strong>Also known as:</strong> ${template.aka.map(escapeHtml).join(", ")}.</p>` : ""}`
    : "";

  const body = `<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Meme templates</a></li>
    <li aria-current="page">${escapeHtml(template.name)}</li>
  </ol>
</nav>
<article class="editor">
  <header class="editor-header">
    <h1>${escapeHtml(template.name)} Meme Generator</h1>
    <p class="lede">Drag text anywhere on the ${escapeHtml(template.name)} template, style every box its own way, drop in your own images, then <strong>download, copy, or share it</strong>.${template.animatedImage ? " Animated GIF versions are available through the API." : ""}</p>
  </header>

  <div id="meme-editor" class="me" data-config="${escapeHtml(jsonForScript(config))}">
    <div class="me-stage-wrap">
      <div class="me-toolbar" role="toolbar" aria-label="Editor tools">
        <button type="button" class="me-btn" data-action="add-text">+ Text</button>
        <label class="me-btn me-file">+ Image<input type="file" accept="image/*" data-action="add-image-file" hidden></label>
        <button type="button" class="me-btn" data-action="add-image-url">+ Image URL</button>
        <span class="me-spacer"></span>
        <button type="button" class="me-btn" data-action="undo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button type="button" class="me-btn" data-action="redo" title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>
        <button type="button" class="me-btn" data-action="reset" title="Reset to template">Reset</button>
      </div>
      <div class="me-stage">
        <canvas id="me-canvas" aria-label="Meme canvas: drag text and images to move them"></canvas>
        <noscript>
          <img src="${escapeHtml(exampleStill)}?width=600" alt="${escapeHtml(template.name)} meme: ${escapeHtml(exampleText(template))}">
          <form method="post" action="/images">
            <input type="hidden" name="template_id" value="${escapeHtml(template.id)}">
            <input type="hidden" name="redirect" value="true">
            ${textInputs}
            <button type="submit">Generate meme</button>
          </form>
        </noscript>
      </div>
      <p class="me-hint" id="me-status" aria-live="polite">Click a text box to edit it. Drag to move, corners resize, top handle rotates.</p>
    </div>

    <aside class="me-panel" aria-label="Editor settings">
      <section class="me-section">
        <h2>Background</h2>
        <div class="me-row">
          <select id="me-background" aria-label="Template image"></select>
          <label class="me-btn me-file">Upload<input type="file" accept="image/*" data-action="background-file" hidden></label>
          <button type="button" class="me-btn" data-action="background-blank">Blank</button>
        </div>
      </section>

      <section class="me-section">
        <h2>Layers</h2>
        <ul class="me-layers" id="me-layers"></ul>
      </section>

      <section class="me-section me-props" id="me-props" hidden>
        <h2 id="me-props-title">Text</h2>
        <div data-for="text">
          <label class="field"><span>Text</span><textarea id="me-text" rows="2" maxlength="500"></textarea></label>
          <div class="me-grid2">
            <label class="field"><span>Font</span><select id="me-font"></select></label>
            <label class="field"><span>Size <small id="me-size-value"></small></span>
              <span class="me-inline"><input type="checkbox" id="me-auto-size" checked> <span>Auto</span> <input type="range" id="me-size" min="8" max="300" step="1"></span>
            </label>
            <label class="field"><span>Text color</span><input type="color" id="me-color" value="#ffffff"></label>
            <label class="field"><span>Outline color</span><input type="color" id="me-stroke-color" value="#000000"></label>
            <label class="field"><span>Outline width <small id="me-stroke-value"></small></span><input type="range" id="me-stroke" min="0" max="40" step="1"></label>
            <label class="field"><span>Opacity</span><input type="range" id="me-opacity" min="0.1" max="1" step="0.05"></label>
          </div>
          <div class="me-row">
            <div class="me-seg" role="group" aria-label="Horizontal alignment">
              <button type="button" data-align="left" title="Align left">⟸</button>
              <button type="button" data-align="center" title="Center">≡</button>
              <button type="button" data-align="right" title="Align right">⟹</button>
            </div>
            <div class="me-seg" role="group" aria-label="Vertical alignment">
              <button type="button" data-valign="top" title="Top">⤒</button>
              <button type="button" data-valign="middle" title="Middle">↕</button>
              <button type="button" data-valign="bottom" title="Bottom">⤓</button>
            </div>
            <label class="me-inline"><input type="checkbox" id="me-uppercase"> <span>UPPERCASE</span></label>
          </div>
        </div>
        <div data-for="image">
          <label class="field"><span>Opacity</span><input type="range" id="me-image-opacity" min="0.1" max="1" step="0.05"></label>
          <label class="me-inline"><input type="checkbox" id="me-flip"> <span>Flip horizontally</span></label>
        </div>
        <label class="field"><span>Rotation <small id="me-angle-value"></small></span><input type="range" id="me-angle" min="-180" max="180" step="1"></label>
        <div class="me-row">
          <button type="button" class="me-btn" data-action="layer-up" title="Bring forward">▲</button>
          <button type="button" class="me-btn" data-action="layer-down" title="Send backward">▼</button>
          <button type="button" class="me-btn" data-action="duplicate">Duplicate</button>
          <button type="button" class="me-btn danger" data-action="delete">Delete</button>
        </div>
      </section>

      <section class="me-section me-export">
        <h2>Export</h2>
        <div class="me-row">
          <button type="button" class="primary" data-action="download-png">Download PNG</button>
          <button type="button" class="me-btn" data-action="download-jpg">Download JPG</button>
          <button type="button" class="me-btn" data-action="copy-image">Copy image</button>
          <button type="button" class="me-btn" data-action="copy-link">Copy editor link</button>
        </div>
      </section>
    </aside>
  </div>

  <section class="about">
    ${aboutSection}
    <h2>About the ${escapeHtml(template.name)} meme template</h2>
    <p>The <strong>${escapeHtml(template.name)}</strong> template (<code>${escapeHtml(template.id)}</code>) supports ${lines} line${lines === 1 ? "" : "s"} of text${styles.length > 1 ? ` and ${styles.length} styles (${styles.map(escapeHtml).join(", ")})` : ""}.${template.example.some(Boolean) ? ` A classic example reads “${escapeHtml(exampleText(template))}”.` : ""}${source ? ` Read about its origin on <a href="${escapeHtml(source)}" rel="nofollow noopener" target="_blank">${escapeHtml(new URL(source).hostname.replace(/^www\./, ""))}</a>.` : ""}</p>
    ${keywordLinks ? `<p class="tags">Related searches: ${keywordLinks}</p>` : ""}
    <h3>Use it from the API</h3>
    <p>This meme is also just a URL. Replace the text in the path to generate your own image:</p>
    <pre><code>${escapeHtml(exampleUrl)}</code></pre>
    <p><a href="/docs">Read the API documentation</a> · <a href="/templates/${escapeHtml(template.id)}">Template metadata (JSON)</a></p>
  </section>

  <section class="related">
    <h2>More meme templates</h2>
    <ul class="grid small">
${related.map((t) => templateCard(settings, t)).join("\n")}
    </ul>
    <p><a href="/">Browse all ${all.length} templates</a></p>
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
        image: exampleStill,
        imageAlt: `${template.name} meme: ${exampleText(template)}`,
        type: "article",
        robots: template.archived ? "noindex, follow" : undefined,
        structuredData,
        head: `<link rel="alternate" type="application/json" href="/templates/${escapeHtml(template.id)}">\n<link rel="preload" as="image" href="${escapeHtml(exampleStill)}?width=600">`,
        scripts: ["editor.js"],
        assetVersion: version,
      },
      body,
    ),
  );
}

// --- sitemap.xml / robots.txt --------------------------------------------------

export async function sitemap(app: AppContext): Promise<Response> {
  const { settings } = app;
  const urls = [
    { loc: settings.BASE_URL + "/", priority: "1.0", changefreq: "weekly" },
    { loc: settings.BASE_URL + "/agents", priority: "0.9", changefreq: "monthly" },
    { loc: settings.BASE_URL + "/privacy", priority: "0.3", changefreq: "yearly" },
    ...Template.browsable().map((t) => ({ loc: editorUrl(settings, t), priority: "0.8", changefreq: "monthly" })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": pageCacheControl(settings) },
  });
}

export async function robots(app: AppContext): Promise<Response> {
  const body = `User-agent: *
Allow: /
Disallow: /docs
Disallow: /examples
Disallow: /images/preview.jpg

Sitemap: ${app.settings.BASE_URL}/sitemap.xml
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": pageCacheControl(app.settings) } });
}

// --- /static/* -----------------------------------------------------------------

export async function staticAsset(app: AppContext, path: string): Promise<Response> {
  if (path.includes("..")) return error(404, "Not found");
  const response = await app.env.ASSETS.fetch(new Request("https://assets.local/static/" + path));
  if (!response.ok) return error(404, `Not found: /static/${path}`);
  const headers = new Headers(response.headers);
  headers.set("cache-control", app.params.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  return new Response(response.body, { status: 200, headers });
}

// --- /assets/{templates|fonts}/... ----------------------------------------------

/** Raw template images and font files for the in-browser editor. */
export async function rawAsset(app: AppContext, kind: string, first: string, second: string): Promise<Response> {
  const path = second ? `/${kind}/${first}/${second}` : `/${kind}/${first}`;
  if (path.includes("..") || /\.(yml|yaml|txt)$/i.test(path)) return error(404, "Not found");
  const response = await app.env.ASSETS.fetch(new Request("https://assets.local" + path));
  if (!response.ok) return error(404, `Not found: ${path}`);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=86400");
  if (/\.ttc$/i.test(path)) headers.set("content-type", "font/collection");
  return new Response(response.body, { status: 200, headers });
}

// --- /proxy/image?url= ----------------------------------------------------------

const PROXY_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Fetch a remote image so the browser can draw it on the canvas without CORS
 * tainting. Only http(s) URLs that resolve to a real image under 10 MB are served.
 */
export async function imageProxy(app: AppContext): Promise<Response> {
  const url = app.params.get("url") ?? "";
  if (!/^https?:\/\//i.test(url)) return error(400, "A http(s) image URL is required");
  const result = await download(url, app.settings.CACHE_TTL);
  if (!result) return error(415, "Unable to download the image");
  if (result.bytes.length > PROXY_MAX_BYTES) return error(413, "Image is larger than 10 MB");
  const format = sniffFormat(result.bytes);
  if (!format) return error(415, "The URL is not an image");
  return new Response(result.bytes as Uint8Array<ArrayBuffer>, {
    headers: { "content-type": MIME_TYPES[format], "cache-control": "public, max-age=3600" },
  });
}

/** Building blocks shared by the server-rendered pages: URLs, grid cards, cache headers, JSON-LD. */
import { Character } from "../models/character";
import type { Template } from "../models/template";
import { html } from "../response";
import type { Settings } from "../settings";
import { encode } from "../utils/text";
import { clean } from "../utils/urls";
import { escapeHtml, siteName } from "./html";

const PAGE_CACHE = "public, max-age=600, s-maxage=3600";

/** Pages are cacheable in production; locally always serve the current code. */
export function pageCacheControl(settings: Settings): string {
  return settings.DEPLOYED ? PAGE_CACHE : "no-cache";
}

export function page(settings: Settings, content: string, status = 200): Response {
  const response = html(content, status);
  response.headers.set("cache-control", pageCacheControl(settings));
  return response;
}

export function editorPath(template: Template): string {
  return `/memes/${template.slug}`;
}

export function editorUrl(settings: Settings, template: Template): string {
  return settings.BASE_URL + editorPath(template);
}

/** Static thumbnail (PNG, 300px) of the template's example meme. */
export function thumbnailUrl(settings: Settings, template: Template, width = 300): string {
  return clean(`${settings.BASE_URL}/images/${template.id}/${encode(template.example)}.png?width=${width}`);
}

export function templateCard(settings: Settings, template: Template, { lazy = true } = {}): string {
  const keywords = template.searchText.slice(0, 600);
  return `<li class="card" data-id="${escapeHtml(template.id)}" data-search="${escapeHtml(keywords)}">
  <a href="${editorPath(template)}">
    <img src="${escapeHtml(thumbnailUrl(settings, template))}" alt="${escapeHtml(template.name)} meme template" width="300" height="300"${lazy ? ' loading="lazy" decoding="async"' : ""}>
    <span class="card-title">${escapeHtml(template.name)}</span>
  </a>
</li>`;
}

/** A character cutout on a checkerboard, linking to its page. */
export function characterCard(settings: Settings, character: Character, { lazy = true } = {}): string {
  const keywords = character.searchText.slice(0, 600);
  return `<li class="card cutout" data-id="${escapeHtml(character.id)}" data-search="${escapeHtml(keywords)}">
  <a href="${character.pagePath}">
    <img src="${escapeHtml(character.buildImageUrl(settings, { width: 300 }))}" alt="${escapeHtml(character.name)} meme character PNG with transparent background" width="300" height="300"${lazy ? ' loading="lazy" decoding="async"' : ""}>
    <span class="card-title">${escapeHtml(character.name)}</span>
  </a>
</li>`;
}

export function websiteJsonLd(settings: Settings) {
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

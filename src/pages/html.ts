/** HTML page shell and helpers for the server-rendered pages. */
import type { Settings } from "../settings";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON safe to embed inside a `<script>` element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Where visitors can ask for a template that isn't in the library ("" when disabled) */
export function templateRequestLinks(settings: Settings): { form: string; issue: string } {
  return {
    form: settings.REQUEST_TEMPLATE_URL,
    issue: settings.REPO_URL ? `${settings.REPO_URL.replace(/\/$/, "")}/issues/new?template=template-request.yml` : "",
  };
}

/** "Request a template" buttons: the request form, plus a GitHub issue as an alternative */
export function templateRequestButtons(settings: Settings): string {
  const { form, issue } = templateRequestLinks(settings);
  return [
    form ? `<a class="button primary" href="${escapeHtml(form)}" rel="noopener" target="_blank">Request a template</a>` : "",
    issue ? `<a class="button secondary" href="${escapeHtml(issue)}" rel="noopener" target="_blank">Request on GitHub</a>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL */
  canonical: string;
  /** Absolute image URL for social cards */
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
  robots?: string;
  /** JSON-LD objects to embed */
  structuredData?: unknown[];
  /** Extra `<link>`/`<meta>` markup */
  head?: string;
  /** Client scripts (paths under /static) */
  scripts?: string[];
  /** Content hash of the static assets, from `assetVersion()` */
  assetVersion: string;
}

export function siteName(settings: Settings): string {
  return settings.SITE_NAME;
}

export function staticUrl(path: string, version: string): string {
  return `/static/${path}?v=${encodeURIComponent(version)}`;
}

/** A simple HTML 404 page for the browsable routes. */
export function notFoundPage(settings: Settings, message: string, assetVersion: string): string {
  return layout(
    settings,
    {
      title: `Page not found | ${siteName(settings)}`,
      description: "The page you requested does not exist.",
      canonical: settings.BASE_URL + "/404",
      robots: "noindex",
      assetVersion,
    },
    `<section class="hero"><h1>404: meme not found</h1><p class="lede">${escapeHtml(message)}</p><p><a href="/" class="button">Browse all meme templates</a></p></section>`,
  );
}

/**
 * Google Analytics 4 loader; empty when no measurement ID is configured. The page URL is
 * reported without its hash: editor share links keep the meme text there (see /privacy).
 */
export function analyticsSnippet(settings: Settings): string {
  const id = settings.GA_MEASUREMENT_ID;
  if (!id) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${id}",{page_location:location.origin+location.pathname+location.search});</script>`;
}

export function layout(settings: Settings, meta: PageMeta, body: string): string {
  const site = siteName(settings);
  const request = templateRequestLinks(settings);
  const image = meta.image ?? `${settings.BASE_URL}/images/buzz/memes/memes_everywhere.png`;
  const structured = (meta.structuredData ?? [])
    .map((data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`)
    .join("\n");
  const scripts = [...(meta.scripts ?? []), "pwa.js"].map((path) => `<script src="${staticUrl(path, meta.assetVersion)}" defer></script>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<meta name="robots" content="${escapeHtml(meta.robots ?? "index, follow, max-image-preview:large")}">
<link rel="canonical" href="${escapeHtml(meta.canonical)}">
<meta property="og:site_name" content="${escapeHtml(site)}">
<meta property="og:type" content="${meta.type ?? "website"}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(meta.canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
${meta.imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="theme-color" content="#0d0b1a">
<meta name="ahrefs-site-verification" content="a617d2d8650e7ebf5a83ebf53b250098c2397bd48f0e682ab99bd75fe3986023">
<link rel="icon" href="/favicon.ico">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="help" type="text/markdown" href="/llms.txt" title="Guide for AI agents">
<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(site)}">
<meta name="mobile-web-app-capable" content="yes">
<link rel="stylesheet" href="${staticUrl("site.css", meta.assetVersion)}">
${meta.head ?? ""}
${structured}
${scripts}
${analyticsSnippet(settings)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <nav class="container nav" aria-label="Main">
    <a class="brand" href="/">${escapeHtml(site)}</a>
    <form class="nav-search" action="/" method="get" role="search">
      <label class="visually-hidden" for="nav-q">Search meme templates</label>
      <input id="nav-q" type="search" name="q" placeholder="Search meme templates…" autocomplete="off">
    </form>
    <a class="nav-link nav-link-templates" href="/">Templates</a>
    <a class="nav-link nav-link-characters" href="/meme-characters">Characters</a>
    <a class="nav-link" href="/docs">API</a>
    <a class="nav-link nav-link-agents" href="/agents">AI agents</a>
    ${settings.REPO_URL ? `<a class="nav-link nav-link-secondary" href="${escapeHtml(settings.REPO_URL)}" rel="noopener" target="_blank" aria-label="Source code on GitHub">GitHub</a>` : ""}
  </nav>
</header>
<main id="main" class="container">
${body}
</main>
<aside id="install-banner" class="install-banner" hidden role="complementary" aria-label="Install app">
  <img src="/static/icons/icon-192.png" alt="" width="44" height="44">
  <div class="install-text"><strong>Install ${escapeHtml(site)}</strong><span data-hint>Add the meme editor to your home screen. Works offline.</span></div>
  <button type="button" class="primary" data-install>Install</button>
  <button type="button" class="install-close" data-close aria-label="Dismiss">×</button>
</aside>
<footer class="site-footer">
  <div class="container">
    <p><strong>${escapeHtml(site)}</strong> · a free, open source meme generator · <a href="/meme-characters">meme characters</a> · <a href="/docs">API docs</a> · <a href="/agents">guide for AI agents</a> · <a href="/privacy">privacy</a>${settings.CONTACT_EMAIL ? ` · <a href="/contact">contact</a>` : ""}${settings.REPO_URL ? ` · <a href="${escapeHtml(settings.REPO_URL)}" rel="noopener">source on GitHub</a>` : ""}${request.form ? ` · <a href="${escapeHtml(request.form)}" rel="noopener" target="_blank">request a template</a>` : ""} · made with questionable judgment</p>
  </div>
</footer>
</body>
</html>`;
}

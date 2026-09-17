/** PWA endpoints: web app manifest, service worker, and the offline page. */
import type { AppContext } from "../context";
import { assetVersion } from "../pages/assets";
import { escapeHtml, layout, siteName } from "../pages/html";
import { error, html } from "../response";

export async function manifest(app: AppContext): Promise<Response> {
  const site = siteName(app.settings);
  const data = {
    id: "/",
    name: `${site}: Meme Generator`,
    short_name: site,
    description: "Free meme generator: drag-and-drop editor for hundreds of templates, plus a meme API.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0d0b1a",
    theme_color: "#0d0b1a",
    lang: "en",
    categories: ["entertainment", "photo", "social"],
    icons: [
      { src: "/static/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/static/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/static/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Featured memes", url: "/?source=pwa#featured-title", icons: [{ src: "/static/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Search templates", url: "/?source=pwa#q", icons: [{ src: "/static/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  });
}

/** The service worker script, with the cache version bound to the asset hash. */
export async function serviceWorker(app: AppContext): Promise<Response> {
  const response = await app.env.ASSETS.fetch(new Request("https://assets.local/static/sw.js"));
  if (!response.ok) return error(404, "Service worker not found");
  const version = await assetVersion(app.env.ASSETS, { memoize: app.settings.DEPLOYED });
  const source = (await response.text()).replace("__VERSION__", version);
  return new Response(source, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
      "service-worker-allowed": "/",
    },
  });
}

export async function offline(app: AppContext): Promise<Response> {
  const { settings } = app;
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  const body = `<section class="hero">
  <h1>You're offline</h1>
  <p class="lede">This page isn't cached yet. Templates you've opened before still work offline; anything new needs a connection.</p>
  <p><a class="button" href="/">Back to the templates</a></p>
</section>`;
  const page = layout(
    settings,
    {
      title: `Offline | ${siteName(settings)}`,
      description: "Offline fallback page.",
      canonical: settings.BASE_URL + "/offline",
      robots: "noindex",
      assetVersion: version,
    },
    body,
  );
  const response = html(page);
  response.headers.set("cache-control", "no-cache");
  return response;
}

export { escapeHtml };

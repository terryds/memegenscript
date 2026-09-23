/**
 * memegenscript — the memegen.link API on Cloudflare Workers.
 * Port of `app/main.py` + `app/config.py`: routing, CORS, docs, and errors.
 */
import type { AppContext } from "./context";
import { buildOpenApi } from "./docs/openapi";
import { swaggerPage } from "./docs/swagger";
import * as helpers from "./helpers";
import { error, html, json, redirect } from "./response";
import { Router, SLUG } from "./router";
import { resolveSettings, type EnvVars } from "./settings";
import { gallery } from "./utils/html";
import * as agents from "./views/agents";
import * as characters from "./views/characters";
import * as clients from "./views/clients";
import * as editor from "./views/editor";
import * as contact from "./views/contact";
import * as privacy from "./views/privacy";
import * as pwa from "./views/pwa";
import * as examples from "./views/examples";
import * as fonts from "./views/fonts";
import * as images from "./views/images";
import * as shortcuts from "./views/shortcuts";
import * as templates from "./views/templates";

const router = new Router();

// --- Web pages (meme editors) ------------------------------------------------
router.get(/^\/$/, editor.index, "Pages.index");
router.get(/^\/memes\/?$/, editor.memesIndex, "Pages.memes");
router.get(new RegExp(`^/memes/(${SLUG})/?$`), editor.detail, "Pages.editor");
router.get(/^\/meme-characters\/?$/, characters.listPage, "Pages.characters");
router.get(new RegExp(`^/meme-characters/(${SLUG})/?$`), characters.detailPage, "Pages.character");
router.get(/^\/sitemap\.xml$/, editor.sitemap, "Pages.sitemap");
router.get(/^\/manifest\.webmanifest$/, pwa.manifest, "Pages.manifest");
router.get(/^\/sw\.js$/, pwa.serviceWorker, "Pages.service_worker");
router.get(/^\/offline\/?$/, pwa.offline, "Pages.offline");
router.get(/^\/robots\.txt$/, editor.robots, "Pages.robots");
router.get(/^\/agents\/?$/, agents.page, "Pages.agents");
router.get(/^\/privacy\/?$/, privacy.page, "Pages.privacy");
router.get(/^\/contact\/?$/, contact.page, "Pages.contact");
router.get(/^\/(llms\.txt|agents\.md)$/, agents.markdown, "Pages.agents_markdown");
router.get(/^\/static\/([\w./-]+)$/, editor.staticAsset, "Pages.static");
router.get(/^\/assets\/(templates|fonts|characters)\/([^/]+)\/?([^/]*)$/, editor.rawAsset, "Pages.asset");
router.get(/^\/proxy\/image\/?$/, editor.imageProxy, "Pages.image_proxy");

// --- app/main.py -------------------------------------------------------------
router.get(/^\/docs\/?$/, (app) => html(swaggerPage(`${app.settings.BASE_URL}/docs/openapi.json`)), "docs");
router.get(/^\/docs\/swagger\/?$/, (app) => html(swaggerPage(`${app.settings.BASE_URL}/docs/openapi.json`)), "docs.swagger");
router.get(/^\/docs\/openapi\.json$/, (app) => json(buildOpenApi(app.settings)), "docs.openapi");
router.get(
  /^\/test\/?$/,
  (app) => {
    if (!app.settings.DEBUG) return redirect("/");
    return html(gallery(helpers.getTestImages(app), { columns: false, refresh: 20 }));
  },
  "test",
);
router.get(/^\/favicon\.ico$/, (app) => app.env.ASSETS.fetch(new Request("https://assets.local/static/favicon.ico")), "favicon");

// --- Clients -----------------------------------------------------------------
router.post(/^\/auth\/?$/, clients.validate, "Clients.validate");
router.get(/^\/images\/preview\.jpg$/, clients.preview, "Clients.preview");

// --- Images ------------------------------------------------------------------
router.get(/^\/images\/?$/, images.index, "Images.index");
router.post(/^\/images\/?$/, images.create, "Images.create");
router.post(/^\/images\/automatic\/?$/, images.createAutomatic, "Images.create_automatic");
router.post(/^\/images\/custom\/?$/, images.createCustom, "Images.create_custom");
router.get(/^\/images\/custom\/?$/, images.indexCustom, "Images.index_custom");
router.get(new RegExp(`^/images/(${SLUG})/([^/].*\\.\\w+)$`), images.detailText, "Images.detail_text");
router.get(/^\/images\/([^/]+\.\w+)$/, images.detailBlank, "Images.detail_blank");

// --- Shortcuts under /images -------------------------------------------------
router.get(new RegExp(`^/images/(${SLUG})/([^/].*)$`), shortcuts.customPath, "Shortcuts.custom_path");
router.get(/^\/images\/([^./]+)$/, shortcuts.examplePath, "Shortcuts.example_path");

// --- Templates ---------------------------------------------------------------
router.get(/^\/templates\/?$/, templates.index, "Templates.index");
router.post(/^\/templates\/custom\/?$/, templates.custom, "Templates.custom");
router.get(new RegExp(`^/templates/(${SLUG})/?$`), templates.detail, "Templates.detail");
router.post(new RegExp(`^/templates/(${SLUG})/?$`), templates.build, "Templates.build");

// --- Characters --------------------------------------------------------------
router.get(/^\/characters\/?$/, characters.index, "Characters.index");
router.get(new RegExp(`^/characters/(${SLUG})\\.png$`), characters.png, "Characters.png");
router.get(new RegExp(`^/characters/(${SLUG})/?$`), characters.detail, "Characters.detail");

// --- Fonts -------------------------------------------------------------------
router.get(/^\/fonts\/?$/, fonts.index, "Fonts.index");
router.get(new RegExp(`^/fonts/(${SLUG})/?$`), fonts.detail, "Fonts.detail");

// --- Examples ----------------------------------------------------------------
router.get(/^\/examples\/?$/, examples.examples, "examples.examples");
router.get(/^\/examples\/animated\/?$/, examples.examplesAnimated, "examples.examples_animated");
router.get(/^\/examples\/static\/?$/, examples.examplesStatic, "examples.examples_static");

// --- Legacy shortcuts --------------------------------------------------------
router.get(/^\/((?!templates|characters|meme-characters)[a-z-]+)\/([^/].*\.\w+)$/, shortcuts.legacyCustomImage, "Shortcuts.legacy_custom_image");
router.get(/^\/([^/]+\.\w+)$/, shortcuts.legacyExampleImage, "Shortcuts.legacy_example_image");
router.get(/^\/((?!templates|characters|meme-characters)[a-z-]+)\/([^/].*)$/, shortcuts.legacyCustomPath, "Shortcuts.legacy_custom_path");
router.get(new RegExp(`^/(${SLUG})/?$`), shortcuts.legacyExamplePath, "Shortcuts.legacy_example_path");

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, X-API-KEY",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const settings = resolveSettings(env as unknown as EnvVars, request);
    const app: AppContext = { request, url, path: url.pathname, params: url.searchParams, env, settings, ctx };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const match = router.match(request.method, url.pathname);
    if (!match) {
      return withCors(error(404, `Requested URL ${url.pathname} not found`));
    }
    if ("allowed" in match) {
      const response = error(405, `Method ${request.method} not allowed for URL ${url.pathname}`);
      response.headers.set("allow", match.allowed.join(", "));
      return withCors(response);
    }

    try {
      const response = await match.handler(app, ...match.groups);
      if (request.method === "HEAD") {
        return withCors(new Response(null, { status: response.status, headers: response.headers }));
      }
      return withCors(response);
    } catch (e) {
      console.error(`Unhandled error in ${match.name}: ${(e as Error).stack ?? e}`);
      const message = settings.DEBUG ? String((e as Error).stack ?? e) : "Internal Server Error";
      return withCors(error(500, message));
    }
  },
} satisfies ExportedHandler<Env>;

import { describe, expect, it } from "vitest";
import { get } from "./helpers";
import { analyticsSnippet } from "../src/pages/html";
import { resolveSettings } from "../src/settings";

describe("GET /", () => {
  it("serves the template index with SEO metadata", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain('<html lang="en">');
    expect(body).toContain("<title>Meme Generator: ");
    expect(body).toContain("Make a meme.");
    expect(body).toContain('<link rel="canonical" href="http://localhost:5000/">');
    expect(body).toContain('<meta name="description"');
    expect(body).toContain('"@type":"WebSite"');
    expect(body).toContain('"@type":"ItemList"');
    expect(body).toContain('href="/memes/futurama-fry"');
    expect(body).toContain("Futurama Fry");
  });

  it("pins absolute URLs to DOMAIN for public hosts but keeps a local origin", async () => {
    const { SELF } = await import("cloudflare:test");
    // Tests bind DOMAIN to localhost:5000; a request via another host must still canonicalize to it
    const alias = await (await SELF.fetch("https://memegenscript.example.workers.dev/memes/futurama-fry")).text();
    expect(alias).toContain('<link rel="canonical" href="http://localhost:5000/memes/futurama-fry">');
    const local = await (await SELF.fetch("http://127.0.0.1:8787/memes/futurama-fry")).text();
    expect(local).toContain('<link rel="canonical" href="http://127.0.0.1:8787/memes/futurama-fry">');
  });

  it("offers a way to request a missing template", async () => {
    const form = 'href="https://forms.gle/SbsPFknn9NRUjs3P6"';
    const issue = 'href="https://github.com/terryds/memegenscript/issues/new?template=template-request.yml"';
    const body = await (await get("/")).text();
    const hero = body.slice(body.indexOf('class="hero"'), body.indexOf("</section>"));
    expect(hero).toContain(`<a class="button primary" ${form}`);
    expect(hero).toContain(`<a class="button secondary" ${issue}`);
    // The empty search state points at the form too
    const empty = await (await get("/?q=zzzznotamemezzzz")).text();
    expect(empty).toMatch(/<p class="empty" id="empty" >[^<]*<a href="\/">Show all templates<\/a>\. Still missing\? <a href="https:\/\/forms\.gle\/SbsPFknn9NRUjs3P6"/);
    // Every page's footer links the form
    const editor = await (await get("/memes/futurama-fry")).text();
    expect(editor.slice(editor.indexOf('class="site-footer"'))).toContain(form);
  });

  it("shows the featured memes section only on the unfiltered index", async () => {
    const body = await (await get("/")).text();
    expect(body).toContain("<h2 id=\"featured-title\">Featured memes</h2>");
    const section = body.slice(body.indexOf('class="featured"'), body.indexOf('id="all-title"'));
    expect(section).toContain('href="/memes/drakeposting"');
    expect(section).toContain('href="/memes/distracted-boyfriend"');
    expect((section.match(/class="card"/g) ?? []).length).toBeGreaterThanOrEqual(12);
    const filtered = await (await get("/?q=fry")).text();
    expect(filtered).not.toContain("Featured memes");
  });

  it("matches every word of the query separately, like the live filter", async () => {
    const body = await (await get("/?q=buzz+clone")).text();
    expect(body).toContain('href="/memes/buzz-lightyear-clones"');
    expect(body).not.toContain('href="/memes/drakeposting"');
  });

  it("finds templates by description, alias, or tag, not just name", async () => {
    // "squinting" only appears in the Know Your Meme description of Futurama Fry
    const body = await (await get("/?q=squinting")).text();
    expect(body).toContain('href="/memes/futurama-fry"');
    const dog = await (await get("/?q=dog+burning+room")).text();
    expect(dog).toContain('href="/memes/this-is-fine"');
    const cards = (dog.match(/class="card"/g) ?? []).length;
    expect(cards).toBeGreaterThanOrEqual(1);
  });

  it("filters templates with ?q= and marks the page noindex", async () => {
    const body = await (await get("/?q=awesome")).text();
    expect(body).toContain('content="noindex, follow"');
    expect(body).toContain('href="/memes/socially-awesome-penguin"');
    expect(body).toContain('href="/memes/socially-awesome-awkward-penguin"');
    const cards = (body.match(/class="card"/g) ?? []).length;
    expect(cards).toBeGreaterThanOrEqual(3);
    expect(cards).toBeLessThan(20);
  });

  it("redirects /memes to the index", async () => {
    const response = await get("/memes");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/");
  });
});

describe("GET /memes/{slug}", () => {
  it("serves an editor page per template with meta tags", async () => {
    const response = await get("/memes/futurama-fry");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Futurama Fry Meme Generator | Memegenscript</title>");
    expect(body).toContain('<link rel="canonical" href="http://localhost:5000/memes/futurama-fry">');
    expect(body).toContain('<meta property="og:title" content="Futurama Fry Meme Generator | Memegenscript">');
    expect(body).toContain('<meta property="og:image" content="http://localhost:5000/images/fry/not_sure_if_trolling/or_just_stupid.png">');
    expect(body).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(body).toContain('"@type":"BreadcrumbList"');
    expect(body).toContain('"@type":"ImageObject"');
    expect(body).toContain("<h1>Futurama Fry Meme Generator</h1>");
    expect(body).toContain('href="/templates/fry"');
    expect(body).toContain('rel="nofollow noopener"');
  });

  it("embeds the editor configuration and a no-script fallback form", async () => {
    const body = await (await get("/memes/futurama-fry")).text();
    expect(body).toContain('id="meme-editor"');
    const match = /data-config="([^"]+)"/.exec(body);
    expect(match).not.toBeNull();
    const config = JSON.parse(match![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    expect(config.id).toBe("fry");
    expect(config.boxes).toHaveLength(2);
    expect(config.boxes[0]).toMatchObject({ font: "titilliumweb", color: "white", uppercase: true, align: "center" });
    expect(config.images[0]).toEqual({ style: "default", url: "/assets/templates/fry/default.png" });
    expect(config.fonts.some((f: { id: string; url: string }) => f.id === "impact" && f.url === "/assets/fonts/Impact.ttf")).toBe(true);
    expect(body).toContain("<noscript>");
    expect(body).toContain('name="template_id" value="fry"');
    expect((body.match(/name="text\[\]"/g) ?? []).length).toBe(2);
    expect(body).toContain('src="/static/editor.js');
  });

  it("describes the meme on every editor page", async () => {
    const body = await (await get("/memes/futurama-fry")).text();
    expect(body).toContain("<h2>What is the Futurama Fry meme?</h2>");
    expect(body).toContain("image macro");
    expect(body).toContain("Know Your Meme");
    expect(body).toContain("Also known as:");
    expect(body).toContain('"alternateName"');
    const manual = await (await get("/memes/this-is-fine")).text();
    expect(manual).toContain("What is the This is Fine meme?");
    expect(manual).toContain("Gunshow");
  });

  it("has a description for every template", async () => {
    const response = await get("/templates");
    const templates = (await response.json()) as Array<{ id: string }>;
    for (const template of templates) {
      // The API exposes ids; the id URL redirects to the slug page
      const body = await (await get(`/memes/${template.id}`, { redirect: "follow" })).text();
      expect(body, template.id).toContain(`What is the `);
    }
  });

  it("hides archived templates from browsing but keeps their pages and API working", async () => {
    const index = await (await get("/")).text();
    expect(index).not.toContain('href="/memes/sad-george-bush"');
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/memes/sad-george-bush</loc>");
    const page = await get("/memes/sad-george-bush");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('content="noindex, follow"');
    expect((await get("/templates/sad-bush")).status).toBe(200);
  });

  it("lists alternate styles as editor backgrounds", async () => {
    const body = await (await get("/memes/daily-struggle")).text();
    const config = JSON.parse(/data-config="([^"]+)"/.exec(body)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    expect(config.boxes).toHaveLength(3);
    expect(config.images.map((i: { style: string }) => i.style)).toEqual(["default", "maga"]);
  });

  it("redirects the old id-based URL to the name-based slug permanently", async () => {
    const response = await get("/memes/kittens?text=hi");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/memes/three-kittens-dancing?text=hi");
    const page = await get("/memes/three-kittens-dancing");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<link rel="canonical" href="http://localhost:5000/memes/three-kittens-dancing">');
  });

  it("gives every template a unique slug that is a valid path segment", async () => {
    const { Template } = await import("../src/models/template");
    const seen = new Set<string>();
    for (const template of Template.all()) {
      expect(template.slug).toMatch(/^[a-z0-9_]+(?:-[a-z0-9_]+)*$/);
      expect(seen.has(template.slug)).toBe(false);
      seen.add(template.slug);
    }
    // An id may not double as another template's slug, or the redirect would be ambiguous
    for (const template of Template.all()) {
      const other = Template.getBySlug(template.id);
      expect(other === null || other.id === template.id).toBe(true);
    }
  });

  it("returns an HTML 404 for unknown templates", async () => {
    const response = await get("/memes/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('content="noindex"');
  });

  it("does not expose hidden templates", async () => {
    // `_error` is not a slug, so the request falls through to the legacy redirect
    expect((await get("/memes/_error")).status).not.toBe(200);
  });
});

describe("PWA", () => {
  it("serves a web app manifest with icons", async () => {
    const response = await get("/manifest.webmanifest");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("manifest+json");
    const manifest = (await response.json()) as { name: string; short_name: string; display: string; icons: Array<{ purpose: string }> };
    expect(manifest.name.startsWith("Memegenscript")).toBe(true);
    expect(manifest.short_name).toBe("Memegenscript");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
      expect((await get(`/static/icons/${icon}`)).status, icon).toBe(200);
    }
  });

  it("serves the service worker with a versioned cache name", async () => {
    const response = await get("/sw.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    const source = await response.text();
    expect(source).not.toContain("__VERSION__");
    expect(source).toContain('addEventListener("fetch"');
  });

  it("links the manifest and renders the install banner on pages", async () => {
    const body = await (await get("/memes/futurama-fry")).text();
    expect(body).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(body).toContain('id="install-banner"');
    expect(body).toContain("/static/pwa.js?v=");
    expect((await get("/offline")).status).toBe(200);
  });
});

describe("crawler files", () => {
  it("lists every editor page in the sitemap", async () => {
    const response = await get("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const body = await response.text();
    expect(body).toContain("<loc>http://localhost:5000/</loc>");
    expect(body).toContain("<loc>http://localhost:5000/memes/futurama-fry</loc>");
    expect((body.match(/<url>/g) ?? []).length).toBeGreaterThanOrEqual(200);
  });

  it("serves a robots.txt pointing at the sitemap", async () => {
    const body = await (await get("/robots.txt")).text();
    expect(body).toContain("Sitemap: http://localhost:5000/sitemap.xml");
    expect(body).toContain("Allow: /");
  });

  it("serves raw template images and fonts for the editor", async () => {
    const image = await get("/assets/templates/fry/default.png");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("access-control-allow-origin")).toBe("*");
    const font = await get("/assets/fonts/Impact.ttf");
    expect(font.status).toBe(200);
    expect((await get("/assets/templates/fry/config.yml")).status).toBe(404);
    expect((await get("/assets/templates/../static/site.css")).status).toBe(404);
  });

  it("proxies only real remote images", async () => {
    expect((await get("/proxy/image?url=notaurl")).status).toBe(400);
    expect((await get("/proxy/image")).status).toBe(400);
  });

  it("serves the static assets with long cache headers", async () => {
    const response = await get("/static/site.css?v=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect((await get("/static/editor.js")).status).toBe(200);
    expect((await get("/static/../fonts/Impact.ttf")).status).toBe(404);
  });
});

describe("analytics", () => {
  const settingsFor = (id: string | undefined, url: string) => resolveSettings({ GA_MEASUREMENT_ID: id }, new Request(url));

  it("stays off when no measurement ID is configured", async () => {
    expect(analyticsSnippet(settingsFor(undefined, "https://memegenscript.com/"))).toBe("");
    expect(await (await get("/")).text()).not.toContain("googletagmanager.com");
  });

  it("loads Google Analytics for a valid measurement ID", () => {
    const snippet = analyticsSnippet(settingsFor("G-ABC123XYZ9", "https://memegenscript.com/"));
    expect(snippet).toContain("https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ9");
    expect(snippet).toContain('gtag("config","G-ABC123XYZ9")');
  });

  it("ignores malformed IDs and never counts local development", () => {
    expect(settingsFor('G-1"><script>', "https://memegenscript.com/").GA_MEASUREMENT_ID).toBe("");
    expect(settingsFor("G-ABC123XYZ9", "http://localhost:8787/").GA_MEASUREMENT_ID).toBe("");
  });
});

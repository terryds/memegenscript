import { describe, expect, it } from "vitest";
import { get } from "./helpers";

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
    expect(body).toContain('href="/memes/fry"');
    expect(body).toContain("Futurama Fry");
  });

  it("shows the featured memes section only on the unfiltered index", async () => {
    const body = await (await get("/")).text();
    expect(body).toContain("<h2 id=\"featured-title\">Featured memes</h2>");
    const section = body.slice(body.indexOf('class="featured"'), body.indexOf('id="all-title"'));
    expect(section).toContain('href="/memes/drake"');
    expect(section).toContain('href="/memes/db"');
    expect((section.match(/class="card"/g) ?? []).length).toBeGreaterThanOrEqual(12);
    const filtered = await (await get("/?q=fry")).text();
    expect(filtered).not.toContain("Featured memes");
  });

  it("finds templates by description, alias, or tag, not just name", async () => {
    // "squinting" only appears in the Know Your Meme description of Futurama Fry
    const body = await (await get("/?q=squinting")).text();
    expect(body).toContain('href="/memes/fry"');
    const dog = await (await get("/?q=dog+burning+room")).text();
    expect(dog).toContain('href="/memes/fine"');
    const cards = (dog.match(/class="card"/g) ?? []).length;
    expect(cards).toBeGreaterThanOrEqual(1);
  });

  it("filters templates with ?q= and marks the page noindex", async () => {
    const body = await (await get("/?q=awesome")).text();
    expect(body).toContain('content="noindex, follow"');
    expect(body).toContain('href="/memes/awesome"');
    expect(body).toContain('href="/memes/awesome-awkward"');
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

describe("GET /memes/{id}", () => {
  it("serves an editor page per template with meta tags", async () => {
    const response = await get("/memes/fry");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Futurama Fry Meme Generator | Memegenscript</title>");
    expect(body).toContain('<link rel="canonical" href="http://localhost:5000/memes/fry">');
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
    const body = await (await get("/memes/fry")).text();
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
    const body = await (await get("/memes/fry")).text();
    expect(body).toContain("<h2>What is the Futurama Fry meme?</h2>");
    expect(body).toContain("image macro");
    expect(body).toContain("Know Your Meme");
    expect(body).toContain("Also known as:");
    expect(body).toContain('"alternateName"');
    const manual = await (await get("/memes/fine")).text();
    expect(manual).toContain("What is the This is Fine meme?");
    expect(manual).toContain("Gunshow");
  });

  it("has a description for every template", async () => {
    const response = await get("/templates");
    const templates = (await response.json()) as Array<{ id: string }>;
    for (const template of templates) {
      const body = await (await get(`/memes/${template.id}`)).text();
      expect(body, template.id).toContain(`What is the `);
    }
  });

  it("hides archived templates from browsing but keeps their pages and API working", async () => {
    const index = await (await get("/")).text();
    expect(index).not.toContain('href="/memes/sad-bush"');
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/memes/sad-bush</loc>");
    const page = await get("/memes/sad-bush");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('content="noindex, follow"');
    expect((await get("/templates/sad-bush")).status).toBe(200);
  });

  it("lists alternate styles as editor backgrounds", async () => {
    const body = await (await get("/memes/ds")).text();
    const config = JSON.parse(/data-config="([^"]+)"/.exec(body)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    expect(config.boxes).toHaveLength(3);
    expect(config.images.map((i: { style: string }) => i.style)).toEqual(["default", "maga"]);
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

describe("crawler files", () => {
  it("lists every editor page in the sitemap", async () => {
    const response = await get("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const body = await response.text();
    expect(body).toContain("<loc>http://localhost:5000/</loc>");
    expect(body).toContain("<loc>http://localhost:5000/memes/fry</loc>");
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

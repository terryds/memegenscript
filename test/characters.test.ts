import { describe, expect, it } from "vitest";
import { get } from "./helpers";

/** Width and height from a PNG's IHDR chunk, plus whether it declares an alpha channel. */
function pngInfo(bytes: Uint8Array): { width: number; height: number; rgba: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), rgba: bytes[25] === 6 };
}

describe("GET /characters (API)", () => {
  it("lists every character with the fields a client needs", async () => {
    const response = await get("/characters");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const characters = (await response.json()) as Array<Record<string, unknown>>;
    expect(characters.length).toBeGreaterThanOrEqual(40);
    const doge = characters.find((c) => c.id === "doge")!;
    expect(doge).toMatchObject({
      name: "Doge",
      image: "http://localhost:5000/characters/doge.png",
      page: "http://localhost:5000/meme-characters/doge",
      _self: "http://localhost:5000/characters/doge",
    });
    expect(doge.aliases).toContain("Kabosu");
    expect(typeof doge.description).toBe("string");
    expect(doge.width).toBeGreaterThan(100);
    expect(doge.templates).toEqual([{ id: "doge", name: "Doge", _self: "http://localhost:5000/templates/doge" }]);
  });

  it("searches by name, alias, keyword, or description with ?q=", async () => {
    const frogs = (await (await get("/characters?q=frog")).json()) as Array<{ id: string }>;
    const ids = frogs.map((c) => c.id);
    expect(ids).toContain("pepe");
    expect(ids).toContain("feels-bad-man");
    expect(ids).not.toContain("doge");
    // Every word must match
    expect((await (await get("/characters?q=frog+unicycle")).json()) as unknown[]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "dat-boi" })]),
    );
    expect(((await (await get("/characters?q=frog+unicycle")).json()) as unknown[]).length).toBe(1);
    expect(((await (await get("/characters?q=zzznotacharacter")).json()) as unknown[]).length).toBe(0);
  });

  it("returns one character or a 404", async () => {
    const response = await get("/characters/wojak");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { name: string }).name).toBe("Wojak");
    const missing = await get("/characters/nobody");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { message: string }).message).toBe("Character not found: nobody");
  });
});

describe("GET /characters/{id}.png", () => {
  it("serves the original transparent PNG", async () => {
    const response = await get("/characters/doge.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const info = pngInfo(bytes);
    expect(info.rgba).toBe(true);
    expect(info.width).toBeGreaterThan(100);
    // Same bytes as the raw asset
    const raw = new Uint8Array(await (await get("/assets/characters/doge/default.png")).arrayBuffer());
    expect(bytes.length).toBe(raw.length);
  });

  it("resizes with width or height, keeping the aspect ratio and the alpha channel", async () => {
    const original = pngInfo(new Uint8Array(await (await get("/characters/doge.png")).arrayBuffer()));
    const resized = await get("/characters/doge.png?width=200");
    expect(resized.status).toBe(200);
    const info = pngInfo(new Uint8Array(await resized.arrayBuffer()));
    expect(info.width).toBe(200);
    expect(info.height).toBe(Math.round((200 * original.height) / original.width));
    expect(info.rgba).toBe(true);
    const boxed = pngInfo(new Uint8Array(await (await get("/characters/doge.png?width=1000&height=100")).arrayBuffer()));
    expect(boxed.height).toBe(100);
    expect(boxed.width).toBeLessThanOrEqual(1000);
  });

  it("rejects bad sizes and unknown characters", async () => {
    expect((await get("/characters/doge.png?width=5")).status).toBe(422);
    expect((await get("/characters/doge.png?width=abc")).status).toBe(422);
    expect((await get("/characters/doge.png?height=99999")).status).toBe(422);
    expect((await get("/characters/nobody.png")).status).toBe(404);
  });

  it("offers the file as an attachment with ?download", async () => {
    const response = await get("/characters/doge.png?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="doge.png"');
  });
});

describe("GET /meme-characters", () => {
  it("serves the character index with SEO metadata", async () => {
    const response = await get("/meme-characters");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Meme Characters: ");
    expect(body).toContain('<link rel="canonical" href="http://localhost:5000/meme-characters">');
    expect(body).toContain('"@type":"CollectionPage"');
    expect(body).toContain('"@type":"ItemList"');
    expect(body).toContain('href="/meme-characters/doge"');
    expect(body).toContain('class="card cutout"');
    expect(body).toContain('src="http://localhost:5000/characters/doge.png?width=300"');
    expect(body).toContain('<script src="/static/index.js?v=');
  });

  it("filters with ?q= and marks the page noindex", async () => {
    const body = await (await get("/meme-characters?q=wojak")).text();
    expect(body).toContain('content="noindex, follow"');
    expect(body).toContain('href="/meme-characters/crying-wojak"');
    expect(body).not.toContain('href="/meme-characters/doge"');
  });

  it("is linked from the navigation, footer, and home page", async () => {
    const home = await (await get("/")).text();
    expect(home).toContain('<a class="nav-link nav-link-templates" href="/">Templates</a>');
    expect(home).toContain('<a class="nav-link nav-link-characters" href="/meme-characters">Characters</a>');
    expect(home.slice(home.indexOf('class="site-footer"'))).toContain('<a href="/meme-characters">meme characters</a>');
    expect(home).toContain('<h2 id="characters-title">Meme characters</h2>');
    expect(home).toContain('href="/meme-characters/');
  });
});

describe("GET /meme-characters/{id}", () => {
  it("serves a character page with download actions and structured data", async () => {
    const response = await get("/meme-characters/doge");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Doge PNG: Transparent Meme Character | ");
    expect(body).toContain('<link rel="canonical" href="http://localhost:5000/meme-characters/doge">');
    expect(body).toContain('<meta property="og:image" content="http://localhost:5000/characters/doge.png?width=600">');
    // Small cutouts are previewed at their native size, never upscaled
    const pepe = await (await get("/meme-characters/pepe")).text();
    expect(pepe).toContain('<meta property="og:image" content="http://localhost:5000/characters/pepe.png">');
    expect(body).toContain('"@type":"ImageObject"');
    expect(body).toContain('"encodingFormat":"image/png"');
    expect(body).toContain('"@type":"BreadcrumbList"');
    expect(body).toContain('<article class="character" data-character="doge">');
    expect(body).toContain('href="/characters/doge.png?download=1" download="doge.png"');
    expect(body).toContain('data-action="copy-image"');
    expect(body).toContain('<link rel="alternate" type="application/json" href="/characters/doge">');
    expect(body).toContain('<script src="/static/characters.js?v=');
    // Cross-links to the template it appears in, and to more characters
    expect(body).toContain('href="/memes/doge"');
    expect(body).toContain("More meme characters");
  });

  it("returns an HTML 404 for unknown characters", async () => {
    const response = await get("/meme-characters/nobody");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("There is no meme character called");
  });

  it("links characters from the template editor page", async () => {
    const body = await (await get("/memes/doge")).text();
    expect(body).toContain('<h2 id="characters-title">Characters in this meme</h2>');
    expect(body).toContain('href="/meme-characters/doge"');
    const none = await (await get("/memes/futurama-fry")).text();
    expect(none).toContain('href="/meme-characters/futurama-fry"');
  });
});

describe("crawler files include characters", () => {
  it("lists the character pages in the sitemap", async () => {
    const body = await (await get("/sitemap.xml")).text();
    expect(body).toContain("<loc>http://localhost:5000/meme-characters</loc>");
    expect(body).toContain("<loc>http://localhost:5000/meme-characters/doge</loc>");
  });

  it("serves the raw cutouts but not their config", async () => {
    expect((await get("/assets/characters/doge/default.png")).headers.get("content-type")).toBe("image/png");
    expect((await get("/assets/characters/doge/config.yml")).status).toBe(404);
  });

  it("keeps the legacy shortcut routes away from /characters", async () => {
    // /characters/{id}.png is the cutout, not a legacy meme image for a template called "characters"
    const response = await get("/characters/doge.png");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.status).toBe(200);
  });
});

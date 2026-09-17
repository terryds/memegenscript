import { describe, expect, it } from "vitest";
import { get, postForm, postJson } from "./helpers";

describe("GET /images", () => {
  it("returns example image URLs", async () => {
    const response = await get("/images");
    expect(response.status).toBe(200);
    const data = (await response.json()) as Array<{ url: string; template: string }>;
    expect(data).toContainEqual({
      url: "http://localhost:5000/images/iw/does_testing/in_production.png",
      template: "http://localhost:5000/templates/iw",
    });
  });

  it("can filter examples", async () => {
    const data = (await (await get("/images?filter=awesome")).json()) as unknown[];
    expect(data.length).toBe(3);
  });
});

describe("POST /images", () => {
  it.each([true, false])("returns an image URL (json=%s)", async (asJson) => {
    const data = { template_id: "iw", "text_lines[]": ["foo", "bar"] };
    const response = asJson ? await postJson("/images", data) : await postForm("/images", data);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/foo/bar.png" });
  });

  it("lowercases text for default templates", async () => {
    const response = await postForm("/images", { template_id: "iw", "text_lines[]": ["foo", "Bar"] });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/foo/bar.png" });
  });

  it("preserves text case for top layouts", async () => {
    const response = await postForm("/images", { template_id: "iw", "text_lines[]": ["foo", "Bar"], layout: "top" });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/foo/Bar.png?layout=top" });
  });

  it("removes redundant styles", async () => {
    const response = await postForm("/images", {
      template_id: "iw",
      "text_lines[]": ["foo", "bar"],
      "style[]": [" ", "test", "default"],
      font: "impact",
    });
    expect(await response.json()).toEqual({
      url: "http://localhost:5000/images/iw/foo/bar.png?style=default,test&font=impact",
    });
  });

  it("can force the animated extension", async () => {
    const response = await postForm("/images", { template_id: "iw", "text_lines[]": ["foo", "bar"], style: "animated" });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/foo/bar.gif" });
  });

  it("prefers the extension over the animated style", async () => {
    const response = await postForm("/images", {
      template_id: "iw",
      "text_lines[]": ["foo", "bar"],
      style: "animated",
      extension: "webp",
    });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/foo/bar.webp" });
  });

  it("redirects if requested", async () => {
    const response = await postForm("/images", { template_id: "iw", text_lines: ["abc"], redirect: true });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:5000/images/iw/abc.png?status=201");
  });

  it("requires template_id", async () => {
    const response = await postForm("/images", { text_lines: ["foo", "bar"] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '"template_id" is required' });
  });

  it("handles unknown template IDs", async () => {
    const response = await postForm("/images", { template_id: "unknown", text_lines: ["one", "two"] });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/unknown/one/two.png" });
  });

  it("handles missing text lines", async () => {
    const response = await postForm("/images", { template_id: "iw" });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw.png" });
  });

  it("drops trailing blank lines", async () => {
    const response = await postForm("/images", { template_id: "iw", text_lines: ["", "", "", ""] });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw.png" });
  });

  it("supports slashes to indicate blank lines", async () => {
    const response = await postForm("/images", { template_id: "iw", text_lines: ["/", "2", "/", ""] });
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/_/2.png" });
  });

  it("handles invalid JSON", async () => {
    const response = await get("/images", { method: "POST", body: "???" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '"template_id" is required' });
  });
});

describe("POST /images/custom", () => {
  it.each([true, false])("supports custom backgrounds (json=%s)", async (asJson) => {
    const data = { background: "http://example.com", "text_lines[]": ["foo", "bar"] };
    const response = asJson ? await postJson("/images/custom", data) : await postForm("/images/custom", data);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "http://localhost:5000/images/custom/foo/bar.png?background=http://example.com",
    });
  });

  it("escapes query parameters", async () => {
    const response = await postForm("/images/custom", {
      background: "https://cdn.discordapp.com/attachments/1/2/stare.png?ex=a1&is=b2&hm=c3",
      "text_lines[]": ["foo", "bar"],
    });
    expect(await response.json()).toEqual({
      url: "http://localhost:5000/images/custom/foo/bar.png?background=https://cdn.discordapp.com/attachments/1/2/stare.png%3Fex%3Da1%26is%3Db2%26hm%3Dc3",
    });
  });

  it("returns gif when the background is a gif", async () => {
    const response = await postForm("/images/custom", {
      background: "https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif",
      "text_lines[]": ["foo", "bar"],
    });
    expect(await response.json()).toEqual({
      url: "http://localhost:5000/images/custom/foo/bar.gif?background=https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif",
    });
  });

  it("redirects if requested", async () => {
    const response = await postForm("/images/custom", {
      background: "https://www.gstatic.com/webp/gallery/4.png",
      text_lines: ["abc"],
      redirect: true,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:5000/images/custom/abc.png?background=https://www.gstatic.com/webp/gallery/4.png&status=201",
    );
  });
});

describe("POST /images/automatic", () => {
  it("requires text", async () => {
    const response = await postForm("/images/automatic", {});
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '"text" is required' });
  });
});

describe("GET /images/{template}/{text}.{ext}", () => {
  it.each([
    ["/images/fry.gif", "image/gif"],
    ["/images/fry.jpg", "image/jpeg"],
    ["/images/fry.png", "image/png"],
    ["/images/fry.webp", "image/webp"],
    ["/images/fry/test.gif", "image/gif"],
    ["/images/fry/test.jpg", "image/jpeg"],
    ["/images/fry/test.png", "image/png"],
    ["/images/fry/test.webp", "image/webp"],
  ])("returns %s as %s", async (path, contentType) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("handles placeholder templates", async () => {
    const response = await get("/images/string/test.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("handles unknown templates", async () => {
    const response = await get("/images/unknown/test.png");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("rejects invalid extensions", async () => {
    const response = await get("/images/fry/test.foobar");
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("rejects extremely small sizes", async () => {
    const response = await get("/images/fry/test.jpg?width=9");
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("rejects invalid sizes", async () => {
    const response = await get("/images/fry/test.jpg?width=abc");
    expect(response.status).toBe(422);
  });

  it("rejects extremely long URLs", async () => {
    const text = "test_".repeat(50);
    const response = await get(`/images/fry/${text}.jpg`);
    expect(response.status).toBe(414);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("renders custom sizes with padding", async () => {
    const response = await get("/images/fry/test.png?width=200&height=100");
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(200); // PNG IHDR width
    expect(view.getUint32(20)).toBe(100); // PNG IHDR height
  });

  it("accepts valid colors", async () => {
    const plain = await (await get("/images/fry/test.png")).arrayBuffer();
    const response = await get("/images/fry/test.png?color=red,blue");
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).not.toBe(plain.byteLength);
  });

  it("rejects invalid colors", async () => {
    const response = await get("/images/fry/test.png?color=red,blue2");
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  describe("fonts", () => {
    it("rejects unknown fonts", async () => {
      expect((await get("/images/fry/test.png?font=foobar")).status).toBe(422);
    });

    it("ignores placeholder values", async () => {
      expect((await get("/images/fry/test.png?font=string")).status).toBe(200);
    });

    it("renders every font", async () => {
      for (const font of ["thick", "thin", "comic", "impact", "notosans", "tiny", "jp", "he"]) {
        const response = await get(`/images/fry/test.png?font=${font}`);
        expect(response.status, font).toBe(200);
      }
    });
  });

  describe("watermarks", () => {
    it.each(["png", "jpg"])("rejects unknown watermarks (%s)", async (extension) => {
      const response = await get(`/images/fry/test.${extension}?watermark=foobar`);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`/images/fry/test.${extension}`);
    });

    it.each(["png", "jpg"])("removes redundant watermarks (%s)", async (extension) => {
      const response = await get(`/images/fry/test.${extension}?watermark=Memegenscript`);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`/images/fry/test.${extension}`);
    });

    it("rejects invalid authentication", async () => {
      const response = await get("/images/fry/test.png?watermark=blank", { headers: { "X-API-KEY": "foobar" } });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/images/fry/test.png");
    });
  });

  describe("styles", () => {
    it("supports alternate styles", async () => {
      const response = await get("/images/ds/one/two.png?style=maga");
      expect(response.status).toBe(200);
    });

    it.each(["ds", "ds/one/two"])("redirects to gif when animated (%s)", async (slug) => {
      const response = await get(`/images/${slug}.png?style=animated`);
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(`/images/${slug}.gif`);
    });

    it("rejects invalid styles", async () => {
      const response = await get("/images/ds/one/two.png?style=foobar");
      expect(response.status).toBe(422);
    });

    it("ignores placeholder values", async () => {
      expect((await get("/images/ds/one/two.png?style=string")).status).toBe(200);
    });
  });

  describe("layouts", () => {
    it("supports the top layout", async () => {
      expect((await get("/images/rollsafe/When_you_have_a_really_good_idea.png?layout=top")).status).toBe(200);
    });
  });

  describe("custom", () => {
    it("requires an image with custom templates", async () => {
      const response = await get("/images/custom/test.png");
      expect(response.status).toBe(422);
      expect(response.headers.get("content-type")).toBe("image/png");
    });

    it("handles invalid URLs", async () => {
      expect((await get("/images/custom/test.png?background=foobar")).status).toBe(415);
    });

    it("ignores placeholder values", async () => {
      expect((await get("/images/custom/string.png?background=string")).status).toBe(200);
    });
  });
});

describe("GET /images/preview.jpg", () => {
  it("renders a preview", async () => {
    const response = await get("/images/preview.jpg?template=iw&lines[]=live+preview&lines[]=while+typing");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("renders a preview for unknown templates", async () => {
    const response = await get("/images/preview.jpg?template=nope&text[]=a");
    expect(response.status).toBe(200);
  });
});

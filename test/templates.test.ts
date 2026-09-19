import { describe, expect, it } from "vitest";
import { get, postForm, postJson } from "./helpers";

describe("GET /templates", () => {
  it.each(["", "/"])("returns all templates (%j)", async (slash) => {
    const response = await get("/templates" + slash);
    expect(response.status).toBe(200);
    const data = (await response.json()) as unknown[];
    expect(data.length).toBeGreaterThanOrEqual(140);
  });

  it("can filter templates", async () => {
    const response = await get("/templates?filter=awesome");
    expect(response.status).toBe(200);
    expect(((await response.json()) as unknown[]).length).toBe(3);
  });

  it("can filter animated templates", async () => {
    const response = await get("/templates?animated=true");
    const data = (await response.json()) as Array<{ styles: string[] }>;
    expect(data.length).toBeGreaterThan(5);
    expect(data.every((t) => t.styles.includes("animated"))).toBe(true);
  });
});

describe("GET /templates/{id}", () => {
  it.each(["", "/"])("includes metadata (%j)", async (slash) => {
    const response = await get("/templates/iw" + slash);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "iw",
      name: "Insanity Wolf",
      lines: 2,
      overlays: 1,
      styles: ["default"],
      blank: "http://localhost:5000/images/iw.png",
      example: {
        text: ["does testing", "in production"],
        url: "http://localhost:5000/images/iw/does_testing/in_production.png",
      },
      source: "http://knowyourmeme.com/memes/insanity-wolf",
      keywords: [],
      _self: "http://localhost:5000/templates/iw",
    });
  });

  it("defaults to the animated example when available", async () => {
    const response = await get("/templates/bongo");
    const data = (await response.json()) as { example: { url: string } };
    expect(data.example.url).toBe(
      "http://localhost:5000/images/bongo/Any_sound_when_you're_trying_to_sleep/Max_volume_alarm_when_you_have_to_wake_up.gif",
    );
  });

  it("lists alternate styles", async () => {
    const data = (await (await get("/templates/ds")).json()) as { styles: string[] };
    expect(data.styles).toEqual(["default", "maga"]);
  });

  it("returns 404 when missing", async () => {
    expect((await get("/templates/foobar")).status).toBe(404);
  });
});

describe("POST /templates/{id}", () => {
  it.each([true, false])("returns an image URL (json=%s)", async (asJson) => {
    const data = { "text_lines[]": ["foo", "bar"], extension: "jpg" };
    const response = asJson ? await postJson("/templates/iw", data) : await postForm("/templates/iw", data);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/iw/foo/bar.jpg" });
  });

  it.each([true, false])("supports custom backgrounds (json=%s)", async (asJson) => {
    const data = {
      background: "https://www.gstatic.com/webp/gallery/3.png",
      "text_lines[]": ["foo", "bar"],
      extension: "jpg",
    };
    const response = asJson ? await postJson("/templates/custom", data) : await postForm("/templates/custom", data);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "http://localhost:5000/images/custom/foo/bar.jpg?background=https://www.gstatic.com/webp/gallery/3.png",
    });
  });

  it("accepts a template ID as a custom background", async () => {
    const response = await postForm("/templates/custom", {
      background: "fry",
      "text_lines[]": ["foo", "bar"],
      extension: "jpg",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/fry/foo/bar.jpg" });
  });

  it.each(["iw", "custom"])("redirects if requested (%s)", async (id) => {
    const response = await postForm(`/templates/${id}`, { text_lines: ["abc"], redirect: true });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`http://localhost:5000/images/${id}/abc.png?status=201`);
  });

  it("handles unknown template IDs", async () => {
    const response = await postForm("/templates/unknown", { text_lines: ["one", "two"] });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ url: "http://localhost:5000/images/unknown/one/two.png" });
  });
});

describe("GET /fonts", () => {
  it("lists fonts", async () => {
    const response = await get("/fonts");
    expect(response.status).toBe(200);
    const data = (await response.json()) as Array<{ id: string; alias: string | null; _self: string }>;
    expect(data[0]).toEqual({
      id: "titilliumweb",
      alias: "thick",
      filename: "TitilliumWeb-Black.ttf",
      _self: "http://localhost:5000/fonts/titilliumweb",
    });
  });

  it("returns a font by alias", async () => {
    const response = await get("/fonts/thick");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe("titilliumweb");
  });

  it("returns 404 for unknown fonts", async () => {
    expect((await get("/fonts/foobar")).status).toBe(404);
  });
});

describe("GET /templates?q=", () => {
  it("searches descriptions and aliases, and returns them", async () => {
    const response = await get("/templates?q=guy+looking+at+girl");
    expect(response.status).toBe(200);
    const items = (await response.json()) as Array<{ id: string; lines: number; description: string; aliases: string[] }>;
    const db = items.find((t) => t.id === "db");
    expect(db?.lines).toBe(3);
    expect(db?.description).toContain("Distracted Boyfriend");
    expect(Array.isArray(db?.aliases)).toBe(true);
    // The name-based `filter` finds nothing for the same words, and keeps the original shape
    expect(await (await get("/templates?filter=guy+looking+at+girl")).json()).toEqual([]);
    const plain = (await (await get("/templates?filter=distracted")).json()) as Array<Record<string, unknown>>;
    expect(plain[0]).not.toHaveProperty("description");
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await (await get("/templates?q=zzzznotamemezzzz")).json()).toEqual([]);
  });
});

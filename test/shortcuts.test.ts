import { describe, expect, it } from "vitest";
import { get } from "./helpers";

describe("image redirects", () => {
  it.each(["png", "jpg"])("redirects to the normalized slug (%s)", async (extension) => {
    const response = await get(`/images/fry/One Two.${extension}`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`/images/fry/One_Two.${extension}`);
  });

  it.each(["png", "jpg"])("preserves query params when redirecting (%s)", async (extension) => {
    const response = await get(`/images/custom/One Two.${extension}?background=http://example.com`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`/images/custom/One_Two.${extension}?background=http://example.com`);
  });

  it("fixes misplaced query params on the path", async () => {
    const response = await get("/images/fry/test&width=99&height=99");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry/test.png?width=99&height=99");
  });

  it("fixes a misplaced file extension", async () => {
    const response = await get("/images/fry/.jpg");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry.jpg");
  });

  it.each(["/", '"'])("fixes extra trailing characters (%s)", async (extra) => {
    const response = await get("/images/fry/test.jpg" + extra);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry/test.jpg");
  });

  it("fixes misplaced query params on the image", async () => {
    const response = await get("/images/fry/test.jpg&width=99&height=99");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry/test.jpg?width=99&height=99");
  });

  it("truncates invalid path values", async () => {
    const response = await get("/images/fry/test//style=foobar");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry/test.png");
  });

  it("handles encoded newlines", async () => {
    const response = await get("/images/fry/1 2%0A3.jpg");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/images/fry/1_2~n3.jpg");
  });
});

describe("path redirects", () => {
  it("redirects to the example image when there is no extension", async () => {
    const response = await get("/images/fry");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry/not_sure_if_trolling/or_just_stupid.gif");
  });

  it("redirects to a custom image when there is text but no extension", async () => {
    const response = await get("/images/fry/foo bar/._XD%5CXD");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry/foo_bar/._XD~bXD.png");
  });

  it("rejects unknown templates", async () => {
    expect((await get("/images/unknown")).status).toBe(404);
  });

  it("handles trailing slashes", async () => {
    const response = await get("/images/fry/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/fry");
  });
});

describe("legacy images", () => {
  it.each(["png", "jpg"])("redirects to the example image (%s)", async (extension) => {
    const response = await get(`/fry.${extension}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/images/fry/not_sure_if_trolling/or_just_stupid.${extension}`);
  });

  it.each(["png", "jpg"])("redirects to a custom image (%s)", async (extension) => {
    const response = await get(`/fry/test.${extension}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/images/fry/test.${extension}`);
  });
});

describe("legacy paths", () => {
  it.each([".png", ".jpg"])("rejects unknown templates (%s)", async (suffix) => {
    expect((await get(`/unknown${suffix}`)).status).toBe(404);
  });

  it("redirects unknown template paths to the images route", async () => {
    const response = await get("/unknown");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/images/unknown");
  });
});

describe("misc", () => {
  it("serves the template index at the root", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("serves the OpenAPI document", async () => {
    const response = await get("/docs/openapi.json");
    expect(response.status).toBe(200);
    const spec = (await response.json()) as { openapi: string; paths: Record<string, unknown>; info: { version: string } };
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.version).toBe("1.0");
    expect(Object.keys(spec.paths)).toContain("/images/{template_id}/{text_filepath}");
  });

  it("serves the docs page", async () => {
    const response = await get("/docs");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("swagger-ui");
  });

  it("serves the examples gallery", async () => {
    const response = await get("/examples");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/images/iw/does_testing/in_production.png");
  });

  it("adds CORS headers", async () => {
    const response = await get("/templates/iw");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves robots.txt", async () => {
    const response = await get("/robots.txt");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("User-agent");
  });
});

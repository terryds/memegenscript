/** These tests download images from the internet. */
import { describe, expect, it } from "vitest";
import { get } from "./helpers";

describe("custom backgrounds and overlays (network)", () => {
  it("supports custom templates", async () => {
    const response = await get("/images/custom/test.png?background=https://www.gstatic.com/webp/gallery/3.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("supports custom templates with animation", async () => {
    const response = await get(
      "/images/custom/test/test.gif?background=https://www.gstatic.com/webp/gallery/4.jpg&start=0.1&stop=0.5,0.9",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/gif");
  });

  it("handles missing URLs", async () => {
    const response = await get("/images/custom/test.png?background=http://example.com/does_not_exist.png");
    expect(response.status).toBe(415);
  });

  it.each(["/images/fine/test.png?", "/images/custom/test.png?background=https://www.gstatic.com/webp/gallery/3.jpg&"])(
    "supports custom overlays (%s)",
    async (base) => {
      const response = await get(base + "style=https://www.gstatic.com/webp/gallery/4.jpg");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    },
  );

  it("requires image URLs for overlays", async () => {
    const response = await get("/images/fine/test.png?style=http://example.com");
    expect(response.status).toBe(415);
  });

  it("renders emoji via twemoji", async () => {
    const response = await get("/images/fry/:thumbsup:/👍.png");
    expect(response.status).toBe(200);
  });
});

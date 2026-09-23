/** Port of `app/views/helpers.py`: shared logic behind the image endpoints. */
import type { AppContext } from "../context";
import { renderMeme, renderPreview, MissingBackgroundError, ImageDecodeError } from "../images/render";
import { Font } from "../models/font";
import { Template } from "../models/template";
import { image, json, redirect } from "../response";
import { ALLOWED_EXTENSIONS, ANIMATED_EXTENSIONS, PLACEHOLDER } from "../settings";
import { validateColor } from "../utils/colors";
import * as meta from "../utils/meta";
import { decode, slugify } from "../utils/text";
import { add, arg, clean, FLAGS, schema } from "../utils/urls";
import { sha1Hex } from "../utils/sha1";

type Payload = Record<string, unknown>;

/** Parse a form or JSON body the way Sanic's `request.form` / `request.json` did. */
export async function readPayload(request: Request): Promise<Payload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payload: Payload = {};
    const keys = new Set<string>();
    form.forEach((_value, key) => keys.add(key));
    for (const key of keys) {
      const values = form.getAll(key).map(String);
      payload[key] = key.includes("style") || key.includes("text") ? values : values[0];
    }
    return payload;
  }
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Payload) : {};
  } catch {
    return {};
  }
}

function truthy(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower in FLAGS ? FLAGS[lower] : Boolean(value);
  }
  return Boolean(value);
}

function asLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => (v === null || v === undefined ? "" : String(v)));
  if (typeof value === "string") return [value];
  return [];
}

export async function generateUrl(
  app: AppContext,
  templateId = "",
  { templateIdRequired = false }: { templateIdRequired?: boolean } = {},
): Promise<Response> {
  const payload = await readPayload(app.request);

  for (const [alias, key] of [
    ["style[]", "style"],
    ["text[]", "text"],
    ["text_lines[]", "text_lines"],
  ] as const) {
    if (alias in payload) {
      payload[key] = payload[alias];
      delete payload[alias];
    }
  }

  if (templateIdRequired) {
    if (!("template_id" in payload)) {
      return json({ error: '"template_id" is required' }, 400);
    }
    templateId = slugify(String(payload.template_id));
  }

  let style = arg<string | string[]>(payload, "", "style", "overlay");
  if (Array.isArray(style)) {
    style = style.map((s) => String(s).trim() || "default").join(",");
  }
  style = String(style);
  while (style.endsWith(",default")) style = style.slice(0, -",default".length);

  const textLines = asLines(arg(payload, [], "text", "text_lines"));
  const layout = String(arg(payload, "default", "layout"));
  const normalize = layout === "default";
  const font = String(arg(payload, "", "font"));
  const background = String(arg(payload, "", "background", "image_url"));
  const extension = String(arg(payload, "", "extension"));

  if (background && background !== PLACEHOLDER && !schema(background)) {
    console.info(`Handling template ID as custom background: ${background}`);
    templateId = background;
  }

  let status = 201;
  let url: string;
  if (templateId) {
    const template = Template.getOrCreate(templateId);
    url = template.buildCustomUrl(app.settings, textLines, { normalize, style, layout, font, extension });
    if (!template.valid) status = 404;
  } else {
    const template = new Template({ id: "_custom" });
    url = template.buildCustomUrl(app.settings, textLines, { normalize, background, style, layout, font, extension });
  }

  [url] = await meta.tokenize(app, url);

  console.info(`Generated image: ${JSON.stringify(payload)} => ${url}`);

  if (truthy(payload.redirect)) {
    return redirect(add(url, { status: "201" }));
  }

  return json({ url }, status);
}

export async function previewImage(app: AppContext, id: string, style: string, lines: string[]): Promise<Response> {
  let error = "";

  id = clean(id);
  let template: Template;
  if (schema(id)) {
    template = await Template.create(id, { host: app.url.host, cacheTtl: app.settings.CACHE_TTL });
    if (!template.hasImage) {
      console.error(`Unable to download image URL: ${id}`);
      template = Template.get("_error");
      error = "Invalid Background";
    }
  } else {
    const found = Template.getOrNull(id);
    if (found) {
      template = found;
    } else {
      console.error(`No such template: ${id}`);
      template = Template.get("_error");
      error = "Unknown Template";
    }
  }

  if (!lines.some((line) => line.trim())) lines = template.example;

  template = template.clone(app.params, lines.length, style, { animated: false });

  if (style !== "animated" && !(await template.check(style, { cacheTtl: app.settings.CACHE_TTL }))) {
    error = "Invalid Overlay";
  }

  let watermark: string;
  if (error) {
    watermark = error;
  } else if (style === "animated" && !template.animatedImage) {
    watermark = "Animated Text";
  } else if (style === "default" && template.animatedImage) {
    watermark = "Static Image";
  } else {
    watermark = "";
  }

  const context = { assets: app.env.ASSETS, debug: app.settings.DEBUG };
  let rendered;
  try {
    rendered = await renderPreview(template, lines, { style, watermark }, context);
  } catch (e) {
    console.error(`Unable to render preview: ${(e as Error).message}`);
    rendered = await renderPreview(Template.get("_error"), lines, { style: "default", watermark: watermark || "Error" }, context);
  }
  return image(rendered.bytes, rendered.mimeType, 200, { "cache-control": "no-store" });
}

/** Cache key for a rendered image: the request URL, plus the API key (hashed) when one is sent. */
export function cacheKeyFor(app: AppContext): Request {
  const key = new URL(app.request.url);
  const apiKey = app.request.headers.get("x-api-key");
  if (apiKey) key.searchParams.set("__k", sha1Hex(apiKey));
  return new Request(key.toString(), { method: "GET" });
}

export function edgeCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default ?? null;
  } catch {
    return null;
  }
}

export async function renderImageResponse(
  app: AppContext,
  id: string,
  slug = "",
  watermark = "",
  extension = "",
): Promise<Response> {
  extension = extension || app.settings.DEFAULT_STATIC_EXTENSION;
  console.info(`Rendering image: ${app.request.url}`);

  const cacheable = app.settings.CACHE_TTL > 0 && !app.settings.DEBUG;
  const cache = cacheable ? edgeCache() : null;
  const cacheKey = cacheKeyFor(app);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      console.info("Serving cached image");
      return hit;
    }
  }

  let lines = decode(slug);
  let status = Number.parseInt(String(arg(app.params, "200", "status")), 10) || 200;
  const frames = Number.parseInt(app.params.get("frames") ?? "0", 10) || 0;
  let style = app.params.getAll("style").filter(Boolean).join(",") || "default";

  const animated = ANIMATED_EXTENSIONS.has(extension);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    console.error(`Invalid extension: ${extension}`);
    extension = app.settings.DEFAULT_STATIC_EXTENSION;
    status = 422;
  }

  const encoder = new TextEncoder();
  let template: Template;
  if (slug.split("/").some((part) => encoder.encode(part).length > 200)) {
    console.error(`Slug too long: ${slug}`);
    slug = slug.slice(0, 50) + "...";
    lines = decode(slug);
    template = Template.get("_error");
    style = "default";
    status = 414;
  } else if (id === "custom") {
    let url = app.params.get("background");
    if (url) {
      url = clean(url);
      template = await Template.create(url, { host: app.url.host, cacheTtl: app.settings.CACHE_TTL });
      if (!template.hasImage) {
        console.error(`Unable to download image URL: ${url}`);
        template = Template.get("_error");
        if (url !== PLACEHOLDER) status = 415;
      }
    } else {
      console.error("No image URL specified for custom template");
      template = Template.get("_error");
      style = "default";
      status = 422;
    }
  } else {
    const found = Template.getOrNull(id);
    if (!found || !found.hasImage) {
      console.error(`No such template: ${id}`);
      template = Template.get("_error");
      if (id !== PLACEHOLDER) status = 404;
    } else {
      template = found;
    }
  }

  const color = app.params.get("color");
  let hasInvalidColor = false;
  if (color && status < 400) {
    for (const value of color.split(",").filter(Boolean)) {
      const [, valid] = validateColor(value);
      if (!valid) {
        console.error(`Invalid color: ${color}`);
        hasInvalidColor = true;
        status = 422;
        break;
      }
    }
  }

  if (status < 400 || (status === 422 && hasInvalidColor)) {
    template = template.clone(app.params, lines.length, style, { animated });
    if (!(await template.check(style, { cacheTtl: app.settings.CACHE_TTL }))) {
      if (schema(style)) {
        status = 415;
      } else if (style !== PLACEHOLDER) {
        console.error(`Invalid style: ${style}`);
        status = 422;
      }
    }
  } else {
    template = template.clone(new URLSearchParams(), lines.length, "default", { animated });
  }

  let fontName = app.params.get("font") ?? "";
  if (fontName === PLACEHOLDER) {
    fontName = "";
  } else if (!Font.getOrNull(fontName)) {
    console.error(`Invalid font: ${fontName}`);
    fontName = "";
    status = 422;
  }

  let size: [number, number];
  const widthParam = app.params.get("width") ?? "0";
  const heightParam = app.params.get("height") ?? "0";
  const width = /^-?\d+$/.test(widthParam) ? Number.parseInt(widthParam, 10) : NaN;
  const height = /^-?\d+$/.test(heightParam) ? Number.parseInt(heightParam, 10) : NaN;
  if (Number.isNaN(width) || Number.isNaN(height) || (0 < width && width < 10) || (0 < height && height < 10)) {
    console.error(`Invalid size: (${widthParam}, ${heightParam})`);
    size = [0, 0];
    status = 422;
  } else {
    size = [Math.max(0, width), Math.max(0, height)];
  }

  if (status < 400) {
    app.ctx.waitUntil(meta.track(app, lines).catch((e) => console.error(e)));
  }

  const context = { assets: app.env.ASSETS, debug: app.settings.DEBUG };
  const options = { lines, watermark, fontName, extension, style, size, maximumFrames: frames };
  let rendered;
  try {
    rendered = await renderMeme({ template, ...options }, context);
  } catch (e) {
    if (e instanceof MissingBackgroundError || e instanceof ImageDecodeError || e instanceof RangeError) {
      console.error(`Unable to render image: ${(e as Error).message}`);
    } else {
      console.error(`Unable to render text: ${(e as Error).stack ?? e}`);
    }
    if (status < 400) status = 422;
    rendered = await renderMeme(
      { template: Template.get("_error").clone(new URLSearchParams(), lines.length), ...options, style: "default" },
      context,
    );
  }

  const headers: Record<string, string> = {};
  if (status === 200 && cacheable) {
    headers["cache-control"] = `public, max-age=${app.settings.CACHE_TTL}`;
  } else {
    headers["cache-control"] = "no-store";
  }
  const response = image(rendered.bytes, rendered.mimeType, status, headers);
  if (cache && status === 200) {
    app.ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((e) => console.error(e)));
  }
  return response;
}

/** Port of `app/views/images.py`. */
import type { AppContext } from "../context";
import * as helpers from "../helpers";
import { json, redirect } from "../response";
import { ANIMATED_EXTENSIONS } from "../settings";
import * as meta from "../utils/meta";
import { normalize as normalizeSlug } from "../utils/text";
import { add, buildUrl, clean, flag, normalize as normalizeUrl, without } from "../utils/urls";
import { generateUrl, readPayload, renderImageResponse } from "./helpers";

export async function index(app: AppContext): Promise<Response> {
  const query = (app.params.get("filter") ?? "").toLowerCase();
  const examples = helpers.getExampleImages(app, query);
  return json(examples.map(([url, template]) => ({ url, template })));
}

export async function create(app: AppContext): Promise<Response> {
  return generateUrl(app, "", { templateIdRequired: true });
}

export async function createAutomatic(app: AppContext): Promise<Response> {
  const payload = await readPayload(app.request);
  if (!("text" in payload)) {
    return json({ error: '"text" is required' }, 400);
  }
  const query = String(payload.text);
  const safe = payload.safe === undefined ? true : Boolean(payload.safe);

  const results = await meta.search(app, query, safe);
  console.info(`Found ${results.length} result(s)`);
  if (!results.length) {
    return json({ message: `No results matched: ${query}` }, 404);
  }

  let url = normalizeUrl(results[0].image_url, app.settings.BASE_URL);
  const generator = results[0].generator;
  const confidence = results[0].confidence;
  console.info(`Top result: ${url} (generator=${generator} confidence=${confidence})`);
  [url] = await meta.tokenize(app, url);

  if (payload.redirect) {
    return redirect(add(url, { status: "201" }));
  }
  return json({ url, generator, confidence }, 201);
}

export async function createCustom(app: AppContext): Promise<Response> {
  return generateUrl(app);
}

export async function indexCustom(app: AppContext): Promise<Response> {
  const query = (app.params.get("filter") ?? "").toLowerCase();
  const safe = flag(app.params, "safe", true) ?? true;

  const results = await meta.search(app, query, safe, "results");
  console.info(`Found ${results.length} result(s)`);
  if (!results.length) {
    return json({ message: `No results matched: ${query}` }, 404);
  }

  const items = [];
  for (const result of results) {
    let url = normalizeUrl(result.image_url, app.settings.BASE_URL);
    [url] = await meta.tokenize(app, url);
    items.push({ url });
  }
  return json(items);
}

function splitExtension(filename: string): [string, string] {
  const index = filename.lastIndexOf(".");
  return [filename.slice(0, index), filename.slice(index + 1)];
}

export async function detailBlank(app: AppContext, templateFilename: string): Promise<Response> {
  const [templateId, extension] = splitExtension(templateFilename);

  if (app.params.get("style") === "animated" && !ANIMATED_EXTENSIONS.has(extension)) {
    const url = buildUrl("", `/images/${templateId}.gif`, without(app.params, "style"));
    return redirect(clean(url), 301);
  }

  return renderImageResponse(app, templateId, "", "", extension);
}

export async function detailText(app: AppContext, templateId: string, textFilepath: string): Promise<Response> {
  const [textPaths, extension] = splitExtension(textFilepath);

  if (app.params.get("style") === "animated" && !ANIMATED_EXTENSIONS.has(extension)) {
    const url = buildUrl("", `/images/${templateId}/${textPaths}.gif`, without(app.params, "style"));
    return redirect(clean(url), 301);
  }

  const [slug, slugUpdated] = normalizeSlug(textPaths);
  if (slugUpdated) {
    const url = buildUrl("", `/images/${templateId}/${slug}.${extension}`, app.params);
    return redirect(clean(url), 301);
  }

  const [tokenized, tokenUpdated] = await meta.tokenize(app, app.request.url);
  if (tokenUpdated) {
    return redirect(tokenized, 302);
  }

  const [watermark, watermarkUpdated] = await meta.getWatermark(app);
  if (watermarkUpdated) {
    const url = buildUrl("", `/images/${templateId}/${slug}.${extension}`, without(app.params, "watermark"));
    return redirect(clean(url), 302);
  }

  return renderImageResponse(app, templateId, slug, watermark, extension);
}

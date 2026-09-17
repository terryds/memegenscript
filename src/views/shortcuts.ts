/** Port of `app/views/shortcuts.py`: redirects for legacy and shorthand URLs. */
import type { AppContext } from "../context";
import { Template } from "../models/template";
import { error, html, redirect } from "../response";
import { gallery } from "../utils/html";
import { buildUrl, clean, flag } from "../utils/urls";

export async function examplePath(app: AppContext, templateId: string): Promise<Response> {
  templateId = clean(templateId);
  const template = Template.getOrNull(templateId);

  if (template && template.valid) {
    let url = template.buildExampleUrl(app.settings, { external: false });
    if (app.settings.DEBUG) url = url.replace(/\.png$/, "");
    return redirect(url);
  }

  if (app.settings.DEBUG) {
    const message = templateId.includes("<")
      ? `Replace ${JSON.stringify(templateId)} in the URL`
      : `Template not fully implemented: templates/${templateId}`;
    console.warn(message);
    return error(501, message);
  }

  return error(404, `Template not found: ${templateId}`);
}

export async function legacyExampleImage(app: AppContext, templateFilename: string): Promise<Response> {
  const index = templateFilename.lastIndexOf(".");
  const templateId = templateFilename.slice(0, index);
  const extension = templateFilename.slice(index + 1);
  const template = Template.getOrNull(templateId);
  if (template) {
    return redirect(template.buildExampleUrl(app.settings, { extension, external: false }));
  }
  return error(404, `Template not found: ${templateId}`);
}

export async function legacyExamplePath(_app: AppContext, templateId: string): Promise<Response> {
  return redirect(`/images/${templateId.replace(/^\/+|\/+$/g, "")}`);
}

const TEXT_FILEPATH = /^[^/].*\.\w+$/;

export async function customPath(app: AppContext, templateId: string, textPaths: string): Promise<Response> {
  if (templateId === "images") {
    return redirect(`/images/${textPaths}`.replace(/\/$/, ""));
  }

  let params = new URLSearchParams();
  textPaths = clean(textPaths);
  if (textPaths.includes("&")) {
    console.warn(`Fixing query string: ${textPaths}`);
    const [path, queryString] = textPaths.split(/&(.*)/s);
    textPaths = path;
    params = new URLSearchParams(queryString);
  } else if (textPaths.includes("//")) {
    console.warn(`Truncating path: ${textPaths}`);
    textPaths = textPaths.split("//")[0];
  } else if (textPaths.endsWith("/")) {
    console.warn(`Fixing trailing slash: ${textPaths}`);
    textPaths = textPaths.replace(/\/+$/, "");
  } else if (textPaths.endsWith('"')) {
    console.warn(`Fixing trailing quote: ${textPaths}`);
    textPaths = textPaths.replace(/"+$/, "");
  }

  if (textPaths.startsWith(".")) {
    return redirect(`/images/${templateId}${textPaths}`);
  }

  if (!TEXT_FILEPATH.test(textPaths)) {
    console.warn(`Handling missing extension: ${textPaths}`);
    textPaths += app.settings.DEFAULT_SUFFIX;
  }
  const url = buildUrl("", `/images/${templateId}/${textPaths}`, params);

  if (!app.settings.DEBUG) {
    return redirect(url);
  }

  const animated = flag(app.params, "animated");
  const extension = animated ? app.settings.DEFAULT_ANIMATED_EXTENSION : app.settings.DEFAULT_STATIC_EXTENSION;
  const base = textPaths.replace(/\.\w+$/, "");
  const content = gallery([`/images/${templateId}/${base}.${extension}`], {
    columns: false,
    refresh: animated ? 30 : 3,
    queryString: app.url.search.replace(/^\?/, ""),
  });
  return html(content);
}

export async function legacyCustomImage(_app: AppContext, templateId: string, textPaths: string): Promise<Response> {
  const template = Template.getOrNull(templateId);
  if (template) {
    return redirect(`/images/${templateId}/${textPaths}`);
  }
  return error(404, `Template not found: ${templateId}`);
}

export async function legacyCustomPath(_app: AppContext, templateId: string, textPaths: string): Promise<Response> {
  if (templateId === "images") {
    return redirect(`/images/${textPaths}`.replace(/\/$/, ""));
  }
  return redirect(`/images/${templateId}/${textPaths}`);
}

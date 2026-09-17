/** Port of `app/views/clients.py`. */
import type { AppContext } from "../context";
import { json } from "../response";
import * as meta from "../utils/meta";
import { previewImage } from "./helpers";

export async function validate(app: AppContext): Promise<Response> {
  const info = await meta.authenticate(app);
  const valid = Object.keys(info).length > 0;
  return json(valid ? info : { error: "API key missing or invalid." }, valid ? 200 : 401);
}

export async function preview(app: AppContext): Promise<Response> {
  const id = app.params.get("template") ?? "_error";
  const lines = app.params.getAll("text[]").length ? app.params.getAll("text[]") : app.params.getAll("lines[]");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let style = app.params.get("style") || app.params.getAll("styles[]").join(",");
  while (style.endsWith(",default")) style = style.slice(0, -",default".length);
  return previewImage(app, id, style, lines);
}

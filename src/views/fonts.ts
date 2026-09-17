/** Port of `app/views/fonts.py`. */
import type { AppContext } from "../context";
import { Font } from "../models/font";
import { error, json } from "../response";

export async function index(app: AppContext): Promise<Response> {
  return json(Font.all().map((font) => font.toJSON(app.settings.BASE_URL)));
}

export async function detail(app: AppContext, id: string): Promise<Response> {
  const font = Font.getOrNull(id);
  if (!font) return error(404, `Font not found: ${id}`);
  return json(font.toJSON(app.settings.BASE_URL));
}

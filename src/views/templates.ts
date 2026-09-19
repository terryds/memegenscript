/** Port of `app/views/templates.py`. */
import type { AppContext } from "../context";
import * as helpers from "../helpers";
import { Template } from "../models/template";
import { error, json } from "../response";
import { flag } from "../utils/urls";
import { generateUrl } from "./helpers";

export async function index(app: AppContext): Promise<Response> {
  // `q` is the full-text search of the web pages (aliases, tags, description), for clients
  // that describe a meme instead of naming it; results carry the description to choose by
  const search = (app.params.get("q") ?? "").trim();
  if (search) {
    const matched = Template.filterValid().filter((t) => t.matchesText(search));
    return json(matched.map((t) => ({ ...t.toJSON(app.settings), aliases: t.aka, description: t.about })));
  }
  const query = (app.params.get("filter") ?? "").toLowerCase();
  const animated = flag(app.params, "animated");
  return json(helpers.getValidTemplates(app, query, animated));
}

export async function detail(app: AppContext, id: string): Promise<Response> {
  const template = Template.getOrNull(id);
  if (template) return json(template.toJSON(app.settings));
  return error(404, `Template not found: ${id}`);
}

export async function build(app: AppContext, id: string): Promise<Response> {
  return generateUrl(app, id);
}

export async function custom(app: AppContext): Promise<Response> {
  return generateUrl(app);
}

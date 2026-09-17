/** Port of `app/views/templates.py`. */
import type { AppContext } from "../context";
import * as helpers from "../helpers";
import { Template } from "../models/template";
import { error, json } from "../response";
import { flag } from "../utils/urls";
import { generateUrl } from "./helpers";

export async function index(app: AppContext): Promise<Response> {
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

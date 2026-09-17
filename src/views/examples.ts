/** Port of `app/views/examples.py`. */
import type { AppContext } from "../context";
import * as helpers from "../helpers";
import { html } from "../response";
import { gallery } from "../utils/html";

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function display(app: AppContext, items: Array<[string, string]>): Response {
  let urls = items.map((item) => item[0]);
  let refresh: number;
  if (app.settings.DEBUG) {
    refresh = Number.parseInt(app.params.get("refresh") ?? "", 10) || 5 * 60;
  } else {
    refresh = 0;
    urls = shuffle(urls);
  }
  return html(gallery(urls, { columns: true, refresh }));
}

export async function examples(app: AppContext): Promise<Response> {
  return display(app, helpers.getExampleImages(app));
}

export async function examplesAnimated(app: AppContext): Promise<Response> {
  return display(app, helpers.getExampleImages(app, "", { animated: true }));
}

export async function examplesStatic(app: AppContext): Promise<Response> {
  return display(app, helpers.getExampleImages(app, "", { animated: false }));
}

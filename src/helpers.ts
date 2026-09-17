/** Port of `app/helpers.py`. */
import type { AppContext } from "./context";
import { Template } from "./models/template";
import { ANIMATED_EXTENSIONS, TEST_IMAGES } from "./settings";
import { encode } from "./utils/text";
import { flag } from "./utils/urls";

export function getValidTemplates(app: AppContext, query = "", animated: boolean | null = null) {
  let templates = Template.filterValid();
  if (query) templates = templates.filter((t) => t.matches(query));
  if (animated === true) {
    templates = templates.filter((t) => t.styles.includes("animated"));
  } else if (animated === false) {
    templates = templates.filter((t) => !t.styles.includes("animated"));
  }
  return templates.map((t) => t.toJSON(app.settings));
}

export function getExampleImages(
  app: AppContext,
  query = "",
  { animated = null }: { animated?: boolean | null } = {},
): Array<[string, string]> {
  let templates = Template.filterValid();
  if (query) templates = templates.filter((t) => t.matches(query));

  let exact: boolean;
  if (animated === null) {
    animated = flag(app.params, "animated");
    exact = true;
  } else {
    exact = false;
  }

  const images: Array<[string, string]> = [];
  for (const template of templates) {
    const isAnimated = template.styles.includes("animated");
    if (exact && animated === true && !isAnimated) continue;
    if (exact && animated === false && isAnimated) continue;

    let extension: string;
    if (animated === true) {
      extension = app.settings.DEFAULT_ANIMATED_EXTENSION;
    } else if (isAnimated && animated !== false) {
      extension = app.settings.DEFAULT_ANIMATED_EXTENSION;
    } else {
      extension = app.settings.DEFAULT_STATIC_EXTENSION;
    }

    images.push([template.buildExampleUrl(app.settings, { extension }), template.buildSelfUrl(app.settings)]);
  }
  return images;
}

export function getTestImages(app: AppContext): string[] {
  const animated = flag(app.params, "animated");
  const images = animated ? TEST_IMAGES.filter((image) => ANIMATED_EXTENSIONS.has(image[2])) : TEST_IMAGES;
  return images.map(([id, lines, extension]) => `/images/${id}/${encode(lines)}.${extension}`);
}

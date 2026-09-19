/**
 * The OpenAPI document that sanic-ext generated from the `@openapi` decorators
 * in the Python views, reproduced by hand.
 */
import type { Settings } from "../settings";
import { VERSION } from "../settings";

const dedent = (s: string) => s.replace(/^\n/, "").replace(/^ {8}/gm, "").trimEnd();

const STYLE_PARAM = {
  name: "style",
  in: "query",
  schema: { type: "string" },
  description: dedent(`
        Alternate visual variant from the template's \`styles\` array, OR an HTTPS
        URL to use as a custom overlay image. For templates with \`overlays > 1\`,
        may be repeated to set each slot independently. Unknown style names return
        HTTP 422, not the default render.
        `),
};

const FONT_PARAM = {
  name: "font",
  in: "query",
  schema: { type: "string" },
  description: dedent(`
        Font \`id\` or \`alias\` overriding the template default (\`GET /fonts/\`).
        Unknown values return HTTP 422; the image still renders with the template
        default font.
        `),
};

const LAYOUT_PARAM = {
  name: "layout",
  in: "query",
  schema: { type: "string" },
  description: dedent(`
        Text layout mode. Allowed values are defined by the API; \`top\` places all
        text at the image top rather than the template's default regions.
        `),
};

const WIDTH_PARAM = {
  name: "width",
  in: "query",
  schema: { type: "integer" },
  description: dedent(`
        Output width in pixels. If both \`width\` and \`height\` are supplied, the image
        is padded to fit while preserving aspect ratio. Values between 1 and 9 are
        rejected with HTTP 422.
        `),
};

const HEIGHT_PARAM = {
  name: "height",
  in: "query",
  schema: { type: "integer" },
  description: "Output height in pixels. See `width` for combined behavior.",
};

const COLOR_PARAM = {
  name: "color",
  in: "query",
  schema: { type: "string" },
  description: dedent(`
        Comma-separated colors, one per text line in order (\`color=red,blue\`
        colors the first line red and the second blue). Each value is an HTML color
        name or hex code (with or without a leading \`#\`). Lines without a value
        keep the template's color.
        `),
};

const BACKGROUND_PARAM = {
  name: "background",
  in: "query",
  schema: { type: "string" },
  description: "Custom background image URL. Composes with `style=<url>` overlays.",
};

const CENTER_PARAM = {
  name: "center",
  in: "query",
  schema: { type: "string" },
  description: dedent(`
        Comma-separated \`<x>,<y>\` fractional coordinates (0.0 to 1.0) for overlay center
        within its slot. Most useful with \`style=<url>\`.
        `),
};

const SCALE_PARAM = {
  name: "scale",
  in: "query",
  schema: { type: "number" },
  description: "Multiplier applied to the overlay's default size. Most useful with `style=<url>`.",
};

const FRAMES_PARAM = {
  name: "frames",
  in: "query",
  schema: { type: "integer" },
  description: dedent(`
        Maximum number of frames to render in animated output. 0 (default) means no
        cap. Use this to bound response size and render time on long animations.
        `),
};

const STATUS_PARAM = {
  name: "status",
  in: "query",
  schema: { type: "integer" },
  description: dedent(`
        Override the HTTP response status code. Primarily used internally by the
        \`POST /images/\` → redirect flow to propagate a \`201 Created\` semantic to the
        final image fetch. Most clients should not need to set this directly.
        `),
};

const IMAGE_QUERY_PARAMS = [
  STYLE_PARAM,
  FONT_PARAM,
  LAYOUT_PARAM,
  WIDTH_PARAM,
  HEIGHT_PARAM,
  COLOR_PARAM,
  BACKGROUND_PARAM,
  CENTER_PARAM,
  SCALE_PARAM,
  FRAMES_PARAM,
  STATUS_PARAM,
];

const imageResponse = (description: string) => ({
  description,
  content: { "image/*": { schema: { type: "string", format: "binary" } } },
});

const jsonResponse = (description: string, schema: unknown) => ({
  description,
  content: { "application/json": { schema } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (name: string) => ({ type: "array", items: ref(name) });
const body = (name: string) => ({ content: { "application/json": { schema: ref(name) } } });

export function buildOpenApi(settings: Settings): Record<string, unknown> {
  const base = settings.BASE_URL;
  const description = dedent(`
        ## Quickstart

        Fetch the list of templates:

        \`\`\`
        $ http GET ${base}/templates

        [
            {
                "id": "aag",
                "name": "Ancient Aliens Guy",
                "lines": 2,
                "overlays": 0,
                "source": "http://knowyourmeme.com/memes/ancient-aliens",
                ...
            },
            ...
        ]
        \`\`\`

        Add text to create a meme:

        \`\`\`
        $ http POST ${base}/images template_id=aag "text[]=foo" "text[]=bar"

        {
            "url": "${base}/images/aag/foo/bar.png"
        }
        \`\`\`

        View the image: <${base}/images/aag/foo/bar.png>

        ## Links
        `);

  const paths: Record<string, unknown> = {
    "/auth": {
      post: {
        operationId: "clients.validate",
        summary: "Validate your API key",
        tags: ["Clients"],
        responses: {
          200: jsonResponse("Your API key is valid", ref("AuthResponse")),
          401: jsonResponse("Your API key is invalid", ref("ErrorResponse")),
        },
      },
    },
    "/images/preview.jpg": {
      get: {
        operationId: "clients.preview",
        summary: "Display a preview of a custom meme",
        tags: ["Clients"],
        parameters: [
          { name: "text[]", in: "query", schema: { type: "string" }, description: "Lines of text to render" },
          { name: "style", in: "query", schema: { type: "string" }, description: "Style name or custom overlay" },
          { name: "template", in: "query", schema: { type: "string" }, description: "Template ID, URL, or custom background" },
          { name: "layout", in: "query", schema: { type: "string" }, description: "Text position: `default` or `top`" },
        ],
        responses: {
          200: {
            description: "Successfully displayed a custom meme",
            content: { "image/jpeg": { schema: { type: "string", format: "binary" } } },
          },
        },
      },
    },
    "/fonts": {
      get: {
        operationId: "fonts.index",
        summary: "List available fonts",
        tags: ["Fonts"],
        description: dedent(`
        Fonts available for the \`font=\` query parameter on path-based image
        endpoints. Each entry has an \`id\` and an optional \`alias\`.
        `),
        responses: { 200: jsonResponse("Successfully returned a list of fonts", arrayOf("FontResponse")) },
      },
    },
    "/fonts/{id}": {
      get: {
        operationId: "fonts.detail",
        summary: "View a specific font",
        tags: ["Fonts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "ID of a font" }],
        responses: {
          200: jsonResponse("Successfully returned a specific font", ref("FontResponse")),
          404: { description: "Font not found" },
        },
      },
    },
    "/images": {
      get: {
        operationId: "images.index",
        summary: "List example memes",
        tags: ["Images"],
        parameters: [
          { name: "filter", in: "query", schema: { type: "string" }, description: "Part of the template name or example to match" },
        ],
        responses: { 200: jsonResponse("Successfully returned a list of example memes", arrayOf("ExampleResponse")) },
      },
      post: {
        operationId: "images.create",
        summary: "Create a meme from a template",
        tags: ["Images"],
        description: dedent(`
        Create a meme by \`POST\`ing raw text. The response includes a canonical
        \`url\` field with path escaping applied — prefer this over hand-built
        \`GET\` URLs when text contains spaces or reserved characters.

        Body fields:
        - \`template_id\`: Template to render (\`GET /templates/\`).
        - \`text\`: Lines of text in order (raw, not escape-encoded). Up to the
          template's \`lines\` value; pass an empty string for an empty intermediate
          line.
        - \`style\`: Style names from the template's \`styles\` field, or HTTPS URLs
          for custom overlay images. When \`overlays\` > 1, the array sets each slot.
        - \`extension\`: Output image extension.
        - \`redirect\`: If true, returns 302 to the canonical URL instead of JSON.
        `),
        requestBody: body("MemeRequest"),
        responses: {
          201: jsonResponse("Successfully created a meme", ref("MemeResponse")),
          400: jsonResponse('Required "template_id" missing in request body', ref("ErrorResponse")),
          404: jsonResponse('Specified "template_id" does not exist', ref("ErrorResponse")),
        },
      },
    },
    "/images/custom": {
      get: {
        operationId: "images.index_custom",
        summary: "List popular custom memes",
        tags: ["Images"],
        parameters: [
          { name: "safe", in: "query", schema: { type: "boolean" }, description: "Exclude NSFW results" },
          { name: "filter", in: "query", schema: { type: "string" }, description: "Part of the meme's text to match" },
        ],
        responses: { 200: jsonResponse("Successfully returned a list of custom memes", arrayOf("MemeResponse")) },
      },
      post: {
        operationId: "images.create_custom",
        summary: "Create a meme from any image",
        tags: ["Images"],
        requestBody: body("CustomRequest"),
        responses: { 201: jsonResponse("Successfully created a meme from a custom image", ref("MemeResponse")) },
      },
    },
    "/images/{template_filename}": {
      get: {
        operationId: "images.detail_blank",
        summary: "Display a template background",
        tags: ["Images"],
        parameters: [
          {
            name: "template_filename",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: dedent(`
        Template ID and image format: \`<template_id>.<extension>\`. This is the
        canonical empty-template render and matches the \`blank\` field on
        \`GET /templates/{id}\`. Use this when a client just wants the background.
        The same query parameters as \`/images/{template_id}/{text_filepath}\`
        apply.
        `),
          },
          ...IMAGE_QUERY_PARAMS,
        ],
        responses: {
          200: imageResponse("Successfully displayed a template background"),
          404: imageResponse("Template not found"),
          415: imageResponse("Unable to download image URL"),
          422: imageResponse("Invalid style for template or no image URL specified for custom template"),
        },
      },
    },
    "/images/{template_id}/{text_filepath}": {
      get: {
        operationId: "images.detail_text",
        summary: "Display a custom meme",
        tags: ["Images"],
        parameters: [
          { name: "template_id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" },
          {
            name: "text_filepath",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: dedent(`
        Lines of text and output extension:
        \`<line1>/<line2>/.../<line_n>.<extension>\`, where \`n\` is at most the
        template's \`lines\` value (\`GET /templates/{id}\`). Trailing lines may be
        omitted; pass \`_\` for an empty intermediate line. Path segments must be
        escape-encoded; prefer \`POST /images/\` with raw \`text\` and use the
        canonical \`url\` from the response.
        `),
          },
          ...IMAGE_QUERY_PARAMS,
        ],
        responses: {
          200: imageResponse("Successfully displayed a custom meme"),
          404: imageResponse("Template not found"),
          414: imageResponse("Custom text too long (length >200)"),
          415: imageResponse("Unable to download image URL"),
          422: imageResponse("Invalid style for template or no image URL specified for custom template"),
        },
      },
    },
    "/templates": {
      get: {
        operationId: "templates.index",
        summary: "List all templates",
        tags: ["Templates"],
        description: dedent(`
        The full list of renderable templates. For URL construction, the four
        load-bearing fields per template are \`id\` (goes into the path after
        \`/images/\`), \`lines\` (maximum number of \`/\`-separated text segments
        accepted in the path), \`overlays\` (number of overlay image slots the
        template defines), and \`styles\` (allowed values for the \`style=\` query
        parameter). The remaining fields are descriptive: \`name\` for display,
        \`blank\` for the empty-template render URL, \`example.url\` for a
        guaranteed-valid smoke-test URL, \`source\` for attribution, and
        \`keywords\` for search. Recommended client pattern: fetch this endpoint
        once at startup, cache, and construct URLs locally rather than per-meme.
        `),
        parameters: [
          { name: "animated", in: "query", schema: { type: "boolean" }, description: "Limit results to templates supporting animation" },
          { name: "filter", in: "query", schema: { type: "string" }, description: "Part of the name, keyword, or example to match" },
          { name: "q", in: "query", schema: { type: "string" }, description: "Full-text search: every word must appear in the name, aliases, tags, example, or description. Results also include `aliases` and `description`." },
        ],
        responses: { 200: jsonResponse("Successfully returned a list of all templates", arrayOf("TemplateResponse")) },
      },
    },
    "/templates/custom": {
      post: {
        operationId: "templates.custom",
        summary: "Create a meme from any image",
        tags: ["Templates"],
        requestBody: body("CustomRequest"),
        responses: { 201: jsonResponse("Successfully created a meme from a custom image", ref("MemeResponse")) },
      },
    },
    "/templates/{id}": {
      get: {
        operationId: "templates.detail",
        summary: "View a specific template",
        tags: ["Templates"],
        description: dedent(`
        Per-template metadata. The four URL-construction fields are \`id\`,
        \`lines\`, \`overlays\`, and \`styles\`; see \`GET /templates/\` for what each
        one governs. The \`example.url\` field is a guaranteed-valid render URL —
        issuing a \`HEAD\` against it is the cheapest way to validate that the
        template id is live.
        `),
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" }],
        responses: {
          200: jsonResponse("Successfully returned a specific template", ref("TemplateResponse")),
          404: { description: "Template not found" },
        },
      },
      post: {
        operationId: "templates.build",
        summary: "Create a meme from a template",
        tags: ["Templates"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" }],
        requestBody: body("MemeTemplateRequest"),
        responses: { 201: jsonResponse("Successfully created a meme from a template", ref("MemeResponse")) },
      },
    },
    "/images/{template_id}": {
      get: {
        operationId: "shortcuts.example_path",
        summary: "Redirect to an example image",
        tags: ["Shortcuts"],
        parameters: [{ name: "template_id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" }],
        responses: {
          302: imageResponse("Successfully redirected to an example image"),
          404: { description: "Template not found" },
          501: { description: "Template not fully implemented" },
        },
      },
    },
    "/{template_id}": {
      get: {
        operationId: "shortcuts.legacy_example_path",
        summary: "Redirect to an example image",
        tags: ["Shortcuts"],
        parameters: [{ name: "template_id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" }],
        responses: { 302: imageResponse("Successfully redirected to an example image") },
      },
    },
    "/images/{template_id}/{text_paths}": {
      get: {
        operationId: "shortcuts.custom_path",
        summary: "Redirect to a custom image",
        tags: ["Shortcuts"],
        parameters: [
          { name: "template_id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" },
          { name: "text_paths", in: "path", required: true, schema: { type: "string" }, description: "Lines of text: `<line1>/<line2>`" },
        ],
        responses: { 302: imageResponse("Successfully redirected to a custom image") },
      },
    },
    "/{template_id}/{text_paths}": {
      get: {
        operationId: "shortcuts.legacy_custom_path",
        summary: "Redirect to a custom image",
        tags: ["Shortcuts"],
        parameters: [
          { name: "template_id", in: "path", required: true, schema: { type: "string" }, description: "ID of a meme template" },
          { name: "text_paths", in: "path", required: true, schema: { type: "string" }, description: "Lines of text: `<line1>/<line2>`" },
        ],
        responses: {
          302: imageResponse("Successfully redirected to a custom image"),
          404: { description: "Template not found" },
        },
      },
    },
  };

  if (settings.REMOTE_TRACKING_URL) {
    paths["/images/automatic"] = {
      post: {
        operationId: "images.create_automatic",
        summary: "Create a meme from word or phrase",
        tags: ["Images"],
        requestBody: body("AutomaticRequest"),
        responses: {
          201: jsonResponse("Successfully created a meme", ref("MemeResponse")),
          400: jsonResponse('Required "text" missing in request body', ref("ErrorResponse")),
        },
      },
    };
  }

  const str = { type: "string" };
  const bool = { type: "boolean" };
  const strings = { type: "array", items: str };

  return {
    openapi: "3.0.3",
    info: {
      title: "Memegenscript",
      version: VERSION,
      description,
      contact: { name: "memegenscript" },
      license: { name: "MIT" },
    },
    servers: [{ url: base }],
    security: [{ ApiKeyAuth: [] }],
    paths,
    components: {
      securitySchemes: { ApiKeyAuth: { type: "apiKey", name: "X-API-KEY", in: "header" } },
      schemas: {
        AuthResponse: {
          type: "object",
          properties: {
            email: str,
            image_access: bool,
            search_access: bool,
            created: { type: "string", format: "date-time" },
            modified: { type: "string", format: "date-time" },
          },
        },
        FontResponse: { type: "object", properties: { filename: str, id: str, alias: str, _self: str } },
        MemeRequest: {
          type: "object",
          properties: { template_id: str, style: strings, text: strings, layout: str, font: str, extension: str, redirect: bool },
        },
        CustomRequest: {
          type: "object",
          properties: { background: str, style: str, text: strings, layout: str, font: str, extension: str, redirect: bool },
        },
        MemeTemplateRequest: {
          type: "object",
          properties: { style: strings, text: strings, layout: str, font: str, extension: str, redirect: bool },
        },
        AutomaticRequest: { type: "object", properties: { text: str, safe: bool, redirect: bool } },
        MemeResponse: { type: "object", properties: { url: str } },
        ExampleResponse: { type: "object", properties: { url: str, template: str } },
        TemplateResponse: {
          type: "object",
          properties: {
            id: str,
            name: str,
            lines: { type: "integer" },
            overlays: { type: "integer" },
            styles: strings,
            blank: str,
            example: { type: "object", properties: { text: strings, url: str } },
            source: str,
            keywords: strings,
            _self: str,
          },
        },
        ErrorResponse: { type: "object", properties: { error: str } },
      },
    },
  };
}

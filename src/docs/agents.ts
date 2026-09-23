/**
 * The guide for AI agents. One markdown source: served raw at `/llms.txt` and
 * `/agents.md`, and rendered into the site layout at `/agents`.
 */
import { escapeHtml } from "../pages/html";
import type { Settings } from "../settings";

export function agentGuideMarkdown(settings: Settings, templateCount: number): string {
  const base = settings.BASE_URL;
  const site = settings.SITE_NAME;
  return `# ${site} for AI agents

> ${site} is a free meme generator where every meme is a URL. There is no API key and no signup. If you can write a URL or send one JSON request, you can make a meme from any of ${templateCount} templates.

This guide is written for AI agents and the people who build them. The raw markdown lives at ${base}/llms.txt. The OpenAPI document is at ${base}/docs/openapi.json.

## Make a meme in one request

Send the raw text and let the server do the escaping:

\`\`\`
POST ${base}/images
Content-Type: application/json

{"template_id": "drake", "text": ["Paying for a meme API", "Writing a URL & done"]}
\`\`\`

The response is \`201\` with the finished image URL:

\`\`\`
{"url": "${base}/images/drake/paying_for_a_meme_api/writing_a_url_~a_done.png"}
\`\`\`

That URL is the meme. Use it as it is: embed it, post it, or download the bytes. The same URL always renders the same image, and rendered images are cached, so reuse a URL instead of creating it again.

## Choose a template

Search by describing the meme or the situation. Every word must match the template's name, aliases, tags, example text, or description:

\`\`\`
GET ${base}/templates?q=guy+looking+at+girl
\`\`\`

Each result has what you need to choose and to build the meme:

| Field | Meaning |
| --- | --- |
| \`id\` | The template ID. It goes after \`/images/\` and in \`template_id\` |
| \`name\`, \`aliases\` | What people call the meme |
| \`description\` | What the meme shows and when it is used. Read this to check the joke fits |
| \`lines\` | The number of text slots. Send at most this many strings |
| \`example.text\` | A caption that works, which shows what goes in each slot |
| \`example.url\` | A rendered example. It is guaranteed to work |
| \`styles\` | Allowed values for \`style=\` |

If nothing matches, try fewer or different words: search for the feeling (\`regret\`, \`choice\`, \`panic\`) and not only the picture. \`GET ${base}/templates\` returns every template without descriptions (about 200 KB), and \`GET ${base}/templates/{id}\` returns one.

## Write text that fits

- The order of the \`text\` array is the order of the slots. Look at \`example.text\` to see which slot is which: on \`drake\` the first string is the rejected option and the second is the preferred one.
- Keep each line short, about 60 characters or less. Text shrinks to fit its box, so long lines become hard to read.
- Use an empty string to leave a slot blank, for example \`["", "bottom text only"]\`.
- Text is drawn in uppercase on most templates.
- Emoji work, either as the character or as a shortcode such as \`:thumbsup:\`.

## Build the URL yourself

You can skip the \`POST\` and write the URL directly:

\`\`\`
${base}/images/{id}/{line_1}/{line_2}.{ext}
\`\`\`

\`{ext}\` is \`png\`, \`jpg\`, \`gif\`, or \`webp\`. Escape each line with these rules:

| Character | Write it as |
| --- | --- |
| space | \`_\` |
| underscore \`_\` | \`__\` |
| dash \`-\` | \`--\` |
| \`?\` | \`~q\` |
| \`&\` | \`~a\` |
| \`%\` | \`~p\` |
| \`#\` | \`~h\` |
| \`/\` | \`~s\` |
| \`\\\` | \`~b\` |
| \`<\` and \`>\` | \`~l\` and \`~g\` |
| \`"\` | \`''\` (two single quotes) |
| line break | \`~n\` |
| empty line | a single \`_\` as the whole segment |

Example: \`${base}/images/fry/not_sure_if_bug/or_feature~q.png\`

If the text has any punctuation, prefer the \`POST\`. It applies these rules for you.

## Options

Add these as query parameters to any image URL, including a URL that the \`POST\` returned:

| Option | Effect |
| --- | --- |
| \`width=800\`, \`height=800\` | Output size in pixels. With both, the image is padded to fit |
| \`font=impact\` | Another font. The list is at \`GET ${base}/fonts\` |
| \`color=white,yellow\` | Text color for each line, as a color name or a hex code |
| \`style=NAME\` | A variant of the template, from its \`styles\` list |
| \`layout=top\` | Put all the text at the top of the image |

The \`POST\` body also accepts \`font\`, \`style\`, \`layout\`, and \`extension\`, and puts them in the URL for you.

The extension sets the format: \`png\` and \`jpg\` are still images, \`gif\` and \`webp\` are animated. Templates with an \`animated\` style default to \`gif\`, which is larger and slower to render. Send \`"extension": "png"\` when you want a still image.

## Use your own image

Put text on any image with the \`custom\` template:

\`\`\`
POST ${base}/images/custom
Content-Type: application/json

{"background": "https://example.com/photo.jpg", "text": ["top text", "bottom text"]}
\`\`\`

The image URL must be public. Keep the image small: a large photo is slow to download and render.

## Meme characters (transparent PNGs)

Besides captioned templates, the site has classic meme characters (Doge, Wojak, Pepe, Trollface, Gigachad, …) cut out as transparent PNGs, for stickers, overlays, and images you compose yourself:

\`\`\`
GET ${base}/characters?q=frog
\`\`\`

Each result has \`id\`, \`name\`, \`aliases\`, \`description\`, \`width\`, \`height\`, the \`image\` URL of the PNG, and \`templates\` (the meme templates the character appears in). The image URL is \`${base}/characters/{id}.png\`; add \`?width=400\` or \`?height=400\` to resize (the aspect ratio is kept). The background is transparent, so put the PNG on your own image or colour. \`GET ${base}/characters\` lists all of them and \`GET ${base}/characters/{id}\` returns one. People can browse them at ${base}/meme-characters.

## Post it

- Platforms that show link previews, and chat apps such as Discord or Slack, render the URL as an image. Send the URL.
- Platforms that need an upload: \`GET\` the URL, then upload the bytes. The content type is \`image/png\`, \`image/jpeg\`, \`image/gif\`, or \`image/webp\`, to match the extension.
- To let a person adjust the result, send them to the editor page for the template: \`${base}/memes/{id}\`.

## Errors

Check the HTTP status code. A failed image URL still returns an image (a picture of the error) with the error status, so a \`200\` is the only proof that the meme rendered. A \`POST\` with an unknown \`template_id\` returns \`404\` together with a \`url\`. Do not use that URL.

| Status | Cause | What to do |
| --- | --- | --- |
| 404 | Unknown template ID | Search \`/templates?q=\` again. Do not guess IDs |
| 414 | A text line is longer than 200 bytes | Shorten the line |
| 415 | A custom image URL could not be downloaded | Check that the URL is public and is an image |
| 422 | Unknown \`style\`, \`font\`, \`color\`, or extension, or a \`width\` or \`height\` under 10 | Use values from the template's \`styles\` and from \`/fonts\` |

## Rules of the road

- The service is free and shared. Cache the template search results you use, reuse the URLs you have made, and do not render in bulk what you will not post.
- Template images belong to their respective owners. You are responsible for what you post.
- Missing a template? Ask for it${settings.REQUEST_TEMPLATE_URL ? `: ${settings.REQUEST_TEMPLATE_URL}` : settings.REPO_URL ? `: ${settings.REPO_URL}/issues` : " on the site"}

## Instructions to give your agent

Paste this into your agent's system prompt or skill file:

\`\`\`
You can make memes with ${site} (${base}). No API key is needed.
1. Find a template: GET ${base}/templates?q=<words describing the meme or the situation>.
   Read "description" and "example.text" to check that the joke fits. Note "id" and "lines".
2. Create the meme: POST ${base}/images with JSON
   {"template_id": "<id>", "text": ["<slot 1>", "<slot 2>"]}
   Send at most "lines" strings, each about 60 characters or less.
3. The response {"url": "..."} is the finished image. Post that URL, or download it to upload.
Never invent a template ID. Only a 201 from the POST and a 200 from the image URL mean success. Full guide: ${base}/llms.txt
\`\`\`
`;
}

// --- Markdown → HTML (only the subset the guide uses) -----------------------------

function inline(text: string): string {
  // Backticks split the text into prose (even parts) and code (odd parts); only prose gets links
  return text
    .split("`")
    .map((part, index) =>
      index % 2
        ? `<code>${escapeHtml(part)}</code>`
        : escapeHtml(part)
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,:])/g, '$1<a href="$2">$2</a>'),
    )
    .join("");
}

function tableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/** Renders headings (from `##`), paragraphs, quotes, lists, tables, and fenced code. The `#` title is dropped. */
export function renderGuideHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("# ")) {
      i++;
    } else if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    } else if (line.startsWith("## ")) {
      const title = line.slice(3);
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h2 id="${id}">${inline(title)}</h2>`);
      i++;
    } else if (line.startsWith("> ")) {
      out.push(`<p class="lede">${inline(line.slice(2))}</p>`);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++) rows.push(tableRow(lines[i]));
      const [head, , ...body] = rows;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^(- |\d+\. )/.test(lines[i]); i++) items.push(lines[i].replace(/^(- |\d+\. )/, ""));
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    } else {
      const paragraph: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(```|## |> |\||- |\d+\. )/.test(lines[i]); i++) paragraph.push(lines[i]);
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

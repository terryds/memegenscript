# Revision History

## 11.3

- Added a server-rendered meme editor page for every template at `/memes/{id}`,
  a searchable template index at `/`, `sitemap.xml`, and an SEO-oriented `robots.txt`.
- The editor is a client-side canvas editor: draggable/resizable/rotatable text boxes
  with per-box fonts, sizes, colors and outlines, image layers, custom backgrounds,
  undo/redo, PNG/JPG export and shareable links.
- Added `/assets/templates/...`, `/assets/fonts/...` and `/proxy/image` for the editor.
- Corrected the `color` parameter documentation: values apply per text line.
- Every template page now describes the meme (summary, origin, alternate names, tags)
  using Know Your Meme excerpts or hand-written entries, and the site search matches
  descriptions and aliases, not just names.
- Static assets are cache-busted by content hash; pages are not cached in local dev.

## 11.2

- TypeScript port of memegen 11.2 for Cloudflare Workers with feature parity:
  all routes, query parameters, response shapes, redirects, status codes,
  Swagger docs, example galleries, fonts, styles, overlays, custom backgrounds,
  animated GIF/WebP output, previews, watermarks, and emoji.
